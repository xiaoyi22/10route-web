# Reads one JSON line on stdin, drives a persistent Chromium through the egress
# proxy so the site's JavaScript challenge can solve itself, then posts the check-in
# from the same cookie jar. Prints exactly one whitelisted RESULT line; never cookie text.
import json
import os
import signal
import sys
import time
from urllib.parse import urlsplit


class Timeout(Exception):
    pass


def alarm(signum, frame):
    raise Timeout()


def emit(value):
    sys.stdout.write("RESULT " + json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def classify(status, text):
    lowered = text.lower()
    body = None
    try:
        body = json.loads(text)
    except Exception:
        pass
    message = body.get("message") if isinstance(body, dict) and isinstance(body.get("message"), str) else ""
    if body is None and ("acw_sc__v2" in lowered or "aliyunwaf" in lowered or "turnstile" in lowered or "challenge" in lowered):
        return {"status": "verification"}
    if status == 401 or any(word in message for word in ("登录已过期", "未登录", "登录失效")):
        return {"status": "expired"}
    if status == 404:
        return {"status": "unsupported"}
    if isinstance(body, dict) and body.get("success") is True:
        reward = (body.get("data") or {}).get("quota_awarded") if isinstance(body.get("data"), dict) else None
        result = {"status": "success"}
        if isinstance(reward, (int, float)):
            result["reward"] = reward
        return result
    if any(word in message for word in ("已签到", "重复签到")) or "already" in lowered:
        return {"status": "already"}
    if status < 200 or status >= 300 or body is None:
        return {"status": "error"}
    return {"status": "error"}


def main():
    signal.signal(signal.SIGALRM, alarm)
    signal.alarm(70)
    config = json.loads(sys.stdin.read())
    base = str(config.get("baseUrl", ""))
    path = str(config.get("checkinPath", ""))
    cookie = str(config.get("cookie", ""))
    user_id = str(config.get("userId", ""))
    if not base.startswith("https://") or not path.startswith("/api/user/"):
        emit({"status": "error"})
        return
    profile = os.environ.get("TENROUTER_ANYROUTER_PROFILE_DIR", "")
    proxy = os.environ.get("TENROUTER_CHECKIN_PROXY_URL", "")
    if not profile:
        emit({"status": "error"})
        return
    from playwright.sync_api import sync_playwright

    hostname = urlsplit(base).hostname
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            profile,
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
            **({"proxy": {"server": proxy}} if proxy else {}),
        )
        try:
            pairs = [part.split("=", 1) for part in cookie.split(";") if "=" in part]
            context.add_cookies([{"name": name.strip(), "value": value.strip(), "domain": hostname, "path": "/"} for name, value in pairs if name.strip()])
            page = context.new_page()
            page.goto(base + "/", wait_until="domcontentloaded", timeout=25000)
            for _ in range(10):
                content = page.content().lower()
                if "acw_sc__v2" not in content and "aliyunwaf" not in content and "challenge" not in content:
                    break
                time.sleep(2)
                page.reload(wait_until="domcontentloaded", timeout=25000)
            headers = {"Content-Type": "application/json"}
            if user_id:
                headers["New-Api-User"] = user_id
            response = context.request.post(base + path, data="{}", headers=headers, timeout=25000)
            emit(classify(response.status, response.text()))
        finally:
            context.close()


try:
    main()
except Exception:
    emit({"status": "error"})
