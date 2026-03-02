from pygrok import Grok
import json
from datetime import datetime
import argparse
from time import sleep
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

# CONFIGURABLE OBJECTS
VARIABLES = ["timestamp", "host", "proc", "pid", "severity", "facility",
        "login", "target_user", "auth_method", "login_status", "src_ip",
        "dst_ip", "src_port", "dst_port", "url", "domain", "path", "uri",
        "hash", "hash_algo", "signature", "command", "args", "session_id",
        "request_id", "trace_id", "status_code", "bytes_sent", "bytes_recv", "duration", "tty", "pwd"]
LLM_REASONING_EFFORT = "low"

parser = argparse.ArgumentParser(description="GrokTime - Log Parser")
parser.add_argument("-l", "--log", help="Log to pass into parser")
parser.add_argument("-o", "--output", help="Output json file (default: out.json)")
parser.add_argument("-p", "--patterns", help="The pattern json file to parse through (default: patterns.json)")
args = parser.parse_args()

class LLMCalls:
    def __init__(self):
        self.instantiated = False
        self.prompt = self._build_prompt()

    def _get_client(self):
        from openai import OpenAI
        self.client = OpenAI()
        self.instantiated = True

    # only have to do this once
    def _build_prompt(self) -> str:
        return f"""You produce Grok patterns to parse individual log lines using Python's pygrok library.

                Only use field names from this list: {", ".join(VARIABLES)}

                Rules:
                - Choose the most specific appropriate Grok pattern for each field (e.g. INT for ports and pids, IP for addresses, USERNAME for logins, PATH for file paths, SYSLOGTIMESTAMP for syslog timestamps).
                - Prefer WORD over DATA. Use DATA only when a field may contain spaces and is bounded by clear delimiters on both sides.
                - Use GREEDYDATA only at the end of a pattern.
                - Treat known literal words in the log line as literals in the pattern, not as fields to capture.
                - Escape literal square brackets with a backslash: \\[ and \\].
                - Return the Grok pattern in the pattern field and an explanation in the note field.
                - Use HOSTNAME never HOST
                """

    def call_api(self, log_string: str) -> str:
        self._get_client() if not self.instantiated else ''

        response = self.client.responses.create(
        model="gpt-5-mini",
        input=[
            {"role": "system", "content": self.prompt},
            {"role": "user", "content": log_string},
            ],
        text={
            "format": {
            "type": "json_schema",
            "name": "grok",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                "pattern": {
                    "type": "string",
                    "description": "A single Grok pattern string using %{PATTERN:name} syntax."
                },
                "note": {
                    "type": "string",
                    "description": "Explanation of pattern construction decisions."
                }
                },
                "required": [
                "pattern", "note"
                ],
                "additionalProperties": False
            }
            },
            "verbosity": "medium"
        },
        reasoning={"effort": LLM_REASONING_EFFORT},
        store=True,
        include=[
            "reasoning.encrypted_content"
        ]
        )
        response = response.output_text # the string output of the api response
        return json.loads(response)["pattern"] # the parsed dictionary version of the expected schema output in object "pattern"

class grokMatcher(LLMCalls):
    def __init__(self, grok_patterns_file: str):
        super().__init__()
        self.grok_patterns_file = grok_patterns_file
        with open(grok_patterns_file, 'r') as f:
            self.pattern_dict = json.load(f)['patterns']
        self.pattern_list = [p for p in self.pattern_dict]
        self.pygrok_object_list = [Grok(p) for p in self.pattern_list]

    def handle_new_formats(self, log_string: str) -> tuple[dict | None, str | None, Grok | None]:
        new_grok_pattern = self.call_api(log_string)
        try:
            pygrok_object = Grok(new_grok_pattern)
        except KeyError as e:
            print(f"KeyError: {e} is not valid. Retrying...")
            return None, None, None
        grok_match = pygrok_object.match(log_string)
        return grok_match, new_grok_pattern, pygrok_object

    # loop through grok list to find the first match
    def match_grok_pattern(self, log_line: str) -> dict | None:
        grok_match = None
        for obj in self.pygrok_object_list:
            grok_match = obj.match(log_line) # match log line to pygrok object
            if grok_match:
                return grok_match
            else:
                continue

        if not grok_match:
            try:
                for i in range(3): # retry 3 times in case api gets the parsing wrong (grok_match == None)
                    print('retrying api call...'  if i >0 else 'new format found...')
                    grok_match, grok_pattern, pygrok_object = self.handle_new_formats(log_line)
                    if grok_match and grok_pattern and pygrok_object:
                        self.pattern_list.append(grok_pattern)
                        self.pygrok_object_list.append(pygrok_object)
                        return grok_match
            except Exception as e:
                return None

