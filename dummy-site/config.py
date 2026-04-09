import os

# Server
PORT = int(os.environ.get("DUMMY_SITE_PORT", 5000))
HOST = os.environ.get("DUMMY_SITE_HOST", "127.0.0.1")

# Log output: the file Vigil's collector will watch
# For Windows local dev, defaults to ./logs/access.log next to this script
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
LOG_OUTPUT = os.environ.get("DUMMY_LOG_OUTPUT", os.path.join(LOG_DIR, "access.log"))

# Dummy credentials (intentionally weak for demonstration)
USERS = {
    "admin": "admin123",
    "alice": "correcthorsebatterystaple",
    "bob": "password1",
}

SECRET_KEY = os.environ.get("DUMMY_SECRET_KEY", "dummy-secret-for-local-dev")
