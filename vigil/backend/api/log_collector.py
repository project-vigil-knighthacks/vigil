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

class eventHandler(FileSystemEventHandler):
    def __init__(self, log: str):
        self.log = log

        with open(self.log, 'r') as f:
            self.pre = [line.rstrip() for line in f] # maybe handling for very large logs

        print('waiting for event...')
    
    # grabbed from mikes parser and has  been edited to seperate logic in files for better architecture -nick
    def on_modified(self, event) -> None:
        if event.src_path == f'./{self.log}':
            with open(self.log, 'r') as f:
                now = [line.rstrip() for line in f]
                now = now[-250:]
                if now == self.pre:
                    return
                now = set(now) - set(self.pre)
                now = list(now)
                # this process will no longer call itself instead it will call the parser function using parser import
                events = parse_logs_by_excerpt(now)
                pre = [line.rstrip() for line in f]
                self.pre = pre[-250:] # hold last 250 lines
                print(events)
                send_to_api(events)



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
