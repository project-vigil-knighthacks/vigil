'''
claude wrote this!
'''

#!/usr/bin/env python3
"""
Synthetic Linux auth.log generator for SIEM testing.
Produces realistic benign and malicious log entries.

Usage:
    python3 generate_logs.py                         # default: mixed, 500 lines, stdout
    python3 generate_logs.py --mode malicious        # only attack patterns
    python3 generate_logs.py --mode benign           # only normal activity
    python3 generate_logs.py --lines 1000 -o out.log # write to file
"""

import argparse
import random
import sys
from datetime import datetime, timedelta


# ---------------------------------------------------------------------------
# Data pools
# ---------------------------------------------------------------------------

VALID_USERS = ["alice", "bob", "carol", "deploy", "ubuntu", "ec2-user"]
INVALID_USERS = ["admin", "root", "test", "guest", "oracle", "pi", "user", "support"]
HOSTNAMES = ["web-01", "db-primary", "bastion", "app-server", "dev-box"]
SERVICES = ["sshd", "sudo", "su", "PAM", "cron", "systemd-logind"]

VALID_IPS = [
    "10.0.1.15", "10.0.1.42", "192.168.1.100", "172.16.0.5", "10.0.2.33"
]
ATTACKER_IPS = [
    "185.220.101.47", "45.33.32.156", "198.199.122.40",
    "103.255.61.12", "91.240.118.172", "5.188.86.172",
    "194.165.16.11", "162.243.172.239", "167.99.201.55"
]

