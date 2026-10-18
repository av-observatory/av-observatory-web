#!/usr/bin/env python3
"""Diagnostic (workflow only): print status/sponsor text for every New York AV candidate in the ledger, read from the Assembly lookup."""
import html
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from bill_enumerators import CHROME, http  # noqa: E402

known = {b["number"].replace(" ", "") for b in json.loads((ROOT / "data-state/known_av_bills.json").read_text())["bills"] if b["jurisdiction"] == "NY"}
ledger = json.loads((ROOT / "data-state/bill_ledger/NY.json").read_text())["bills"]
cands = sorted({r["number"] for r in ledger.values() if r.get("av") in ("candidate", "yes")} | known,
               key=lambda n: (n[0], int(re.sub(r"\D", "", n))))
print(f"{len(cands)} NY candidates (known list: {sorted(known)})", flush=True)
for number in cands:
    bn = f"{number[0]}{int(re.sub(chr(92) + 'D', '', number)):05d}"
    url = f"https://nyassembly.gov/leg/?default_fld=&leg_video=&bn={bn}&term=2025&Summary=Y&Actions=Y"
    try:
        raw = http(url, headers=CHROME, tries=3, timeout=60).decode("utf-8", "replace")
    except Exception as exc:
        print(f"== {number}: fetch failed {type(exc).__name__}", flush=True)
        continue
    text = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"(?is)<(script|style).*?</\1>", " ", raw))).replace("\xa0", " ").split())
    m = re.search(r"BILL NO\s+" + bn, text)
    body = text[m.start():] if m else text
    sponsor = re.search(r"(?:Sponsor|SPONSOR)[: ]+(.{0,80})", body)
    title = re.search(r"(?:TITLE|Title)[: ]+(.{0,200})", body)
    actions = re.findall(r"(\d{2}/\d{2}/\d{4})\s+((?:[A-Z][A-Za-z ,.'&;/-]{3,80}))", body)
    print(f"== {number}: {body[:420]}", flush=True)
    if sponsor: print(f"   sponsor: {sponsor.group(1)}", flush=True)
    print(f"   last actions: {actions[-3:]}", flush=True)
    time.sleep(1.0)
