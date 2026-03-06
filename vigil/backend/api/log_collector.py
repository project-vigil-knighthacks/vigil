#collect logs from various sources (e.g., system logs, application logs,
#network logs) and store them in a centralized location for further processing and analysis
import time # for pausing between log collection cycles
import requests # for sending http requests to fastapi server
import os # for log file handling

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

#WIP
def send_to_api(line: str):
    requests.post(FASTAPI_SERVER_URL, )

