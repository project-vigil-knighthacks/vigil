#collect logs from various sources (e.g., system logs, application logs,
#network logs) and store them in a centralized location for further processing and analysis
from time import sleep # for pausing between log collection cycles
import requests # for sending http requests to fastapi server
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer
from grokmoment import parse_logs_by_excerpt
import argparse

FASTAPI_SERVER_URL = "http://localhost:8000/api/collect" # URL of the FastAPI server to send logs to
POLL_INTERVAL = 1


def send_to_api(events: list):
        requests.post(FASTAPI_SERVER_URL, json=events )

# uses watchdog class to seperate logic in files for better architecture -nick
class eventHandler(FileSystemEventHandler):
    def __init__(self, log: str):
        self.log = log
        with open(self.log, 'r') as f:
            f.seek(0, 2)  # go to end of file
            self.position = f.tell()  # remember the position
        print('waiting for event...')
    
    def on_modified(self, event) -> None:
        print(f"detected: {event.src_path}")
        if event.src_path == f'.\\{self.log}':
            with open(self.log, 'r') as f:
                f.seek(self.position)  # start from where we left off
                new_lines = f.readlines()
                self.position = f.tell()  # update position
                print(f"new lines detected: {len(new_lines)}")
            if new_lines:
                events = parse_logs_by_excerpt(new_lines)
                print(f"new lines detected: {len(new_lines)}")
                print(events)



def main():
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
