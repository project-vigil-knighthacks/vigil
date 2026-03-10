#collect logs from various sources (e.g., system logs, application logs,
#network logs) and store them in a centralized location for further processing and analysis
from time import sleep # for pausing between log collection cycles
import requests # for sending http requests to fastapi server
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer
from grokmoment import parse_logs_by_excerpt
import argparse
import sqlite3

FASTAPI_SERVER_URL = "http://localhost:8000/api/collect" # URL of the FastAPI server to send logs to
POLL_INTERVAL = 1


def send_to_api(events: list):
        requests.post(FASTAPI_SERVER_URL, json=events )


def init_db():
    try:
        conn = sqlite3.connect("vigil.db")
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS events(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            host TEXT,
            proc TEXT,
            pid TEXT,
            severity TEXT,
            facility TEXT,
            login TEXT,
            target_user TEXT,
            auth_method TEXT,
            login_status TEXT,
            src_ip TEXT,
            dst_ip TEXT,
            src_port TEXT,
            dst_port TEXT,
            url TEXT,
            domain TEXT,
            path TEXT,
            uri TEXT,
            hash TEXT,
            hash_algo TEXT,
            signature TEXT,
            command TEXT,
            args TEXT,
            session_id TEXT,
            request_id TEXT,
            trace_id TEXT,
            status_code TEXT,
            bytes_sent TEXT,
            bytes_recv TEXT,
            duration TEXT,
            tty TEXT,
            pwd TEXT
                    )
                    """)
        conn.commit()
    except sqlite3.Error as e:
        print(f"SQLite error: {e}")
    finally:
        conn.close()

def write_to_db(events):
    try:
        conn = sqlite3.connect("vigil.db")
        cursor = conn.cursor()
        for event in events:
            cursor.execute("""
                INSERT INTO events (timestamp, host, proc, pid, severity, facility, login, 
                target_user, auth_method, login_status, src_ip, dst_ip, src_port, dst_port, 
                url, domain, path, uri, hash, hash_algo, signature, command, args, session_id, 
                request_id, trace_id, status_code, bytes_sent, bytes_recv, duration, tty, pwd)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event.get('timestamp'), event.get('host'), event.get('proc'),
                event.get('pid'), event.get('severity'), event.get('facility'),
                event.get('login'), event.get('target_user'), event.get('auth_method'),
                event.get('login_status'), event.get('src_ip'), event.get('dst_ip'),
                event.get('src_port'), event.get('dst_port'), event.get('url'),
                event.get('domain'), event.get('path'), event.get('uri'),
                event.get('hash'), event.get('hash_algo'), event.get('signature'),
                event.get('command'), event.get('args'), event.get('session_id'),
                event.get('request_id'), event.get('trace_id'), event.get('status_code'),
                event.get('bytes_sent'), event.get('bytes_recv'), event.get('duration'),
                event.get('tty'), event.get('pwd')
            ))
        conn.commit()
    except sqlite3.Error as e:
        print(f"SQLite error: {e}")
    finally:
        conn.close()


# uses watchdog class to seperate logic in files for better architecture -nick
class eventHandler(FileSystemEventHandler):
    def __init__(self, log: str):
        self.log = log
        with open(self.log, 'r') as f:
            f.seek(0, 2)  # go to end of file
            self.position = f.tell()  # remember the position
        print('monitoring events...')
    
    def on_modified(self, event) -> None:
        if event.src_path == f'.\\{self.log}':
            with open(self.log, 'r') as f:
                f.seek(self.position)  # start from where we left off
                new_lines = f.readlines()
                self.position = f.tell()  # update position
            if new_lines:
                events = parse_logs_by_excerpt(new_lines)
                write_to_db(events)



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
