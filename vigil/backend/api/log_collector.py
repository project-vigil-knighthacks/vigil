# Log Collection Agent

#   Watches a single log file in real time using watchdog (filesystem events).
#   Whenever new lines are appended, it parses them and ships the structured
#   events to two destinations:
#     1. SQLite (via database.py → write_events) — persistent local storage
#     2. FastAPI (via HTTP POST /api/collect)    — makes events queryable live

# Pipeline:

#       (as of latest build)*
#   [Log file in bash*]                         [vigil.db (SQLite)]
#         |                                             ^
#         | file modified (watchdog)                    |
#         v                                     write_events()
#   eventHandler.on_modified()                          |
#         |                                      [database.py]
#         | read new lines                              ^
#         v                                             |
#   log_parse.parse_logs()  ─────────────────────────→ +
#         |                                             |
#         | structured events (list[dict])              |
#         v                                             |
#   send_to_api()  ──→  POST /api/collect  ──→  write_events()
#                            (FastAPI)             [database.py]

# NOTE: write_events() is called TWICE — once directly here and once via
# FastAPI's /api/collect endpoint. This is intentional: the direct write
# ensures events are saved even if FastAPI is down, while the POST keeps
# FastAPI's in-memory state in sync for live dashboard queries.
# If you want to avoid the double-write, remove the direct write_events()
# call here and rely solely on /api/collect. - Zayne

import os
from time import sleep  # for pausing between log collection cycles
import requests         # for sending http requests to fastapi server
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer
from log_parse import parse_logs
import argparse
from database import init_db, write_events

FASTAPI_SERVER_URL = "http://localhost:8000/api/collect"  # URL of the FastAPI server to send logs to
POLL_INTERVAL = 1


def send_to_api(events: list):
    """
    HTTP POST the parsed events to FastAPI's /api/collect endpoint.

    Why POST to FastAPI when we already wrote to SQLite directly?
    FastAPI is the gateway the frontend uses - POSTing here keeps the
    live event feed consistent without the frontend needing to poll SQLite.

    ConnectionError is caught silently so the collector keeps running
    even if the API server isn't up yet. Events are still in SQLite.
    """
    try:
        requests.post(FASTAPI_SERVER_URL, json=events)
    except requests.ConnectionError as e:
        # Non-fatal: SQLite write already happened above. Dashboard will
        # see the events once FastAPI restarts and queries the DB.
        print(f"FastAPI error: {e}")


# uses watchdog class to separate logic in files for better architecture -nick
class eventHandler(FileSystemEventHandler):
    def __init__(self, log: str):
        # Store the absolute path so on_modified comparisons work regardless
        # of how the OS or watchdog reports the event path (relative vs absolute)
        self.log = os.path.abspath(log)

        # Seek to the end of the file on startup so we only capture *new* lines
        # written after the collector starts, not the entire historical file.
        with open(self.log, 'r') as f:
            f.seek(0, 2)       # SEEK_END — jump to end of file
            self.position = f.tell()  # record byte offset so we resume here
        print('monitoring events...')

    def on_modified(self, event) -> None:
        """
        Triggered by watchdog whenever the watched directory sees a file change.
        We filter to only our target file by comparing absolute paths.

        Flow inside this handler:
          1. Open the file and seek to self.position (last-read byte offset)
          2. Read any new lines appended since the last event
          3. Update self.position so the next call doesn't re-read old lines
          4. Parse the new content via log_parse.parse_logs()
             → returns {"logs": [list of structured event dicts], ...}
          5. Write events to SQLite directly via database.write_events()
          6. POST the same events to FastAPI via send_to_api()
        """
        # Guard: watchdog fires for ALL files in the watched directory.
        # Only process events for our specific log file.
        if os.path.abspath(event.src_path) == self.log:
            with open(self.log, 'r') as f:
                f.seek(self.position)   # resume from last-read position
                new_lines = f.readlines()
                self.position = f.tell()  # advance position past the new lines

            if new_lines:
                # join lines back into a single string for parse_logs()
                content = "".join(new_lines)

                # log_parse.parse_logs() handles both cases:
                #   - OPENAI_API_KEY set   > uses grokmoment LLM to auto-generate
                #                            Grok patterns for unrecognized formats
                #
                #   - no API key           > matches only against existing patterns
                #                            in data/patterns.json; unmatched lines
                #                            are tagged {"unmatched": True, "raw": ...}
                result = parse_logs(content)
                events = result.get("logs", [])

                # Write to SQLite first (works even if FastAPI is offline)
                write_events(events)    # → database.py → INSERT INTO events

                # Then notify FastAPI so the live dashboard updates immediately
                send_to_api(events)     # → POST /api/collect → write_events() again


def main():
    # Initialise the database on startup.
    # Creates vigil.db and the events table if they don't exist yet.
    # Safe to call even if the DB already exists (uses IF NOT EXISTS).
    init_db()  # → database.py

    # Parse command-line arguments
    parser = argparse.ArgumentParser(description="Log Collection Agent and Manager")
    parser.add_argument("-l", "--log", help="Pass log path")
    args = parser.parse_args()
    log = args.log

    # Create the watchdog observer and point it at the directory containing
    # the log file. recursive=False means subdirectories are ignored.
    handler = eventHandler(log)
    observer = Observer()
    observer.schedule(handler, ".", recursive=False)  # watch current directory only
    observer.start()
    try:
        while True:
            sleep(1)  # main thread just keeps the observer alive
    finally:
        observer.stop()
        observer.join()


# import check
if __name__ == "__main__":
    main()