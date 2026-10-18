#!/usr/bin/env python3
"""Diagnostic (workflow only), round 3: NH bill text URLs, WY bill text URLs, MT subject shape."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bill_enumerators import CHROME, http  # noqa: E402


def get(label, url, headers=None, data=None, show=250, timeout=40):
    t = time.monotonic()
    try:
        raw = http(url, headers=headers or CHROME, data=data, tries=1, timeout=timeout)
    except Exception as exc:
        print(f"[{label}] {url[:160]} -> {type(exc).__name__} {getattr(exc, 'code', '')} {str(exc)[:60]}", flush=True)
        return None
    print(f"[{label}] {url[:160]} -> {len(raw)}b {raw[:6]!r} ({time.monotonic() - t:.1f}s) :: {re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', raw[:2500].decode('utf-8', 'replace')))[:show]!r}", flush=True)
    return raw


def main():
    print("=== NH")
    for u in ("http://gencourt.state.nh.us/legislation/2026/CACR0010.html", "https://gencourt.state.nh.us/legislation/2026/CACR0010.html",
              "https://gc.nh.gov/legislation/2026/CACR0010.html", "https://gc.nh.gov/bill_status/legacy/bs2016/bill_status.aspx?lsr=1&sy=2026&sortoption=&txtsessionyear=2026&txtbillnumber=CACR10",
              "https://gc.nh.gov/bill_status/legacy/bs2016/billText.aspx?sy=2026&id=1&txtFormat=html",
              "https://gc.nh.gov/bill_status/billinfo.aspx?id=1&inflect=2", "https://gc.nh.gov/bill_status/billText.aspx?sy=2026&id=1&txtFormat=html&v=HB0001",
              "https://gc.nh.gov/bill_status/pdf.aspx?id=1&q=billVersion"):
        get("nh", u)
    raw = get("nh-rss", "https://gc.nh.gov/rssFeeds/rssQueryResults.aspx?&sortoption=&txtsessionyear=2026", show=0, timeout=180)
    if raw:
        text = raw.decode("utf-8-sig", "replace")
        item = re.search(r"<item>.*?</item>", text, re.S)
        print("RSS item:", re.sub(r"\s+", " ", item.group(0))[:900] if item else "none")
        for link in re.findall(r"<link>([^<]+)</link>", text)[3:6]:
            print("   link", link)
    print("=== WY text")
    for u in ("https://wyoleg.gov/2026/Introduced/HB0001.pdf", "https://wyoleg.gov/2026/Introduced/HB0002.pdf", "https://wyoleg.gov/2025/Introduced/HB0002.pdf",
              "https://wyoleg.gov/Legislation/2026/HB0002", "https://lsoservice.wyoleg.gov/api/BillInformation/2026/HB0002", "https://lsoservice.wyoleg.gov/api/BillInformation/HB0002?$filter=Year%20eq%202026"):
        get("wy", u)
    print("=== MT subjects")
    raw = get("mt", "https://api.legmt.gov/bills/v1/bills/search?limit=2&offset=0", headers={**CHROME, "Content-Type": "application/json"}, data=json.dumps({"sessionIds": [2]}).encode(), show=0, timeout=90)
    if raw:
        print("subjects:", json.dumps(json.loads(raw)["content"][0]["draft"].get("subjects"))[:500])
    print("=== AL more fields")
    for q in ('{instruments(limit:1){data{id instrumentNbr actSummary}}}', '{instruments(limit:1){data{id instrumentNbr subject}}}',
              '{instruments(limit:1){data{id instrumentNbr sponsor sponsorName instrumentType}}}'):
        get("al", "https://alison.legislature.state.al.us/graphql", headers={**CHROME, "Content-Type": "application/json"}, data=json.dumps({"query": q}).encode(), show=450)


if __name__ == "__main__":
    main()
