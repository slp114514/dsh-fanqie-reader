"""
Local mitmproxy addon for the optional Fanqie App session capture.

It records only Fanqie/ByteDance hosts to a local JSONL file. It does not
upload anything and does not bypass login; the user must already be signed in
on their own device/emulator.
"""

import base64
import json
import os
import time
from pathlib import Path

from mitmproxy import http

OUT = Path(os.environ.get("FANQIE_CAPTURE_OUT", "fanqie-capture.jsonl"))
HOSTS = (
    "fanqienovel.com",
    "fqnovel.com",
    "snssdk.com",
    "zijieapi.com",
    "bytedance.com",
    "byteimg.com",
    "douyin.com",
    "douyinpic.com",
)


def relevant(host: str) -> bool:
    return any(host == item or host.endswith("." + item) for item in HOSTS)


def body_text(message: http.Message) -> str:
    raw = message.get_content() or b""
    if len(raw) > 300_000:
        raw = raw[:300_000]
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return "base64:" + base64.b64encode(raw).decode("ascii")


def record(flow: http.HTTPFlow) -> None:
    host = flow.request.pretty_host
    if not relevant(host):
        return
    entry = {
        "time": time.time(),
        "method": flow.request.method,
        "url": flow.request.pretty_url,
        "host": host,
        "request_headers": dict(flow.request.headers),
        "request_body": body_text(flow.request),
    }
    if flow.response is not None:
        entry["status"] = flow.response.status_code
        entry["response_headers"] = dict(flow.response.headers)
        entry["response_body"] = body_text(flow.response)
    with OUT.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def request(flow: http.HTTPFlow) -> None:
    record(flow)


def response(flow: http.HTTPFlow) -> None:
    record(flow)
