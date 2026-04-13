'''
take grokmoment parse and add additional attributes/classification
+
identify severity and such
'''

import os
from grokmoment import Parse
from datetime import datetime
from timestamps import normalize_event_timestamp

PATTERNS_FILE = os.path.join(os.path.dirname(__file__), 'data', 'patterns.json')
grok_parse = Parse(patterns_file=PATTERNS_FILE)

def parse_and_sort(content) -> dict:
    parsed_events = []
    unmatched_blocks = []
    
    blocks, api_key_available, learning_in_progress = grok_parse.parse_by_excerpt(content) # calling them blocks instead of lines b/c of multi-line logs

    for block in blocks:
        if block:
            parsed_events.append(block)
        else:
            unmatched_blocks.append(block)
            # Include raw line as unmatched entry
            parsed_events.append({
                "raw": block,
                "unmatched": True,
                "severity": "unknown"
            })
    
    '''
    need more classification conditionals here maybe? more robust as well
    '''

    for event in parsed_events:
        if event.get('unmatched'):
            continue
        normalize_event_timestamp(event)
        if 'severity' not in event:
            login_status = str(event.get('login_status', '')).lower()
            proc = str(event.get('proc', '')).lower()
            status_code = event.get('status_code', '')
            uri = str(event.get('uri', '')).lower()

            # HTTP-aware rules (Apache access logs)
            SUSPICIOUS_URIS = ('/etc/passwd', '/.env', '/.git', '/wp-admin', '/wp-login',
                               '/phpmyadmin', '/.htaccess', '/config', '/admin', '/../')
            if any(s in uri for s in SUSPICIOUS_URIS):
                event['severity'] = 'critical'
            elif status_code and int(status_code) >= 500:
                event['severity'] = 'critical'
            elif status_code and int(status_code) >= 400:
                event['severity'] = 'warning'
            # Syslog / auth.log rules
            elif any(word in login_status for word in ['failed', 'invalid', 'error', 'denied']):
                event['severity'] = 'warning'
            elif 'ban' in proc or 'fail2ban' in proc:
                event['severity'] = 'critical'
            elif 'backdoor' in str(event.get('login', '')).lower():
                event['severity'] = 'critical'
            else:
                event['severity'] = 'info'
    
    result = {
        "format": "syslog", # not all logs are syslogs
        "count": len(parsed_events),
        "logs": parsed_events,
        "parsed_at": datetime.utcnow().isoformat() + "Z",
        "api_key_available": True if api_key_available else False,
        "learning_in_progress": True if learning_in_progress else False,
    }
    
    # Add warning if there are unmatched lines and no API key
    if unmatched_blocks and not api_key_available:
        result["unmatched_count"] = len(unmatched_blocks)
        result["api_key_required"] = True
        result["api_key_message"] = (
            f"{len(unmatched_blocks)} log line(s) did not match any known patterns. "
            "Set OPENAI_API_KEY environment variable to enable automatic pattern generation."
        )
    
    return result

# debug
# result = parse_and_sort("Mar 06 09:15:01 auth-server sshd[12001]: Accepted publickey for admin from 192.168.1.100 port 52341 ssh2: RSA SHA256:abc123XYZ\nMar 06 09:15:15 auth-server sshd[12002]: Failed password for invalid user hacker from 203.0.113.50 port 33333 ssh2\nMar 06 09:15:23 auth-server sshd[12003]: Failed password for invalid user root from 203.0.113.50 port 33334 ssh2\nMar 06 09:15:45 auth-server sshd[12004]: Failed password for invalid user admin from 203.0.113.50 port 33335 ssh2\nMar 06 09:16:01 auth-server fail2ban.actions[5001]: NOTICE  [sshd] Ban 203.0.113.50\nMar 06 09:17:30 auth-server sshd[12010]: Accepted password for deploy from 10.0.1.15 port 54321 ssh2\nMar 06 09:18:00 auth-server sudo[13001]:   deploy : TTY=pts/0 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/systemctl restart nginx\nMar 06 09:18:15 auth-server systemd-logind[1001]: New session 45 of user deploy.\nMar 06 09:19:30 auth-server sshd[12015]: Disconnected from user deploy 10.0.1.15 port 54321\nMar 06 09:20:00 auth-server useradd[14001]: new user: name=backdoor, UID=0, GID=0, home=/root, shell=/bin/bash\nMar 06 09:21:15 auth-server CRON[15001]: (root) CMD (/usr/local/bin/backup.sh)\nMar 06 09:22:30 auth-server sshd[12020]: error: maximum authentication attempts exceeded for invalid user oracle from 198.51.100.75 port 22222 ssh2 [preauth]")
# print(result)