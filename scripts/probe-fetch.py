#!/usr/bin/env python3
"""Probe every policy source URL with each fetch method and print what works (diagnostic only)."""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
policy = json.loads((ROOT / "public/data/policy_tracker.json").read_text(encoding="utf-8"))
urls = sorted({e["source_url"] for k in ("federal", "federal_oversight", "state_events", "city_events") for e in policy[k]})
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def direct(url, ua):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "text/html,application/pdf,*/*"})
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read(1_500_000)
            return f"ok({r.status},{len(body)}b{',pdf' if body[:4] == b'%PDF' else ''})"
    except Exception as exc:
        code = getattr(exc, "code", None)
        return f"FAIL({code or exc.__class__.__name__})"


from playwright.sync_api import sync_playwright

rows = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(user_agent=BROWSER_UA)
    page = ctx.new_page()
    for url in urls:
        honest = direct(url, "AV-Observatory-PolicyBot/1.0")
        spoof = direct(url, BROWSER_UA)
        try:
            resp = page.goto(url, wait_until="domcontentloaded", timeout=30000)
            text = page.inner_text("body") if "pdf" not in (resp.headers.get("content-type", "") if resp else "") else ""
            blocked = bool(re.search(r"access denied|forbidden|captcha|verify you are human|just a moment", text[:600], re.I))
            browser_res = f"{'BLOCKED-PAGE' if blocked else 'ok'}({resp.status if resp else '?'},{len(text)}c)"
        except Exception as exc:
            browser_res = f"FAIL({exc.__class__.__name__})"
        rows.append((url, honest, spoof, browser_res))
        print(f"{honest:18} {spoof:18} {browser_res:24} {url[:95]}", flush=True)
    browser.close()

def good(x): return x.startswith("ok")
print("\n=== SUMMARY")
print("total", len(rows))
print("direct (honest UA) ok:", sum(good(r[1]) for r in rows))
print("direct (browser UA) ok:", sum(good(r[2]) for r in rows))
print("headless browser ok:", sum(good(r[3]) for r in rows))
print("ok by ANY of these:", sum(any(good(x) for x in r[1:]) for r in rows))
print("\n=== STILL FAILING (needs another method)")
for r in rows:
    if not any(good(x) for x in r[1:]):
        print("  ", r[1], r[2], r[3], r[0][:110])
