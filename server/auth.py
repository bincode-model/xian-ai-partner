"""Small single-owner authentication for a TLS reverse-proxied deployment.

No plaintext password is stored. This is deliberately not a multi-tenant IAM
system; all authenticated users share the single Bin workspace.
"""
from __future__ import annotations

import getpass
import hashlib
import hmac
import ipaddress
import os
import re
import secrets
import threading
import time
from collections import defaultdict, deque
from http.cookies import CookieError, SimpleCookie
from urllib.parse import urlsplit

from .service import APIError

COOKIE_NAME = "partner_session"
COOKIE_PATH = "/partner/"
COOKIE_PATH_PATTERN = re.compile(r"^/(?:[A-Za-z0-9_-]+/)*$")
SESSION_SECONDS = 8 * 60 * 60
PBKDF2_ITERATIONS = 600_000
HASH_PATTERN = re.compile(r"^pbkdf2_sha256\$([0-9]{6,7})\$([0-9a-f]{32})\$([0-9a-f]{64})$")


def validate_cookie_path(cookie_path):
    """Allow a root or canonical directory scope, never cookie/header syntax."""
    if not isinstance(cookie_path, str) or len(cookie_path) > 256 or not COOKIE_PATH_PATTERN.fullmatch(cookie_path):
        raise ValueError("WORKBENCH_COOKIE_PATH must be / or an absolute directory path ending in /, with letters, digits, _ and - only")
    return cookie_path


def hash_password(password):
    """Return an environment-safe encoded password hash; never retain plaintext."""
    if not isinstance(password, str) or not 12 <= len(password) <= 1024 or len(password.encode("utf-8")) > 4096:
        raise ValueError("Password must contain 12–1024 characters and at most 4096 UTF-8 bytes")
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS, dklen=32)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${key.hex()}"


class Auth:
    def __init__(self, password_hash=None, public_origin=None, session_seconds=SESSION_SECONDS, clock=None, cookie_path=COOKIE_PATH):
        self.required = bool(password_hash)
        self.public_origin = (public_origin or "").strip()
        self.cookie_path = validate_cookie_path(cookie_path)
        self.session_seconds = session_seconds
        self.clock = clock or time.monotonic
        self.lock = threading.RLock()
        self.sessions = {}
        self.attempts = defaultdict(deque)
        self.global_attempts = deque()
        self.iterations = None
        self.salt = self.expected_key = None
        if bool(self.public_origin) != self.required:
            raise ValueError("PUBLIC_ORIGIN and WORKBENCH_AUTH_PASSWORD_HASH must be configured together; refusing an unauthenticated public deployment")
        if self.required:
            origin = urlsplit(self.public_origin)
            if origin.scheme != "https" or not origin.hostname or origin.path or origin.query or origin.fragment or origin.username or origin.password:
                raise ValueError("PUBLIC_ORIGIN must be an exact HTTPS origin without a path or credentials")
            matched = HASH_PATTERN.fullmatch(password_hash)
            if not matched:
                raise ValueError("Invalid WORKBENCH_AUTH_PASSWORD_HASH format")
            iterations, salt, key = matched.groups()
            if not PBKDF2_ITERATIONS <= int(iterations) <= 2_000_000:
                raise ValueError("Password hash iteration count must be 600000–2000000")
            self.iterations = int(iterations)
            self.salt, self.expected_key = bytes.fromhex(salt), bytes.fromhex(key)

    @classmethod
    def from_environment(cls):
        return cls(os.environ.get("WORKBENCH_AUTH_PASSWORD_HASH"), os.environ.get("PUBLIC_ORIGIN"),
                   cookie_path=os.environ.get("WORKBENCH_COOKIE_PATH", COOKIE_PATH))

    def token_from_cookie(self, raw_cookie):
        if not isinstance(raw_cookie, str) or len(raw_cookie) > 8192:
            return None
        try:
            cookie = SimpleCookie()
            cookie.load(raw_cookie)
            value = cookie.get(COOKIE_NAME)
        except CookieError:
            return None
        token = value.value if value else None
        return token if token and re.fullmatch(r"[A-Za-z0-9_-]{43}", token) else None

    def authenticated(self, token):
        if not self.required:
            return True
        if not isinstance(token, str):
            return False
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with self.lock:
            expiry = self.sessions.get(digest)
            if expiry is None:
                return False
            if expiry <= self.clock():
                self.sessions.pop(digest, None)
                return False
            return True

    def status(self, token=None):
        return {"required": self.required, "authenticated": self.authenticated(token), "username": "Bin"}

    def rate_limit(self, client_ip):
        timestamp = self.clock()
        with self.lock:
            # Bound memory even if many distinct proxy-provided IPs try to log in.
            stale = [ip for ip, entries in self.attempts.items() if not entries or entries[-1] <= timestamp - 300]
            for ip in stale:
                self.attempts.pop(ip, None)
            entries = self.attempts[client_ip]
            while entries and entries[0] <= timestamp - 300:
                entries.popleft()
            while self.global_attempts and self.global_attempts[0] <= timestamp - 60:
                self.global_attempts.popleft()
            if len(entries) >= 5 or len(self.global_attempts) >= 30:
                raise APIError("登录尝试过于频繁，请 5 分钟后再试", 429)
            entries.append(timestamp)
            self.global_attempts.append(timestamp)

    def login(self, password, client_ip):
        if not self.required:
            return self.status(), None
        self.rate_limit(client_ip)
        if not isinstance(password, str) or not password or len(password) > 1024 or len(password.encode("utf-8")) > 4096:
            raise APIError("密码格式无效", 400)
        derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), self.salt, self.iterations, dklen=32)
        if not hmac.compare_digest(derived, self.expected_key):
            raise APIError("密码不正确", 401)
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        timestamp = self.clock()
        with self.lock:
            self.attempts.pop(client_ip, None)
            self.sessions = {key: expiry for key, expiry in self.sessions.items() if expiry > timestamp}
            # A valid password is required to reach this cap; evict oldest to
            # bound memory, and never persist bearer tokens in the database.
            if len(self.sessions) >= 128:
                self.sessions.pop(min(self.sessions, key=self.sessions.get))
            self.sessions[digest] = timestamp + self.session_seconds
        cookie = f"{COOKIE_NAME}={token}; Path={self.cookie_path}; Max-Age={self.session_seconds}; HttpOnly; Secure; SameSite=Strict"
        return self.status(token), cookie

    @staticmethod
    def client_ip(peer_ip, real_ip):
        # X-Real-IP is trusted only from the loopback nginx connection, and only
        # used for throttling. Nginx must overwrite it with $remote_addr.
        if peer_ip in {"127.0.0.1", "::1"} and isinstance(real_ip, str):
            try:
                return str(ipaddress.ip_address(real_ip.strip()))
            except ValueError:
                pass
        return peer_ip


def main():
    password = getpass.getpass("Set workspace password (12+ characters): ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        raise SystemExit("Passwords do not match")
    print(hash_password(password))


if __name__ == "__main__":
    main()