SUDO_COMMANDS = [
    "/usr/bin/apt-get update",
    "/usr/bin/systemctl restart nginx",
    "/bin/cat /etc/shadow",
    "/usr/bin/passwd root",
    "/bin/bash",
    "/usr/sbin/useradd -m hacker",
    "/bin/chmod 777 /etc/passwd",
    "/usr/bin/crontab -e",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def random_port():
    return random.randint(1024, 65535)

def fmt_time(dt: datetime) -> str:
    return dt.strftime("%b %d %H:%M:%S").replace(" 0", "  ")  # match syslog padding

def random_pid():
    return random.randint(800, 32000)

# ---------------------------------------------------------------------------
# Benign event generators
# ---------------------------------------------------------------------------

def benign_ssh_accept(dt, host):
    user = random.choice(VALID_USERS)
    ip   = random.choice(VALID_IPS)
    port = random_port()
    pid  = random_pid()
    return (
        f"{fmt_time(dt)} {host} sshd[{pid}]: "
        f"Accepted publickey for {user} from {ip} port {port} ssh2: "
        f"RSA SHA256:{random_hash(43)}"
    )

def benign_ssh_disconnect(dt, host):
    user = random.choice(VALID_USERS)
    ip   = random.choice(VALID_IPS)
    port = random_port()
    pid  = random_pid()
    return (
        f"{fmt_time(dt)} {host} sshd[{pid}]: "
        f"Disconnected from user {user} {ip} port {port}"
    )

def benign_sudo(dt, host):
    user = random.choice(VALID_USERS)
    cmd  = random.choice(SUDO_COMMANDS[:4])  # safe commands only
    pid  = random_pid()
    tty  = f"pts/{random.randint(0,5)}"
    return (
        f"{fmt_time(dt)} {host} sudo[{pid}]: "
        f"  {user} : TTY={tty} ; PWD=/home/{user} ; USER=root ; COMMAND={cmd}"
    )

def benign_session_open(dt, host):
    user = random.choice(VALID_USERS)
    pid  = random_pid()
    return (
        f"{fmt_time(dt)} {host} systemd-logind[{pid}]: "
        f"New session {random.randint(1,200)} of user {user}."
    )

def benign_cron(dt, host):
    user = random.choice(VALID_USERS)
    pid  = random_pid()
    jobs = ["/usr/bin/backup.sh", "/usr/bin/certbot renew", "/usr/local/bin/health-check.sh"]
    return (
        f"{fmt_time(dt)} {host} CRON[{pid}]: "
        f"({user}) CMD ({random.choice(jobs)})"
    )

# ---------------------------------------------------------------------------
# Malicious event generators
# ---------------------------------------------------------------------------

def malicious_ssh_bruteforce(dt, host):
    """Simulate a run of failed SSH attempts from one attacker IP."""
    ip   = random.choice(ATTACKER_IPS)
    user = random.choice(INVALID_USERS + VALID_USERS)
    port = random_port()
    pid  = random_pid()
    return (
        f"{fmt_time(dt)} {host} sshd[{pid}]: "
        f"Failed password for {'invalid user ' if user in INVALID_USERS else ''}"
        f"{user} from {ip} port {port} ssh2"
    )

def malicious_ssh_invalid_user(dt, host):
    ip   = random.choice(ATTACKER_IPS)
    user = random.choice(INVALID_USERS)
    port = random_port()
    pid  = random_pid()
    return (
        f"{fmt_time(dt)} {host} sshd[{pid}]: "
        f"Invalid user {user} from {ip} port {port}"
    )

def malicious_ssh_too_many_auth(dt, host):
    ip  = random.choice(ATTACKER_IPS)
    pid = random_pid()
    return (
        f"{fmt_time(dt)} {host} sshd[{pid}]: "
        f"error: maximum authentication attempts exceeded for invalid user admin "
        f"from {ip} port {random_port()} ssh2 [preauth]"
    )

def malicious_fail2ban_ban(dt, host):
    ip  = random.choice(ATTACKER_IPS)
    pid = random_pid()
    return (
        f"{fmt_time(dt)} {host} fail2ban.actions[{pid}]: "
        f"NOTICE  [sshd] Ban {ip}"
    )

def malicious_sudo_privesc(dt, host):
    """Suspicious sudo usage — sensitive commands or unknown users."""
    user = random.choice(INVALID_USERS + ["www-data", "nobody"])
    cmd  = random.choice(SUDO_COMMANDS[4:])  # dangerous commands
    pid  = random_pid()
    tty  = "unknown"
    return (
        f"{fmt_time(dt)} {host} sudo[{pid}]: "
        f"  {user} : TTY={tty} ; PWD=/ ; USER=root ; COMMAND={cmd}"
    )

def malicious_sudo_failure(dt, host):
    user = random.choice(INVALID_USERS)
    pid  = random_pid()
    return (
        f"{fmt_time(dt)} {host} sudo[{pid}]: "
        f"{user} : user NOT in sudoers ; TTY=pts/{random.randint(0,5)} ; "
        f"PWD=/root ; USER=root ; COMMAND=/bin/bash"
    )

def malicious_new_user(dt, host):
    pid = random_pid()
    return (
        f"{fmt_time(dt)} {host} useradd[{pid}]: "
        f"new user: name=backdoor, UID=0, GID=0, home=/root, shell=/bin/bash"
    )

def malicious_ssh_accepted_from_attacker(dt, host):
    """Successful login from a known bad IP — post-brute-force success."""
    ip   = random.choice(ATTACKER_IPS)
    port = random_port()
    pid  = random_pid()
    return (
        f"{fmt_time(dt)} {host} sshd[{pid}]: "
        f"Accepted password for root from {ip} port {port} ssh2"
    )

def random_hash(length=43):
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    return "".join(random.choices(chars, k=length))

# ---------------------------------------------------------------------------
# Attack scenario: brute force burst
# ---------------------------------------------------------------------------

def generate_bruteforce_burst(start_dt, host, count=20):
    """Rapid-fire failures from one IP, optionally ending in a ban."""
    lines = []
    ip  = random.choice(ATTACKER_IPS)
    pid = random_pid()
    dt  = start_dt
    for _ in range(count):
        user = random.choice(INVALID_USERS)
        port = random_port()
        lines.append(
            f"{fmt_time(dt)} {host} sshd[{pid}]: "
            f"Failed password for invalid user {user} from {ip} port {port} ssh2"
        )
        dt += timedelta(seconds=random.uniform(0.3, 2.0))
    # ban at the end
    lines.append(
        f"{fmt_time(dt)} {host} fail2ban.actions[{random_pid()}]: "
        f"NOTICE  [sshd] Ban {ip}"
    )
    return lines, dt

# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

BENIGN_GENERATORS = [
    benign_ssh_accept,
    benign_ssh_accept,      # weighted higher
    benign_ssh_disconnect,
    benign_sudo,
    benign_session_open,
    benign_cron,
]

MALICIOUS_GENERATORS = [
    malicious_ssh_bruteforce,
    malicious_ssh_bruteforce,   # most common attack type
    malicious_ssh_invalid_user,
    malicious_ssh_too_many_auth,
    malicious_fail2ban_ban,
    malicious_sudo_privesc,
    malicious_sudo_failure,
    malicious_new_user,
    malicious_ssh_accepted_from_attacker,
]


def generate_logs(mode: str, total_lines: int) -> list[str]:
    lines = []
    dt   = datetime.now() - timedelta(hours=2)
    host = random.choice(HOSTNAMES)

    i = 0
    while i < total_lines:
        # Occasionally inject a full brute-force burst scenario
        if mode in ("malicious", "mixed") and random.random() < 0.05:
            burst_size = random.randint(10, 30)
            burst_lines, dt = generate_bruteforce_burst(dt, host, burst_size)
            lines.extend(burst_lines)
            i += len(burst_lines)
            continue

        if mode == "benign":
            gen = random.choice(BENIGN_GENERATORS)
        elif mode == "malicious":
            gen = random.choice(MALICIOUS_GENERATORS)
        else:  # mixed — roughly 70% benign, 30% malicious
            gen = random.choice(
                BENIGN_GENERATORS * 7 + MALICIOUS_GENERATORS * 3
            )

        lines.append(gen(dt, host))
        dt += timedelta(seconds=random.uniform(0.5, 15.0))
        i += 1

    return lines


def main():
    parser = argparse.ArgumentParser(description="Synthetic auth.log generator")
    parser.add_argument(
        "--mode",
        choices=["benign", "malicious", "mixed"],
        default="mixed",
        help="Type of logs to generate (default: mixed)",
    )
    parser.add_argument(
        "--lines",
        type=int,
        default=500,
        help="Approximate number of log lines to generate (default: 500)",
    )
    parser.add_argument(
        "-o", "--output",
        default=None,
        help="Output file path (default: stdout)",
    )
    args = parser.parse_args()

    logs = generate_logs(args.mode, args.lines)

    if args.output:
        with open(args.output, "w") as f:
            f.write("\n".join(logs) + "\n")
        print(f"Wrote {len(logs)} lines to {args.output}", file=sys.stderr)
    else:
        print("\n".join(logs))


if __name__ == "__main__":
    main()