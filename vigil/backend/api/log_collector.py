#collect logs from various sources (e.g., system logs, application logs,
#network logs) and store them in a centralized location for further processing and analysis
import time # for pausing between log collection cycles
import requests # for sending http requests to fastapi server
import os # for log file handling
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer
from grokmoment import parse_logs

FASTAPI_SERVER_URL = "http://localhost:8000/api/collect" # URL of the FastAPI server to send logs to
POLL_INTERVAL = 1


# Function continuously scans for new log input from the .log file location - Nick
def follow(filepath: str):
    with open(filepath, "r") as f:
        f.seek(0,2)
        while True:
            line = f.readline()
            if not line:
                time.sleep(POLL_INTERVAL)
                continue
            if line:
                yield line.strip()

class eventHandler(FileSystemEventHandler):
    def __init__(self, log: str, output: str='out.json', grok_patterns_file: str='patterns.json'):
        self.processor = logProcessor(grok_patterns_file, output)
        self.log = log

        with open(self.log, 'r') as f:
            self.pre = [line.rstrip() for line in f] # maybe handling for very large logs

        print('waiting for event...')

# Stolen from mikes parser because we are seperating logic in files for better architecture -nick

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
                events = parse_logs(now)
                f.seek(0) # go back to the beginning of the file to redefine pre
                pre = [line.rstrip() for line in f]
                self.pre = pre[-250:] # hold last 250 lines
                print('waiting for event...')

#WIP
def send_to_api(line: str):
    requests.post(FASTAPI_SERVER_URL, )

