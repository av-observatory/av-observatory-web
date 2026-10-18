#!/usr/bin/env python3
"""Diagnostic (workflow only), round 2: exact field names / text URLs for the title-only states. Prints compact shapes."""
import hashlib
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bill_enumerators import CHROME, http  # noqa: E402


def get(label, url, headers=None, data=None, show=300, timeout=40):
    t = time.monotonic()
    try:
        raw = http(url, headers=headers or CHROME, data=data, tries=1, timeout=timeout)
    except Exception as exc:
        print(f"[{label}] {url[:150]} -> {type(exc).__name__} {getattr(exc, 'code', '')} {str(exc)[:80]}", flush=True)
        return None
    print(f"[{label}] {url[:150]} -> {len(raw)}b {raw[:5]!r} ({time.monotonic() - t:.1f}s) :: {re.sub(r'\s+', ' ', raw[:show].decode('utf-8', 'replace'))!r}", flush=True)
    return raw


def shape(obj, depth=0):
    """key -> short value preview (strings cut to 70 chars); nested dicts/lists summarised."""
    if isinstance(obj, dict):
        return {k: (shape(v, depth + 1) if depth < 1 else type(v).__name__) for k, v in obj.items()}
    if isinstance(obj, list):
        return [shape(obj[0], depth + 1)] if obj else []
    return (obj[:70] if isinstance(obj, str) else obj)


def main():
    print("=== WY BillInformation top-level fields")
    raw = get("wy", "https://lsoservice.wyoleg.gov/api/BillInformation?$filter=Year%20eq%202026&$top=1", show=0, timeout=90)
    if raw:
        item = json.loads(raw)[0]
        print({k: (v[:80] if isinstance(v, str) else type(v).__name__) for k, v in item.items()})
    print("=== MT search row top-level + draft fields")
    raw = get("mt", "https://api.legmt.gov/bills/v1/bills/search?limit=2&offset=0", headers={**CHROME, "Content-Type": "application/json"}, data=json.dumps({"sessionIds": [2]}).encode(), show=0, timeout=90)
    if raw:
        row = json.loads(raw)["content"][0]
        print({k: (v[:80] if isinstance(v, str) else type(v).__name__) for k, v in row.items()})
        print("draft:", {k: (v[:120] if isinstance(v, str) else type(v).__name__) for k, v in (row.get("draft") or {}).items()})
    print("=== AZ DocType + text")
    raw = get("az", "https://apps.azleg.gov/api/DocType/?billStatusId=83529", show=1500)
    if raw:
        for path in re.findall(r'"HtmlPath":"([^"]+)"', raw.decode("utf-8", "replace"))[:2]:
            get("az-text", path, show=300)
    print("=== GA legislation detail fields")
    ts = str(int(time.time() * 1000))
    key = hashlib.sha512(("QFpCwKfd7" + "fjVEXFFwSu36BwwcP83xYgxLAhLYmKk" + "letvarconst" + ts).encode()).hexdigest()
    try:
        token = json.loads(http(f"https://www.legis.ga.gov/api/authentication/token?key={key}&ms={ts}", headers=CHROME))
        h = {**CHROME, "Authorization": "Bearer " + token, "Content-Type": "application/json"}
        raw = get("ga", "https://www.legis.ga.gov/api/legislation/detail/69281", headers=h, show=0)
        if raw:
            print(json.dumps(shape(json.loads(raw)))[:2500])
    except Exception as exc:
        print("ga token failed", type(exc).__name__)
    print("=== NH bill text")
    raw = get("nh-rss", "https://gc.nh.gov/rssFeeds/rssQueryResults.aspx?&sortoption=&txtsessionyear=2026", show=0, timeout=180)
    if raw:
        m = re.search(rb"<item>.*?<link>([^<]+)</link>", raw, re.S)
        link = m.group(1).decode() if m else ""
        print("nh link", link)
        idm = re.search(r"id=(\d+)", link)
        if idm:
            for u in (f"https://gc.nh.gov/bill_status/billText.aspx?sy=2026&id={idm.group(1)}&txtFormat=html",
                      f"https://gc.nh.gov/bill_status/billText.aspx?sy=2026&id={idm.group(1)}&txtFormat=pdf&v=Introduced",
                      f"https://gc.nh.gov/bill_status/billinfo.aspx?id={idm.group(1)}&inflect=2"):
                get("nh", u, show=300)
    print("=== NJ text URLs")
    for u in ("https://pub.njleg.state.nj.us/Bills/2026/A1000_I1.HTM", "https://pub.njleg.state.nj.us/Bills/2026/A0001_I1.HTM",
              "https://pub.njleg.state.nj.us/Bills/2026/A1000_I1.PDF", "https://www.njleg.state.nj.us/bill-search/2026/A1000"):
        get("nj", u, show=200)
    print("=== VA text/summary URLs")
    for u in ("https://lis.blob.core.windows.net/lisfiles/20261/HB1125.HTM", "https://lis.blob.core.windows.net/lisfiles/20261/HB1125.PDF",
              "https://lis.blob.core.windows.net/lisfiles/20261/HB1125H1.PDF", "https://lis.virginia.gov/api/Legislation/20261/HB1125",
              "https://legacylis.virginia.gov/cgi-bin/legp604.exe?261+sum+HB1125", "https://lis.blob.core.windows.net/lisfiles/20261/SUMMARY.CSV",
              "https://lis.blob.core.windows.net/lisfiles/20261/BILL_SUMMARY.CSV"):
        get("va", u, show=250)
    print("=== AL: field guesses and pdf")
    body = lambda q: json.dumps({"query": q}).encode()
    for q in ('{instruments(limit:1){data{id synopsis}}}', '{instruments(limit:1){data{id instrumentNbr title description summary digest}}}',
              '{instruments(limit:1){data{id instrumentNbr shortTitle longTitle}}}'):
        get("al", "https://alison.legislature.state.al.us/graphql", headers={**CHROME, "Content-Type": "application/json"}, data=body(q), show=500)
    for u in ("https://alison.legislature.state.al.us/files/pdfbills/2026RS/SB222-int.pdf", "https://alison.legislature.state.al.us/files/pdfbills/2026RS/SB222.pdf",
              "https://arc-sos.alabama.gov/"):
        get("al-pdf", u, show=100)
    print("=== SD keywords")
    raw = get("sd", "https://sdlegislature.gov/api/Bills/26699", show=0)
    if raw:
        print(raw.decode()[:900])


if __name__ == "__main__":
    main()
