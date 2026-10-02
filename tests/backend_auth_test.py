"""Single-owner production auth regressions using only a temporary HTTP server."""
from __future__ import annotations

import http.client
import http.cookiejar
import json
import tempfile
import threading
import unittest
import urllib.request
from email.message import Message
from pathlib import Path
from unittest import mock

from server.auth import Auth, COOKIE_NAME, COOKIE_PATH, HASH_PATTERN, hash_password
from server.main import LocalHTTPServer
from server.service import Service

PUBLIC_ORIGIN = "https://work.bincode.top"
TEST_PASSWORD = "Synthetic-local-test-only-123!"


class AuthUnitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = hash_password(TEST_PASSWORD)

    def test_hash_format_salted_no_plaintext_and_configuration_fails_closed(self):
        self.assertRegex(self.password_hash, HASH_PATTERN)
        self.assertNotIn(TEST_PASSWORD, self.password_hash)
        self.assertNotEqual(self.password_hash, hash_password(TEST_PASSWORD))
        for encoded, origin in [(None, PUBLIC_ORIGIN), (self.password_hash, None), ("bad-format", PUBLIC_ORIGIN), (self.password_hash, "http://work.bincode.top"), (self.password_hash, PUBLIC_ORIGIN + "/partner/")]:
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                Auth(encoded, origin)
        with self.assertRaises(ValueError):
            hash_password("short")

    def test_no_environment_keeps_local_mode(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            auth = Auth.from_environment()
        self.assertEqual(auth.status(), {"required": False, "authenticated": True, "username": "Bin"})
        self.assertEqual(auth.cookie_path, COOKIE_PATH)

    def test_cookie_path_environment_and_invalid_scopes_fail_closed(self):
        for path in ["/", "/partner/", "/workspace-v2/team_1/"]:
            with self.subTest(path=path), mock.patch.dict("os.environ", {
                "WORKBENCH_AUTH_PASSWORD_HASH": self.password_hash,
                "PUBLIC_ORIGIN": PUBLIC_ORIGIN,
                "WORKBENCH_COOKIE_PATH": path,
            }, clear=True):
                self.assertEqual(Auth.from_environment().cookie_path, path)
        for path in [None, "", "partner/", "/partner", "//", "/../", "/./", "/%2f/", "/a\\b/", "/with space/", "/; Domain=evil.test", "/\r\nSet-Cookie: bad=1", "/" + "a" * 256 + "/"]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                Auth(self.password_hash, PUBLIC_ORIGIN, cookie_path=path)

    def test_only_loopback_proxy_ip_is_trusted(self):
        self.assertEqual(Auth.client_ip("127.0.0.1", "203.0.113.8"), "203.0.113.8")
        self.assertEqual(Auth.client_ip("127.0.0.1", "203.0.113.8, 1.2.3.4"), "127.0.0.1")
        self.assertEqual(Auth.client_ip("198.51.100.2", "203.0.113.8"), "198.51.100.2")

    def test_session_tokens_not_persisted_and_new_instance_is_locked(self):
        auth = Auth(self.password_hash, PUBLIC_ORIGIN)
        _, cookie = auth.login(TEST_PASSWORD, "203.0.113.10")
        token = auth.token_from_cookie(cookie)
        self.assertTrue(auth.authenticated(token))
        self.assertNotIn(token, auth.sessions)
        restarted = Auth(self.password_hash, PUBLIC_ORIGIN)
        self.assertFalse(restarted.authenticated(token))


class AuthHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = hash_password(TEST_PASSWORD)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.clock = [1000.0]
        self.auth = Auth(self.password_hash, PUBLIC_ORIGIN, clock=lambda: self.clock[0])
        self.service = Service(Path(self.tmp.name) / "data", start_workers=False)
        self.service.codex = None
        self.dist = Path(self.tmp.name) / "dist"
        self.dist.mkdir()
        (self.dist / "index.html").write_text("<html>Sign in</html>", encoding="utf-8")
        self.http = LocalHTTPServer(0, self.service, self.dist, quiet=True, auth=self.auth)
        self.port = self.http.server_address[1]
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.service.close()
        self.tmp.cleanup()

    def request(self, method, path, body=None, cookie=None, headers=None, origin=PUBLIC_ORIGIN):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        request_headers = {"Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", **(headers or {})}
        if origin is not None:
            request_headers["Origin"] = origin
        if cookie:
            request_headers["Cookie"] = cookie.split(";", 1)[0]
        raw = json.dumps(body).encode() if body is not None else None
        connection.request(method, path, body=raw, headers=request_headers)
        response = connection.getresponse()
        result = response.read()
        status, returned_headers = response.status, dict(response.getheaders())
        connection.close()
        if result and returned_headers.get("Content-Type", "").startswith("application/json"):
            result = json.loads(result)
        return status, result, returned_headers

    def login(self, password=TEST_PASSWORD, ip="203.0.113.1"):
        return self.request("POST", "/api/auth/login", {"password": password}, headers={"X-Real-IP": ip})

    def test_login_cookie_and_all_business_apis_protected(self):
        status, auth, _ = self.request("GET", "/api/auth", origin=None)
        self.assertEqual(status, 200)
        self.assertEqual(auth, {"required": True, "authenticated": False, "username": "Bin"})
        status, health, _ = self.request("GET", "/api/health", origin=None)
        self.assertEqual(status, 200)
        self.assertEqual(set(health), {"ok", "version"})
        for method, path, data in [
            ("GET", "/api/state", None), ("GET", "/api/samples/drug", None),
            ("GET", "/api/runs/unknown", None), ("GET", "/api/artifacts/unknown", None),
            ("POST", "/api/runs", {}), ("POST", "/api/uploads", {}),
            ("POST", "/api/members", {}), ("POST", "/api/agents", {}),
            ("POST", "/api/schedules", {}), ("POST", "/api/cases", {}),
            ("PATCH", "/api/members/unknown", {}), ("DELETE", "/api/cases/unknown", None),
        ]:
            with self.subTest(path=path):
                self.assertEqual(self.request(method, path, data)[0], 401)
        status, auth, headers = self.login()
        self.assertEqual(status, 200)
        self.assertTrue(auth["authenticated"])
        cookie = headers["Set-Cookie"]
        for flag in ["HttpOnly", "Secure", "SameSite=Strict", "Path=/partner/", "Max-Age=28800"]:
            self.assertIn(flag, cookie)
        self.assertNotIn("Domain=", cookie)
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie)[0], 200)
        self.assertTrue(self.request("GET", "/api/auth", cookie=cookie)[1]["authenticated"])
        _, state, _ = self.request("GET", "/api/state", cookie=cookie)
        self.assertFalse(state["provider"]["available"])

    def test_expiry_and_invalid_cookies_return_unauthenticated(self):
        _, _, headers = self.login()
        cookie = headers["Set-Cookie"]
        self.clock[0] += 28801
        self.assertFalse(self.request("GET", "/api/auth", cookie=cookie)[1]["authenticated"])
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie)[0], 401)
        for invalid in [COOKIE_NAME + "=invalid", COOKIE_NAME + "=" + "A" * 43, 'partner_session="broken']:
            self.assertEqual(self.request("GET", "/api/state", cookie=invalid)[0], 401)

    def test_root_deployment_cookie_is_sent_to_root_api_and_origin_still_enforced(self):
        self.http.auth = Auth(self.password_hash, PUBLIC_ORIGIN, cookie_path="/")
        status, result, headers = self.login()
        self.assertEqual(status, 200)
        self.assertTrue(result["authenticated"])
        cookie_headers = Message()
        cookie_headers["Set-Cookie"] = headers["Set-Cookie"]
        jar = http.cookiejar.CookieJar()
        jar.extract_cookies(mock.Mock(info=lambda: cookie_headers),
                            urllib.request.Request(PUBLIC_ORIGIN + "/api/auth/login"))
        cookies = list(jar)
        self.assertEqual(len(cookies), 1)
        self.assertEqual(cookies[0].path, "/")
        self.assertTrue(cookies[0].secure)
        self.assertFalse(cookies[0].domain_specified)
        api_request = urllib.request.Request(PUBLIC_ORIGIN + "/api/state")
        jar.add_cookie_header(api_request)
        cookie = api_request.get_header("Cookie")
        self.assertIsNotNone(cookie, "Browser cookie policy must attach the session to /api/state")
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie)[0], 200)
        self.assertEqual(self.request("POST", "/api/runs", {}, cookie=cookie, origin="https://evil.test")[0], 403)
        insecure_request = urllib.request.Request("http://work.bincode.top/api/state")
        jar.add_cookie_header(insecure_request)
        self.assertIsNone(insecure_request.get_header("Cookie"))

    def test_login_attempts_limited_and_recover_after_window(self):
        for _ in range(5):
            status, result, _ = self.login(password="Wrong-test-password-123", ip="203.0.113.80")
            self.assertEqual(status, 401)
            self.assertEqual(result["error"], "密码不正确")
        self.assertEqual(self.login(ip="203.0.113.80")[0], 429)
        # Another real client can recover its own access; global attempts remain bounded.
        self.assertEqual(self.login(ip="203.0.113.81")[0], 200)
        self.clock[0] += 301
        self.assertEqual(self.login(ip="203.0.113.80")[0], 200)

    def test_exact_public_origin_and_missing_origin_write_rejected(self):
        status, _, headers = self.login()
        self.assertEqual(status, 200)
        cookie = headers["Set-Cookie"]
        for origin in [None, "https://evil.test", "http://work.bincode.top", "https://work.bincode.top.evil.test", "null", "http://127.0.0.1:5187"]:
            with self.subTest(origin=origin):
                self.assertEqual(self.request("POST", "/api/auth/login", {"password": TEST_PASSWORD}, origin=origin)[0], 403)
                self.assertEqual(self.request("POST", "/api/runs", {}, cookie=cookie, origin=origin)[0], 403)
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie, origin="https://evil.test")[0], 403)
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie, headers={"Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie, headers={"Host": "work.bincode.top"})[0], 403)
        self.assertEqual(self.request("GET", "/api/state", cookie=cookie, origin=None)[0], 200)

    def test_login_page_static_navigation_is_public_but_not_data(self):
        navigation = {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document"}
        self.assertEqual(self.request("GET", "/", headers=navigation, origin=None)[0], 200)
        self.assertEqual(self.request("GET", "/api/state", headers=navigation, origin=None)[0], 403)
        self.assertEqual(self.request("POST", "/api/auth/login", {"password": []})[0], 400)
        self.assertEqual(self.request("POST", "/api/auth/login", {"password": "x" * 9000})[0], 413)


if __name__ == "__main__":
    unittest.main(verbosity=2)
