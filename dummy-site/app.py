"""
Vigil Dummy Site: a minimal Flask web app that generates Apache-format access logs.

The collector (backend/api/collector.py) watches the log file this app writes to,
parses each line with Grok, classifies severity, stores events in SQLite, and
pushes them to the Vigil frontend dashboard in real time.

Endpoints:
  GET  /                : Home page
  GET  /login           : Login form
  POST /login           : Authenticate
  GET  /logout          : End session
  GET  /dashboard       : Authenticated dashboard
  GET  /admin           : Admin panel (admin user only)
  GET  /api/status      : JSON status endpoint
  GET  /api/users       : JSON user list (admin only)

All requests are logged in Apache Combined Log Format to the configured log file.
"""

import logging
import os
from datetime import datetime, timezone
from functools import wraps

from flask import (
    Flask,
    redirect,
    render_template,
    request,
    session,
    url_for,
    jsonify,
    abort,
)

import config

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = Flask(__name__)
app.secret_key = config.SECRET_KEY

# ---------------------------------------------------------------------------
# Apache-format file logger
# ---------------------------------------------------------------------------
# Format matches the Grok pattern already in Vigil's patterns_backup:
#   %{IP:src_ip} - - [%{HTTPDATE:timestamp}] "%{WORD} %{URIPATH:uri} HTTP/%{NUMBER}" %{INT:status_code} %{INT:bytes_sent}

os.makedirs(os.path.dirname(config.LOG_OUTPUT), exist_ok=True)

apache_handler = logging.FileHandler(config.LOG_OUTPUT, encoding="utf-8")
apache_handler.setLevel(logging.INFO)
apache_logger = logging.getLogger("apache")
apache_logger.setLevel(logging.INFO)
apache_logger.addHandler(apache_handler)


@app.after_request
def log_apache_format(response):
    """Write one line in Apache Combined Log Format after every request."""
    ts = datetime.now(timezone.utc).strftime("%d/%b/%Y:%H:%M:%S +0000")
    user = session.get("user", "-")
    line = (
        f'{request.remote_addr} - {user} [{ts}] '
        f'"{request.method} {request.path} {request.environ.get("SERVER_PROTOCOL", "HTTP/1.1")}" '
        f'{response.status_code} {response.content_length or 0}'
    )
    apache_logger.info(line)
    return response


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if session.get("user") != "admin":
            abort(403)
        return f(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html", user=session.get("user"))


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "")
        password = request.form.get("password", "")
        if username in config.USERS and config.USERS[username] == password:
            session["user"] = username
            return redirect(url_for("dashboard"))
        error = "Invalid credentials"
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("index"))


@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html", user=session["user"])


@app.route("/admin")
@login_required
@admin_required
def admin():
    return render_template("admin.html", user=session["user"])


@app.route("/api/status")
def api_status():
    return jsonify({"status": "ok", "uptime": "running"})


@app.route("/api/users")
@login_required
@admin_required
def api_users():
    return jsonify({"users": list(config.USERS.keys())})


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(403)
def forbidden(e):
    return render_template("error.html", code=403, message="Forbidden"), 403


@app.errorhandler(404)
def not_found(e):
    return render_template("error.html", code=404, message="Not Found"), 404


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"[dummy-site] Listening on http://{config.HOST}:{config.PORT}")
    print(f"[dummy-site] Logging to   {config.LOG_OUTPUT}")
    app.run(host=config.HOST, port=config.PORT, debug=True)
