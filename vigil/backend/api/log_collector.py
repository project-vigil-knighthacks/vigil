#collect logs from various sources (e.g., system logs, application logs,
#network logs) and store them in a centralized location for further processing and analysis
import os
from time import sleep # for pausing between log collection cycles
import requests # for sending http requests to fastapi server
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer
from log_parse import parse_logs
import argparse
from database import init_db, write_events

FASTAPI_SERVER_URL = "http://localhost:8000/api/collect" # URL of the FastAPI server to send logs to
POLL_INTERVAL = 1


# sends parsed events to FastAPI so they're accessible from the dashboard
# instead of inline SQLite, now imports from database.py module to write to SQLite and also sends to FastAPI, - Zayne
def send_to_api(events: list):
    try:
        requests.post(FASTAPI_SERVER_URL, json=events)
    except requests.ConnectionError as e:
        print(f"FastAPI error: {e}")


# uses watchdog class to seperate logic in files for better architecture -nick
class eventHandler(FileSystemEventHandler):
    def __init__(self, log: str):
        self.log = os.path.abspath(log)
        with open(self.log, 'r') as f:
            f.seek(0, 2)  # go to end of file
            self.position = f.tell()  # remember the position
        print('monitoring events...')
    
    def on_modified(self, event) -> None:
        # compare absolute paths so this works regardless of how watchdog reports the event
        if os.path.abspath(event.src_path) == self.log:
            with open(self.log, 'r') as f:
                f.seek(self.position)  # start from where we left off
                new_lines = f.readlines()
                self.position = f.tell()  # update position
            if new_lines:
                # parse through log_parse which handles API key presence/absence gracefully
                content = "".join(new_lines)
                result = parse_logs(content)
                events = result.get("logs", [])
                # write to both SQLite and the FastAPI server
                write_events(events)
                send_to_api(events)


def main():
    init_db()
    #parse CLI
    parser = argparse.ArgumentParser(description="Log Collection Agent and Manager")
    parser.add_argument("-l", "--log", help="Pass log path")
    args = parser.parse_args()
    log = args.log

    #create handler class and observer
    handler = eventHandler(log)
    observer = Observer()
    # Check handle in current directory, dont check subdir
    observer.schedule(handler, ".", recursive=False)
    observer.start()
    try:
        while True:
            sleep(1)
    finally:
        observer.stop()
        observer.join()

#import check
if __name__ == "__main__":
    main()