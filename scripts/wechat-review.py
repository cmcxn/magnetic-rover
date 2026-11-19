"""Exchange a fresh wx.login code and optionally review seven nickname samples."""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

CONFIG = Path(__file__).resolve().parents[1] / ".env.wechat"
SAMPLES = ("快乐小玩家", "星空旅人", "傻逼", "傻B", "煞笔",
           "低价代充加微abc123456", "外挂出售加群123456789")


def request(path, data=None):
    payload = None if data is None else json.dumps(data).encode()
    try:
        req = Request("https://api.weixin.qq.com" + path, data=payload,
                      headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=8) as response:
            result = json.load(response)
        return result if isinstance(result, dict) else {}
    except (OSError, ValueError):
        return {}


def save_openid(original, openid):
    pattern = r"^([ \t]*WECHAT_OPENID[ \t]*=[ \t]*)[^#\r\n]*?([ \t]*(?:#[^\r\n]*)?)(?=\r?$)"
    updated, count = re.subn(pattern, lambda match: match[1] + openid + match[2], original, flags=re.M)
    if not count:
        updated = original + ("" if not original or original.endswith("\n") else "\n")
        updated += "WECHAT_OPENID=" + openid + "\n"
    fd, path = tempfile.mkstemp(dir=CONFIG.parent, prefix=".env.wechat.")
    try:
        with os.fdopen(fd, "w", newline="") as output:
            output.write(updated)
        os.replace(path, CONFIG)
    finally:
        Path(path).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review", action="store_true")
    args = parser.parse_args()
    original = CONFIG.read_bytes().decode() if CONFIG.exists() else ""
    values = dict(re.findall(r"^[ \t]*(WECHAT_[A-Z_]+)[ \t]*=[ \t]*([^\r\n]*)", original, re.M))
    appid = os.getenv("WECHAT_APP_ID") or values.get("WECHAT_APP_ID", "").strip() or "wx570e397999b5bf8e"
    secret = os.getenv("WECHAT_APP_SECRET") or values.get("WECHAT_APP_SECRET", "").strip()
    if not secret:
        raise SystemExit("请先在本地填写 WECHAT_APP_SECRET")
    if not sys.stdin.isatty():
        raise SystemExit("请在交互终端输入 code，以隐藏输入")
    code = getpass.getpass("最新 wx.login code（输入隐藏）: ").strip()
    if not code or code.startswith("【"):
        raise SystemExit("请重新执行 wx.login 并输入最新 code")
    result = request("/sns/jscode2session?" + urlencode(
        {"appid": appid, "secret": secret, "js_code": code, "grant_type": "authorization_code"}))
    openid = result.get("openid")
    if result.get("errcode", 0) != 0 or not isinstance(openid, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", openid):
        raise SystemExit("兑换失败，请检查配置并重新获取 wx.login code")
    save_openid(original, openid)
    print("OpenID 已保存（已脱敏）")
    if os.getenv("WECHAT_OPENID"):
        print("进程 WECHAT_OPENID 优先于配置文件。本次测试使用刚兑换的 OpenID。")
    if not args.review:
        return
    token = request("/cgi-bin/stable_token", {"grant_type": "client_credential",
                    "appid": appid, "secret": secret, "force_refresh": False})
    access = token.get("access_token")
    if token.get("errcode", 0) != 0 or not isinstance(access, str) or not access:
        raise SystemExit("获取审核令牌失败")
    path = "/wxa/game/content_spam/msg_sec_check?" + urlencode({"access_token": access})
    print("名称\terrcode\tsuggest\tlabel\t耗时(ms)")
    for name in SAMPLES:
        start = time.monotonic()
        response = request(path, {"openid": openid, "version": 2, "scene": 1, "content": name})
        result = response.get("result")
        result = result if isinstance(result, dict) else {}
        errcode, suggest, label = response.get("errcode"), result.get("suggest"), result.get("label")
        print(name, errcode if type(errcode) is int else "-",
              suggest if suggest in ("pass", "risky", "review") else "-",
              label if type(label) is int else "-", round((time.monotonic()-start)*1000), sep="\t")


if __name__ == "__main__":
    main()
