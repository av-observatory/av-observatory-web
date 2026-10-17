#!/usr/bin/env python3
"""Scan probe: fetch two bill pages per state ledger with the production scan fetch() and print the outcome."""
import json, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, Path(__file__).parent.as_posix())
from scan_fetch import scan_fetch as fetch


def probe(item):
    code, key, url = item
    t = time.monotonic()
    try:
        text, kind = fetch(url)
    except Exception as exc:
        return f"{code} {key} EXC {type(exc).__name__} {str(exc)[:80]} {time.monotonic() - t:.1f}s {url}"
    return f"{code} {key} len={len(text)} kind={kind} {time.monotonic() - t:.1f}s {url[:110]}"


items = []
for path in sorted(Path("data-state/bill_ledger").glob("*.json")):
    bills = json.loads(path.read_text())["bills"]
    for key in list(bills)[:2]:
        url = bills[key].get("text_url") or bills[key].get("url")
        if url:
            items.append((path.stem, key, url))
with ThreadPoolExecutor(8) as pool:
    for line in pool.map(probe, items):
        print(line, flush=True)
