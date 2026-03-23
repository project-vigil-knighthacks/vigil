"""
Grok-based log parser for Vigil SIEM.
Inlined from grokmoment (https://github.com/mdunn99/grokmoment) — MIT License.

When a log line doesn't match any known Grok pattern and an OpenAI API key is
available, grokmoment generates a new pattern via LLM and persists it for
future use.
"""
from pygrok import Grok
import json
import os
import threading
import concurrent.futures
from dataclasses import dataclass
from dotenv import dotenv_values

VARIABLES = [
    "timestamp", "host", "proc", "pid", "severity", "facility",
    "login", "target_user", "auth_method", "login_status", "src_ip",
    "dst_ip", "src_port", "dst_port", "url", "domain", "path", "uri",
    "hash", "hash_algo", "signature", "command", "args", "session_id",
    "request_id", "trace_id", "status_code", "bytes_sent", "bytes_recv",
    "duration", "tty", "pwd",
]
MODEL = "gpt-5-mini"
LLM_REASONING_EFFORT = "low"
QUEUE_MAX_ATTEMPTS = 5

base = os.path.dirname(os.path.abspath(__file__))
patterns_path = os.path.join(base, "data", "patterns.json")


@dataclass
class QueueEntry:
    line: str
    attempts: int = 0

class LLMCalls:
    def __init__(self):
        global OPENAI_API_KEY
        OPENAI_API_KEY = dotenv_values(".env").get('OPENAI_API_KEY')
        from openai import OpenAI
        try:
            self.client = OpenAI(api_key=OPENAI_API_KEY)
        except Exception as e:
            print(e)
        self.prompt = self._build_prompt()

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

    def get_pattern(self, log_string: str) -> str:
        response = self.client.responses.create(
            model=MODEL,
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
                        "required": ["pattern", "note"],
                        "additionalProperties": False
                    }
                }
            },
            reasoning={"effort": LLM_REASONING_EFFORT},
            store=True,
            include=["reasoning.encrypted_content"]
        )
        return json.loads(response.output_text)["pattern"]


class PatternStore:
    def __init__(self, patterns_file: str):
        self.patterns_file = patterns_file
        with open(patterns_file, 'r') as f:
            self._data = json.load(f)
        self._lock = threading.Lock()

    @property
    def patterns(self) -> list[str]:
        with self._lock:
            # Return a copy to avoid exposing internal state
            return list(self._data["patterns"])

    def add(self, pattern: str) -> None:
        with self._lock:
            self._data["patterns"].append(pattern)

    def save(self) -> None:
        with self._lock:
            data = self._data
        with open(self.patterns_file, 'r+') as f:
            f.seek(0)
            json.dump(data, f, indent=4)
            f.truncate()


class GrokMatcher:
    def __init__(self, store: PatternStore, llm: LLMCalls):
        self.store = store
        self.llm = llm
        self._compiled_lock = threading.Lock()
        self._compiled: list[Grok] = [Grok(p) for p in store.patterns]
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        self._learning_lock = threading.Lock()
        self._pending_futures: set[concurrent.futures.Future] = set()
        self._pending_inputs: set[str] = set()
        self._queue_lock = threading.Lock()
        self._pending_queue: list[QueueEntry] = []

    def match(self, log_line: str) -> dict | None:
        global OPENAI_API_KEY
        with self._compiled_lock:
            compiled_snapshot = list(self._compiled)
        for grok in compiled_snapshot:
            result = grok.match(log_line)
            if result:
                return result
        if OPENAI_API_KEY:
            self._enqueue_unmatched(log_line)
            self._schedule_learning(log_line)
        return None

    def _enqueue_unmatched(self, log_line: str) -> None:
        with self._queue_lock:
            if any(entry.line == log_line for entry in self._pending_queue):
                return
            self._pending_queue.append(QueueEntry(line=log_line))

    def _schedule_learning(self, log_line: str) -> None:
        with self._learning_lock:
            if log_line in self._pending_inputs:
                return
            future = self._executor.submit(self._learn_and_add, log_line)
            self._pending_inputs.add(log_line)
            self._pending_futures.add(future)
        future.add_done_callback(lambda fut, line=log_line: self._learning_done(fut, line))

    def _matches_now(self, log_line: str) -> bool:
        with self._compiled_lock:
            compiled_snapshot = list(self._compiled)
        for grok in compiled_snapshot:
            if grok.match(log_line):
                return True
        return False

    def _retry_pending_queue(self) -> None:
        with self._queue_lock:
            queue = list(self._pending_queue)
            self._pending_queue.clear()
        still_pending = []
        for entry in queue:
            entry.attempts += 1
            if self._matches_now(entry.line):
                continue
            if entry.attempts < QUEUE_MAX_ATTEMPTS:
                still_pending.append(entry)
            else:
                continue
        with self._queue_lock:
            self._pending_queue.extend(still_pending)

    def _learn_and_add(self, log_line: str) -> None:
        try:
            pattern = self.llm.get_pattern(log_line)
        except Exception:
            return
        try:
            grok = Grok(pattern)
        except KeyError:
            return
        result = grok.match(log_line)
        if not result:
            return
        with self._compiled_lock:
            self._compiled.append(grok)
        self.store.add(pattern)
        self.store.save()
        self._retry_pending_queue()

    def _learning_done(self, future: concurrent.futures.Future, log_line: str) -> None:
        with self._learning_lock:
            self._pending_futures.discard(future)
            self._pending_inputs.discard(log_line)

    @property
    def learning_in_progress(self) -> bool:
        with self._learning_lock:
            return bool(self._pending_futures)


class LogProcessor:
    def __init__(self, matcher: GrokMatcher):
        self.matcher = matcher

    def _is_continuation(self, line: str) -> bool:
        return line.startswith(("\t", "    ")) or line.startswith("Caused by:")

    def _fold(self, lines: str) -> list[str]:
        blocks = []
        current = []
        for line in lines.splitlines():
            line = line.strip()
            if not line:
                continue
            if self._is_continuation(line) and current:
                current.append(line)
            else:
                if current:
                    blocks.append("\n".join(current))
                current = [line]
        if current:
            blocks.append("\n".join(current))
        return blocks

    def process(self, lines: str) -> list[dict]:
        events = []
        for block in self._fold(lines):
            match = self.matcher.match(block)
            if not match:
                print(f"Error parsing block, skipping: {block[:80]!r}")
                events.append(None)
                continue
            events.append(match)
        return events

class Parse:
    def __init__(self, patterns_file: str = patterns_path):
        self.store = PatternStore(patterns_file)
        self.matcher = GrokMatcher(store=self.store, llm=LLMCalls())
        self.processor = LogProcessor(matcher=self.matcher)

    def parse_by_file(self, log_path: str) -> list[dict]:
        with open(log_path, 'r') as f:
            lines = f.read()
        events = self.processor.process(lines)
        self.store.save()
        return events

    def parse_by_excerpt(self, log_excerpt: str) -> tuple[list[dict], str | None, bool]:
        events = self.processor.process(log_excerpt)
        self.store.save()
        return events, OPENAI_API_KEY, self.matcher.learning_in_progress
  
# events, api_available = Parse().parse_by_excerpt('Nov 15 12:34:56 myhost sshd[1234]: Accepted password for admin from 192.168.1.1 port 22')
# (events)