class fileHandler:
    def __init__(self, grok_matcher: grokMatcher):
        self.grok_matcher = grok_matcher

    # append new pattern to master file, lets do this periodically instead of every call maybe?
    def append_master_file(self) -> None:
        with open(self.grok_matcher.grok_patterns_file, 'r+') as f:
            f.seek(0) # move the cursor to the beginning of the file
            json.dump(self.grok_matcher.pattern_dict, f, indent=4) # dump the appended pattern to the json file
            return

class logProcessor:
    def __init__(self, grok_patterns_file: str, output: str):
        self.grok_matcher = grokMatcher(grok_patterns_file=grok_patterns_file)
        self.file_handler = fileHandler(self.grok_matcher)
        self.grok_patterns_file = grok_patterns_file
        self.output = output
        self.events = dict()

    def send_to_api(self, json_object: dict) -> None:
        print(json_object)

    # a log of logs? maybe this is dumb
    def write_to_json(self) -> None:
        with open(self.output, 'w') as f:
            json.dump(self.events, f, indent=4)
        print('json wrote to file! ☑')

    # highly problematic
    def convert_to_unix_time(self, timestamp: str) -> float | str:
        current_year = datetime.now().year

        # True if year must be implied
        # False otherwise
        formats = [
            ("%d/%b/%Y:%H:%M:%S %z", False),
            ("%b %d %H:%M:%S", True),
        ]

        for fmt, needs_year in formats:
            try:
                timestamp_str = f"{current_year} {timestamp}" if needs_year else timestamp
                fmt_str = f"%Y {fmt}" if needs_year else fmt
                dt = datetime.strptime(timestamp_str, fmt_str)
                return dt.timestamp()
            except ValueError:
                continue

        print('failed to convert timestamp')
        return timestamp

    def process(self, log_excerpt: list[str]) -> None:
        for i, entry in enumerate(log_excerpt): # reads each new log entry
            entry = entry.rstrip()
            grok_match = self.grok_matcher.match_grok_pattern(entry)
            if grok_match:
                new_timestamp = self.convert_to_unix_time(grok_match["timestamp"])
                grok_match.update({"timestamp": new_timestamp})
                self.events[i] = grok_match
            else:
                print(f'Error parsing line. Skipping.')
                continue
            self.send_to_api(grok_match)
        return

            
class eventHandler(FileSystemEventHandler):
    def __init__(self, log: str, output: str='out.json', grok_patterns_file: str='patterns.json'):
        self.processor = logProcessor(grok_patterns_file, output)
        self.log = log

        with open(self.log, 'r') as f:
            self.pre = [line.rstrip() for line in f] # maybe handling for very large logs

        print('waiting for event...')

    def on_modified(self, event) -> None:
        if event.src_path == f'./{self.log}':
            with open(self.log, 'r') as f:
                now = [line.rstrip() for line in f]
                now = now[-250:]
                if now != self.pre:
                    pass
                else:
                    return
                now = set(now) - set(self.pre)
                now = list(now)
                self.processor.process(log_excerpt=now)
                f.seek(0) # go back to the beginning of the file to redefine pre
                pre = [line.rstrip() for line in f]
                self.pre = pre[-250:] # hold last 250 lines
                print('waiting for event...')


if __name__=="__main__":
    log = args.log
    output = args.output
    patterns = args.patterns
    if output and patterns:
        event_handler = eventHandler(log=log, output=output, grok_patterns_file=patterns)
    elif output and not patterns:
        event_handler = eventHandler(log=log, output=output)
    elif not output and patterns:
        event_handler = eventHandler(log=log, grok_patterns_file=patterns)
    elif not output and not patterns:
        event_handler = eventHandler(log=log)
        if not log:
            parser.error("-l is required. Use python3 main.py -h to see a list of arguments.")
    observer = Observer()
    observer.schedule(event_handler, ".", recursive=True)
    observer.start()
    try:
        while True:
            sleep(1)
    finally:
        observer.stop()
        observer.join()