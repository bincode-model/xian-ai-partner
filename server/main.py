"""Run with: python3 -m server.main --port 8766 --data-dir ./server/data"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import signal
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

from . import __version__, pipelines
from .auth import Auth
from .service import APIError, Service

MAX_BODY = 7 * 1024 * 1024
PROJECT_ROOT = Path(__file__).resolve().parent.parent


class LocalHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, port, service, dist_dir=None, quiet=False, auth=None):
        self.auth = auth if auth is not None else Auth.from_environment()
        super().__init__(("127.0.0.1", port), Handler)
        self.service = service
        self.dist_dir = Path(dist_dir or PROJECT_ROOT / "dist").resolve()
        self.quiet = quiet
        actual_port = self.server_address[1]
        self.allowed_hosts = {f"localhost:{actual_port}", f"127.0.0.1:{actual_port}"}
        if not self.auth.required:
            self.allowed_hosts.update({"localhost:5187", "127.0.0.1:5187", "localhost:5192", "127.0.0.1:5192"})
        self.allowed_origins = {self.auth.public_origin} if self.auth.required else {"http://" + host for host in self.allowed_hosts}


class Handler(BaseHTTPRequestHandler):
    server_version = "LocalWorkbench/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if not self.server.quiet:
            # Query strings and request bodies are not logged.
            sys.stderr.write(f"{self.command} {urlsplit(self.path).path} {args[1] if len(args) > 1 else ''}\n")

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def validate_request(self):
        hosts = self.headers.get_all("Host", [])
        if len(hosts) != 1 or hosts[0].lower() not in self.server.allowed_hosts:
            raise APIError("仅允许本机回环地址访问", 403)
        origins = self.headers.get_all("Origin", [])
        if len(origins) > 1 or (origins and origins[0] not in self.server.allowed_origins):
            raise APIError("拒绝来自非本地工作台的请求", 403)
        if self.server.auth.required and self.command not in {"GET", "HEAD", "OPTIONS"}:
            if origins != [self.server.auth.public_origin]:
                raise APIError("写入请求必须来自已配置工作台的同源页面", 403)
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            # Opening the local app from an official extension or an external
            # link is a top-level document navigation, not a cross-site API
            # request. Allow only this read-only static entry route. Host and
            # Origin checks above still apply, as do path checks in static().
            path = unquote(urlsplit(self.path).path)
            top_level_document = (
                self.command in {"GET", "HEAD"}
                and self.headers.get("Sec-Fetch-Mode") == "navigate"
                and self.headers.get("Sec-Fetch-Dest") == "document"
                and not (path == "/api" or path.startswith("/api/"))
            )
            if not top_level_document:
                raise APIError("拒绝跨站请求", 403)

    def headers_common(self, content_type, length):
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN" if self.path.startswith('/experience/') else "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin in self.server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def json(self, data, status=200, extra_headers=None):
        encoded = json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.headers_common("application/json; charset=utf-8", len(encoded))
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(encoded)

    def body(self, maximum=MAX_BODY):
        if self.headers.get("Transfer-Encoding"):
            raise APIError("不支持分块请求体", 400)
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or not re.fullmatch(r"[0-9]+", lengths[0]):
            raise APIError("需要单个有效的 Content-Length", 411)
        length = int(lengths[0])
        if length > maximum:
            raise APIError("请求体超过允许大小", 413)
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            raise APIError("请求需使用 application/json", 415)
        try:
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise APIError("请求体不完整")
            obj = json.loads(raw.decode("utf-8"), parse_constant=lambda _: (_ for _ in ()).throw(ValueError("non-finite")))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError, RecursionError) as exc:
            raise APIError("请求体不是有效 UTF-8 JSON") from exc
        if not isinstance(obj, dict):
            raise APIError("请求体必须为 JSON 对象")
        return obj

    def handle_api(self):
        path = unquote(urlsplit(self.path).path)
        parts = path.strip("/").split("/")
        method, service, store = self.command, self.server.service, self.server.service.store
        auth = self.server.auth
        token = auth.token_from_cookie(self.headers.get("Cookie", ""))
        if method in {"GET", "HEAD"} and path == "/api/health":
            return self.json({"ok": True, "version": __version__})
        if method in {"GET", "HEAD"} and path == "/api/auth":
            return self.json(auth.status(token))
        if method == "POST" and path == "/api/auth/login":
            data = self.body(maximum=8192)
            ip = auth.client_ip(self.client_address[0], self.headers.get("X-Real-IP"))
            status, cookie = auth.login(data.get("password"), ip)
            return self.json(status, extra_headers={"Set-Cookie": cookie} if cookie else None)
        if auth.required and not auth.authenticated(token):
            raise APIError("请先登录工作台", 401)
        if method in {"GET", "HEAD"}:
            if path == "/api/state":
                return self.json(store.state(service.provider()))
            if len(parts) == 3 and parts[:2] == ["api", "samples"]:
                if parts[2] not in pipelines.DOMAINS:
                    raise APIError("领域不存在", 404)
                return self.json(pipelines.sample(parts[2]))
            if len(parts) == 3 and parts[:2] == ["api", "runs"]:
                return self.json(store.get_run(parts[2]))
            if len(parts) == 3 and parts[:2] == ["api", "artifacts"]:
                record, file_path = store.download(parts[2])
                return self.file(file_path, record["mime"], record["name"])
            raise APIError("接口不存在", 404)
        if method == "DELETE":
            if len(parts) == 3 and parts[:2] == ["api", "cases"]:
                if self.headers.get("Content-Length") not in {None, "0"}:
                    self.body()
                return self.json(store.case({}, parts[2], delete=True))
            if len(parts) == 3 and parts[0] == "api" and parts[1] in {"members", "agents", "schedules"}:
                # If present, consume a valid JSON body (often {}); never ignore a huge body.
                if self.headers.get("Content-Length") not in {None, "0"}:
                    self.body()
                return self.json(store.entity(parts[1], {}, parts[2], delete=True))
            raise APIError("接口不存在", 404)
        data = self.body()
        if method == "POST":
            if path == "/api/cases":
                return self.json(store.case(data), 201)
            if len(parts) == 4 and parts[:2] == ["api", "cases"] and parts[3] == "notes":
                return self.json(store.case(data, parts[2], append_note=True))
            if path == "/api/uploads":
                return self.json(store.upload(data), 201)
            if path == "/api/runs":
                run = store.create_run(data)
                service.wake.set()
                return self.json(run, 201)
            if len(parts) == 2 and parts[0] == "api" and parts[1] in {"members", "agents", "schedules"}:
                return self.json(store.entity(parts[1], data), 201)
            if len(parts) == 4 and parts[:2] == ["api", "runs"]:
                if parts[3] == "review":
                    return self.json(store.review(parts[2], data))
                if parts[3] == "cancel":
                    return self.json(store.cancel(parts[2]))
                if parts[3] == "retry":
                    result = store.retry(parts[2])
                    service.wake.set()
                    return self.json(result, 201)
        if method == "PATCH" and len(parts) == 3 and parts[:2] == ["api", "cases"]:
            return self.json(store.case(data, parts[2]))
        if method == "PATCH" and len(parts) == 3 and parts[0] == "api" and parts[1] in {"members", "agents", "schedules"}:
            return self.json(store.entity(parts[1], data, parts[2]))
        raise APIError("接口不存在", 404)

    def file(self, path, content_type, download_name=None):
        # Small local artifacts/media are streamed; no arbitrary filesystem paths.
        self.send_response(200)
        self.headers_common(content_type, path.stat().st_size)
        if download_name:
            self.send_header("Content-Disposition", "attachment; filename=\"artifact" + path.suffix + "\"; filename*=UTF-8''" + quote(download_name, safe=""))
        self.end_headers()
        if self.command != "HEAD":
            with path.open("rb") as source:
                while chunk := source.read(128 * 1024):
                    self.wfile.write(chunk)

    def static(self):
        if self.command not in {"GET", "HEAD"}:
            raise APIError("仅 API 接受写入请求", 405)
        relative = unquote(urlsplit(self.path).path).lstrip("/")
        if "\x00" in relative or "\\" in relative:
            raise APIError("路径无效", 400)
        root = self.server.dist_dir
        target = (root / relative).resolve()
        if not target.is_relative_to(root):
            raise APIError("路径无效", 403)
        if not target.is_file():
            if Path(relative).suffix or relative.startswith("assets/"):
                raise APIError("文件不存在", 404)
            target = (root / "index.html").resolve()
        if not target.is_relative_to(root):
            raise APIError("路径无效", 403)
        if not target.is_file():
            raise APIError("前端尚未构建。开发时使用 Vite 5187；生产预览请先运行构建。", 503)
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.file(target, content_type)

    def dispatch(self):
        try:
            self.validate_request()
            if self.command == "OPTIONS":
                self.send_response(204)
                self.headers_common("application/json", 0)
                self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.end_headers()
                return
            if urlsplit(self.path).path.startswith("/api/"):
                self.handle_api()
            else:
                self.static()
        except APIError as exc:
            # Close on rejected requests to avoid unread-body request smuggling.
            self.close_connection = True
            self.json({"error": str(exc)}, exc.status)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            self.close_connection = True
        except Exception as exc:
            self.close_connection = True
            sys.stderr.write(f"Local API internal error: {type(exc).__name__}\n")
            self.json({"error": "本地服务发生错误；请检查服务终端后重试"}, 500)

    do_GET = dispatch
    do_HEAD = dispatch
    do_POST = dispatch
    do_PATCH = dispatch
    do_DELETE = dispatch
    do_OPTIONS = dispatch


def main():
    parser = argparse.ArgumentParser(description="Loopback-only AI lifelong partner file workflow server")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parent / "data")
    parser.add_argument("--workers", type=int, default=int(os.environ.get("WORKBENCH_WORKERS", "2")), choices=[1, 2, 3])
    parser.add_argument("--dist-dir", type=Path, default=PROJECT_ROOT / "dist")
    args = parser.parse_args()
    # Reject unsafe/incomplete public configuration before starting any workers.
    auth = Auth.from_environment()
    service = Service(args.data_dir, workers=args.workers)
    server = LocalHTTPServer(args.port, service, args.dist_dir, auth=auth)
    def shutdown(_signum, _frame):
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    print(f"Local workbench: http://127.0.0.1:{server.server_address[1]} · {service.worker_count} file workers / 1 optional model request", flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    finally:
        server.server_close()
        service.close()


if __name__ == "__main__":
    main()
