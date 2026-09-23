#!/usr/bin/env python3
"""Refresh the public bill JSON from LegiScan; requires LEGIScan_API_KEY.

Writes to a temporary output and validates before replacing the reviewed snapshot.
GitHub Actions uploads the result to R2; the checked-in fallback is curated.
"""
import json
import os
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = json.loads((ROOT / "public/data/legislation_tracker.json").read_text())
KEY = os.environ.get("LEGISCAN_API_KEY")
if not KEY:
    sys.exit("LEGISCAN_API_KEY is required")
DEST = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "public/data/legislation_tracker.json"
TERMS = ['"autonomous vehicle"', '"automated driving system"', '"driverless vehicle"', '"self-driving vehicle"', '"robotaxi"']
RELEVANT = re.compile(r"\b(?:autonomous (?:vehicle|driving|truck|taxi|mobility)|automated driving system|driverless (?:vehicle|truck)|self.driving (?:vehicle|car|truck)|robotaxi)\b", re.I)
STATUS = {0: "draft", 1: "introduced", 2: "engrossed", 3: "enrolled", 4: "passed", 5: "vetoed", 6: "failed"}
SEEN = {}

def request(**params):
    url = "https://api.legiscan.com/?" + urlencode(dict(key=KEY, **params))
    with urlopen(url, timeout=30) as response:
        payload = json.load(response)
    if payload.get("status") != "OK":
        raise RuntimeError(payload.get("alert", {}).get("message", "LegiScan API error"))
    return payload

for term in TERMS:
    page = 1
    while True:
        result = request(op="getSearch", state="ALL", query=term, year=2, page=page)["searchresult"]
        summary = result["summary"]
        for row in result.values():
            if not isinstance(row, dict) or "bill_id" not in row:
                continue
            if RELEVANT.search(" ".join(str(row.get(x, "")) for x in ("title", "description"))):
                SEEN[row["bill_id"]] = row
        total_pages = int(summary["page_total"])
        if total_pages > 100:
            raise RuntimeError(f"Search '{term}' is too broad ({total_pages} pages); revise query to avoid an incomplete index")
        if page >= total_pages:
            break
        page += 1

old = {(b["jurisdiction"], re.sub(r"\W", "", b["number"]).upper()): b for b in BASE["federal"] + BASE["state_bills"]}
refreshed = []
for row in SEEN.values():
    item = request(op="getBill", id=row["bill_id"])["bill"]
    title = str(item.get("title") or "")
    description = str(item.get("description") or "")
    if not RELEVANT.search(title + " " + description):
        continue
    jurisdiction = item.get("state") or row.get("state")
    if jurisdiction not in {"US", *(s["code"] for s in BASE["states"])}:
        continue
    number = item.get("bill_number") or row.get("bill_number")
    if not number:
        continue
    original = old.get((jurisdiction, re.sub(r"\W", "", number).upper()))
    status = STATUS.get(int(item.get("status", 0)), "unclassified")
    session = item.get("session", {}).get("session_name") or (original or {}).get("session", "Current session")
    action = str(item.get("last_action") or "No action text available")
    action_date = str(item.get("last_action_date") or item.get("status_date") or "")[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", action_date):
        raise ValueError(f"Missing action date for {jurisdiction} {number}")
    url = item.get("state_link") or item.get("url")
    if not url or not url.startswith("https://"):
        url = item.get("url")
    if not url or not url.startswith("https://"):
        raise ValueError(f"Missing HTTPS source for {jurisdiction} {number}")
    # Curated descriptions are retained until a human reviews changes to the text.
    summary = (original or {}).get("summary") or (description.strip()[:280] or title)
    refreshed.append(dict(id=f"{jurisdiction.lower()}-{re.sub(r'\W', '', number).lower()}-{item.get('session', {}).get('year_start', date.today().year)}",
        jurisdiction=jurisdiction, number=number, title=title, summary=summary, takeaway=(original or {}).get("takeaway") or summary.split(". ")[0].rstrip("."),
        status=status, last_action_date=action_date, last_action=action, session=session,
        source_url=url, repository_url="https://legiscan.com/legiscan",
        reviewed_at=date.today().isoformat(), bill_id=item["bill_id"],
        summary_reviewed_at=(original or {}).get("summary_reviewed_at")))

if len(refreshed) < 10:
    raise RuntimeError(f"Only {len(refreshed)} relevant bills found; refusing to replace the snapshot")
BASE.update(as_of=date.today().isoformat(), state_index_reviewed=date.today().isoformat(), source="LegiScan API current-session search",
    federal=sorted((x for x in refreshed if x["jurisdiction"] == "US"), key=lambda x: x["last_action_date"], reverse=True),
    state_bills=sorted((x for x in refreshed if x["jurisdiction"] != "US"), key=lambda x: (x["jurisdiction"], x["number"])))
DEST.parent.mkdir(parents=True, exist_ok=True)
DEST.write_text(json.dumps(BASE, ensure_ascii=False, indent=2) + "\n")
print(f"Indexed {len(BASE['federal'])} federal and {len(BASE['state_bills'])} state bills")
