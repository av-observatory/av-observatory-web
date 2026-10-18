#!/usr/bin/env python3
"""Diagnostic (workflow only): why palegis.us bill pages time out from the Actions runner, and which endpoint answers."""
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bill_enumerators import CHROME, http  # noqa: E402

CURL = {"User-Agent": "curl/8.5.0", "Accept": "*/*"}


def get(label, url, headers=None, timeout=30):
    t = time.monotonic()
    try:
        raw = http(url, headers=headers or CHROME, tries=1, timeout=timeout)
    except Exception as exc:
        print(f"[{label}] {url[:130]} -> {type(exc).__name__} {getattr(exc, 'code', '')} {str(exc)[:70]} ({time.monotonic() - t:.1f}s)", flush=True)
        return None
    print(f"[{label}] {url[:130]} -> {len(raw)}b ({time.monotonic() - t:.1f}s) :: {re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', raw[:3000].decode('utf-8', 'replace')))[:160]!r}", flush=True)
    return raw


def main():
    print("=== cold start: the index that enumeration uses")
    get("index", "https://www.palegis.us/legislation/bills/bill-index?&display=index&sessyr=2025&sessind=0&billbody=H", timeout=90)
    print("=== bill pages, one at a time, spaced 3s apart (known good, then the ones that failed)")
    for n in (1000, 1001, 1621, 1654, 1687, 1718, 1002):
        get(f"hb{n}", f"https://www.palegis.us/legislation/bills/2025/hb{n}")
        time.sleep(3)
    print("=== same with curl identity and a Referer")
    get("curl", "https://www.palegis.us/legislation/bills/2025/hb1621", headers=CURL)
    get("ref", "https://www.palegis.us/legislation/bills/2025/hb1621", headers={**CHROME, "Referer": "https://www.palegis.us/legislation/bills", "Accept": "text/html"})
    print("=== alternative hosts and formats")
    for u in ("https://www.palegis.us/legislation/bills/2025/hb1621?format=json", "https://www.legis.state.pa.us/cfdocs/billinfo/billinfo.cfm?syear=2025&sind=0&body=H&type=B&bn=1621",
              "https://www.palegis.us/legislation/bills/text/PDF/2025/0/HB1621/PN1790", "https://www.palegis.us/legislation/bills/text/HTM/2025/0/HB1621/PN1790",
              "https://www.legis.state.pa.us/cfdocs/legis/PN/Public/btCheck.cfm?txtType=HTM&sessYr=2025&sessInd=0&billBody=H&billTyp=B&billNbr=1621&pn=1790",
              "https://www.pahouse.com/", "https://www.palegis.us/", "https://www.palegis.us/rss/feeds/bills?sessyr=2025&sessind=0&billbody=H&billtype=B",
              "https://www.palegis.us/legislation/bills/2025/sb1"):
        get("alt", u)
        time.sleep(2)


if __name__ == "__main__":
    main()
