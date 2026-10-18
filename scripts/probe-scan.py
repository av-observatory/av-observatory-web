#!/usr/bin/env python3
"""Diagnostic (workflow only): fetch bills whose scan failed, print status/size/text snippet, and try alternative endpoints.
Usage: probe-scan.py STATE[,STATE...]  (samples rows with scan_failed from the committed ledgers)"""
import json
import re
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bill_enumerators import CHROME  # noqa: E402
from scan_fetch import is_bill_page  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
BROWSER_FULL = {**CHROME, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9", "Upgrade-Insecure-Requests": "1", "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "none"}
CURL = {"User-Agent": "curl/8.5.0", "Accept": "*/*"}


def trial(label, url, headers=None, number="", timeout=40, show=220):
    t = time.monotonic()
    try:
        with urlopen(Request(url, headers=headers or CHROME), timeout=timeout) as r:
            data = r.read(3_000_000)
            ctype = r.headers.get("Content-Type", "")
            code = r.status
    except Exception as exc:
        print(f"  [{label}] {url[:110]} -> {type(exc).__name__} {getattr(exc, 'code', '')} {str(exc)[:80]} ({time.monotonic() - t:.1f}s)", flush=True)
        return None
    text = " ".join(re.sub(r"<[^>]+>", " ", re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", data.decode("utf-8", "replace"))).split())
    ok = is_bill_page(text, number) if number else "-"
    print(f"  [{label}] {url[:110]} -> {code} {ctype[:30]} {len(data)}b text={len(text)} billpage={ok} ({time.monotonic() - t:.1f}s) :: {text[:show]}", flush=True)
    return data


def failed_rows(state, n=4):
    rows = [(k, v) for k, v in json.loads((ROOT / f"data-state/bill_ledger/{state}.json").read_text())["bills"].items() if v.get("scan_failed")]
    step = max(1, len(rows) // n)
    return rows[::step][:n]


def main():
    for state in sys.argv[1].split(","):
        print(f"=== {state}", flush=True)
        for key, row in failed_rows(state):
            url = row.get("text_url") or row["url"]
            print(f" {key} previously: {row.get('scan_error')}", flush=True)
            trial("chrome", url, CHROME, row["number"])
            trial("browserfull", url, BROWSER_FULL, row["number"])
            trial("curl", url, CURL, row["number"])
        if state == "MO":
            raw = trial("xml-list", "https://documents.house.mo.gov/xml/251-BillList.xml", CHROME, show=1500, timeout=120)
            for url in ("https://house.mo.gov/billsummary.aspx?bill=HB1583&year=2025&code=R",
                        "https://house.mo.gov/Bill.aspx?bill=HB1583&year=2025&code=R",
                        "https://house.mo.gov/BillList.aspx?year=2025&code=R", "https://house.mo.gov/",
                        "https://www.senate.mo.gov/BillTracking/Bills/BillList?year=2025&session=R",
                        "https://documents.house.mo.gov/billtracking/bills251/hlrbillspdf/1583H.01I.pdf",
                        "https://documents.house.mo.gov/xml/251-HB1583.xml",
                        "https://documents.house.mo.gov/billtracking/bills251/billsum/HB1583.pdf"):
                trial("alt", url, BROWSER_FULL, "HB 1583")
            for i in range(1590, 1625):  # does a burst of sequential requests trip the block?
                u = f"https://house.mo.gov/Bill.aspx?bill=HB{i}&year=2025&code=R"
                try:
                    with urlopen(Request(u, headers=BROWSER_FULL), timeout=30) as r:
                        r.read(2000); c = r.status
                except Exception as exc:
                    c = getattr(exc, "code", type(exc).__name__)
                print("  seq", i, c, flush=True)
                time.sleep(1.5)
        if state == "PA":
            for url in ("https://www.palegis.us/legislation/bills/2025/hb1621", "https://www.palegis.us/legislation/bills/2025/hb1000",
                        "https://www.legis.state.pa.us/cfdocs/billinfo/billinfo.cfm?syear=2025&sind=0&body=H&type=B&bn=1621",
                        "https://www.palegis.us/legislation/bills/text/HTM/2025/0/HB1621/PN1790"):
                trial("alt", url, BROWSER_FULL, "HB 1621", timeout=60)
        if state == "SC":
            for url in ("https://www.scstatehouse.gov/billsearch.php?billnumbers=3000&session=126&summary=B",
                        "https://www.scstatehouse.gov/billsearch.php?billnumbers=3000&session=126&summary=B&lookupdate=",
                        "https://www.scstatehouse.gov/sess126_2025-2026/bills/3000.htm",
                        "https://www.scstatehouse.gov/sess126_2025-2026/prever/3000_20241210.htm",
                        "https://www.scstatehouse.gov/billsearch.php?billnumbers=3001&session=126&summary=B"):
                trial("alt", url, CHROME, "H 3000", show=600)
        if state == "RI":
            for url in ("https://status.rilegislature.gov/?bill=HB5067&year=2025", "https://webserver.rilegislature.gov/BillText/BillText25/HouseText25/H5067.pdf",
                        "https://webserver.rilegislature.gov/BillText/BillText25/HouseText25/H5067A.pdf"):
                trial("alt", url, CHROME, "HB 5067", show=400)


main()
