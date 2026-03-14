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

FASTAPI_SERVER_URL = "http://localhost:8000/api/collect" # URL of the FastAPI server to send logs to
POLL_INTERVAL = 1

# sends parsed events to FastAPI so they're accessible from the dashboard
# instead of inline SQLite, now imports from database.py module to write to SQLite and also sends to FastAPI, - Zayne
# if the frontend is already polling the database through the api, what exactly is this doing? - Mike
def send_to_api(events: list):
    try:
        requests.post(FASTAPI_SERVER_URL, json=events)
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
                results = parse_and_sort(new_data)
                write_events(results.get('logs'))
                for result in results.get('logs'):
                    send_to_api(result)

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
# run_observer('vigil/backend/dummy-logs/evil_1000.log')