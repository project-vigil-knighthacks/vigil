`claude_generate_logs.py` is pretty self-explanatory. Written by Claude, you can use it like this to generate synthetic `/var/log/auth.log` logs:
```python
python3 generate_logs.py                          # mixed, 500 lines to stdout
python3 generate_logs.py --mode malicious -o attack.log
python3 generate_logs.py --mode mixed --lines 2000 -o test.log
```

`auth.log` is a Linux system log that records all authentication-related events. Anything involving proving identity or gaining access gets written here — SSH logins, sudo usage, PAM (Pluggable Authentication Modules) events, su attempts, failed passwords, etc. On Red Hat/CentOS based systems it's called secure instead, but same content.
It lives at `/var/log/auth.log`.
Permissions: it's owned by `root` and typically has `640` permissions, meaning:
- `root` can read/write it
- Members of the `adm` group can read it
- Everyone else gets nothing

So, log collector/ingestion service will need to run with sufficient privileges to actually read these files, or you pipe them through rsyslog/journald which can forward logs to your collector without the collector needing direct file access. The latter is cleaner from a security standpoint.