"""
Log parsing utilities for Vigil SIEM.
Uses inlined grokmoment for Grok-based log parsing.
Supports parsing without API key, but flags unmatched logs.
"""
import os
import json
from typing import Dict, Any, List
from datetime import datetime
from pygrok import Grok

# Path to patterns file bundled in the backend
PATTERNS_FILE = os.path.join(os.path.dirname(__file__), 'data', 'patterns.json')


def has_api_key() -> bool:
    """Check if OpenAI API key is available."""
    return bool(os.environ.get('OPENAI_API_KEY'))


def load_patterns() -> List[Grok]:
    """Load compiled Grok patterns from patterns.json."""
    with open(PATTERNS_FILE, 'r') as f:
        data = json.load(f)
    return [Grok(p) for p in data.get('patterns', [])]


def match_with_patterns(log_line: str, patterns: List[Grok]) -> dict | None:
    """Try to match a log line against existing patterns."""
    for grok in patterns:
        result = grok.match(log_line)
        if result:
            return result
    return None


def parse_logs(content: str) -> Dict[str, Any]:
    """
    Parse log content using Grok patterns.
    If API key is available, uses grokmoment for auto-learning.
    Otherwise, only matches against existing patterns and flags unmatched.
    """
    lines = content.strip().split('\n')
    parsed_events = []
    unmatched_lines = []
    api_key_available = has_api_key()
    
    if api_key_available:
        # Use full grokmoment with LLM pattern generation
        from grokmoment import parse_logs_by_excerpt
        parsed_events = parse_logs_by_excerpt(lines, patterns_file=PATTERNS_FILE)
    else:
        # Parse with existing patterns only (no LLM)
        patterns = load_patterns()
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            result = match_with_patterns(line, patterns)
            if result:
                parsed_events.append(result)
            else:
                unmatched_lines.append(line)
                # Include raw line as unmatched entry
                parsed_events.append({
                    "raw": line,
                    "unmatched": True,
                    "severity": "unknown"
                })
    
    # Add severity classification based on parsed fields
    for event in parsed_events:
        if event.get('unmatched'):
            continue
        if 'severity' not in event:
            login_status = str(event.get('login_status', '')).lower()
            proc = str(event.get('proc', '')).lower()
            
            if any(word in login_status for word in ['failed', 'invalid', 'error', 'denied']):
                event['severity'] = 'warning'
            elif 'ban' in proc or 'fail2ban' in proc:
                event['severity'] = 'critical'
            elif 'backdoor' in str(event.get('login', '')).lower():
                event['severity'] = 'critical'
            else:
                event['severity'] = 'info'
    
    result = {
        "format": "syslog",
        "count": len(parsed_events),
        "logs": parsed_events,
        "parsed_at": datetime.utcnow().isoformat() + "Z",
        "api_key_available": api_key_available,
    }
    
    # Add warning if there are unmatched lines and no API key
    if unmatched_lines and not api_key_available:
        result["unmatched_count"] = len(unmatched_lines)
        result["api_key_required"] = True
        result["api_key_message"] = (
            f"{len(unmatched_lines)} log line(s) did not match any known patterns. "
            "Set OPENAI_API_KEY environment variable to enable automatic pattern generation."
        )
    
    return result