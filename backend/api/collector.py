'''
continuously watch events from a single log and write changes to the api and the local database.

Collector  --POST-->  /api/collect (REST)  --writes-->  SQLite
                            |
                            └--broadcasts-->  /ws/collector (WebSocket)  -->  Frontend
'''

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers.polling import PollingObserver as Observer  # PollingObserver bypasses Windows ReadDirectoryChangesW bug
import os
import sys
from time import sleep
import requests
from classifier import parse_and_sort  # original didn't parse before sending

WRITE_DB_URL_ENDPOINT = "http://localhost:8000/api/collect"  # was posting to /ws/parse (a WebSocket, not a REST endpoint)
POLL_INTERVAL = 1


def send_to_api(events: list):  # now sends a parsed list of event dicts
    try:
        resp = requests.post(WRITE_DB_URL_ENDPOINT, json=events, timeout=5)
        print(f"[collector] sent {len(events)} events -> {resp.status_code}")
    except requests.ConnectionError as e:
        print(f"[collector] FastAPI unreachable: {e}")

class eventHandler(FileSystemEventHandler):
    def __init__(self, log_name: str):
        self.log_abs_path = os.path.abspath(log_name)
        with open(self.log_abs_path, 'r') as f:
            f.seek(0, 2)  # go to end of file
            self.position = f.tell()  # remember the position
        print(f'[collector] monitoring: {self.log_abs_path}')
    
    def on_modified(self, event) -> None:
        if event.src_path == self.log_abs_path:
            with open(self.log_abs_path, 'r') as f:
                f.seek(self.position)  # start from where we left off
                new_data = f.read()
                self.position = f.tell()  # update position
            if new_data:
                result = parse_and_sort(new_data)        # parse raw log text into structured events
                parsed_logs = result.get("logs", [])     # extract parsed log list
                if parsed_logs:
                    send_to_api(parsed_logs)             # prev: `send_to_api({"content": new_data})` -> now sends parsed list

def run_observer(log_name):
    log_directory = os.path.dirname(os.path.abspath(log_name))

    handler = eventHandler(log_name)
    observer = Observer()

    observer.schedule(handler, log_directory, recursive=False)
    observer.start()
    try:
        while True:
            sleep(1)
    finally:
        observer.stop()
        observer.join()

# prev: hardcoded `run_observer('backend/dummy-logs/evil_1000.log')` -> now supports CLI arg, env var, or sensible default
if __name__ == '__main__':
    if len(sys.argv) > 1:
        log_path = sys.argv[1]
    else:
        log_path = os.environ.get(
            'VIGIL_LOG_PATH',
            os.path.join(os.path.dirname(__file__), '..', '..', 'dummy-site', 'logs', 'access.log')
        )
    run_observer(log_path)