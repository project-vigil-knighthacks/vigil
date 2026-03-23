'''
continuously watch events from a single log and write changes to the api (?) and the local database.
'''

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer
import os
from time import sleep
import requests
from classifier import parse_and_sort
from database import write_events

WRITE_DB_URL_ENDPOINT = "http://localhost:8000/api/collect"
WEBSOCKET_URL_ENDPOINT = "http://localhost:8000/ws/parse"
POLL_INTERVAL = 1


def send_to_api(events: dict):
    try:
        requests.post(WEBSOCKET_URL_ENDPOINT, json=events)
        requests.post(WRITE_DB_URL_ENDPOINT, json=events)
    except requests.ConnectionError as e:
        print(f"FastAPI error: {e}")

class eventHandler(FileSystemEventHandler):
    def __init__(self, log_name: str):
        self.log_abs_path = os.path.abspath(log_name)
        with open(self.log_abs_path, 'r') as f:
            f.seek(0, 2)  # go to end of file
            self.position = f.tell()  # remember the position
        print('monitoring events...')
    
    def on_modified(self, event) -> None:
        if event.src_path == self.log_abs_path:
            with open(self.log_abs_path, 'r') as f:
                f.seek(self.position)  # start from where we left off
                new_data = f.read()
                self.position = f.tell()  # update position
            if new_data:
                send_to_api({"content": new_data})

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

# debug
run_observer('backend/dummy-logs/evil_1000.log')