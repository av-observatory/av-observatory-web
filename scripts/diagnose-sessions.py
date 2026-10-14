#!/usr/bin/env python3
"""For each jurisdiction: show which Open States session the daily refresh picks, every recent session,
and how many AV bills each session returns. Never prints the API key."""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

KEY = os.environ.get("OPENSTATES_API_KEY") or sys.exit("OPENSTATES_API_KEY is not configured")
CODES = [c.upper() for c in sys.argv[1:]] or ["AK", "FL", "LA", "MO", "MS", "DC"]
AV = '"autonomous vehicle" OR "automated driving system" OR driverless OR "self-driving" OR robotaxi OR "automated vehicle"'


def get(path, **params):
    time.sleep(1.3)
    url = "https://v3.openstates.org" + path + "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={"X-API-KEY": KEY, "User-Agent": "AV-Observatory-diagnose/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except Exception as exc:
        return {"error": f"{exc.__class__.__name__}: {exc}"}


def refresh_pick(sessions):
    """Exact copy of the selection in refresh-legislation.py load_current_sessions()."""
    today = date.today().isoformat()
    active = [x for x in sessions if x.get("identifier") and str(x.get("start_date") or "") <= today
              and (not x.get("end_date") or today <= str(x.get("end_date")))]
    if not active:
        yr = str(date.today().year)
        active = [x for x in sessions if x.get("identifier") and (str(x.get("start_date") or "").startswith(yr)
                  or str(x.get("end_date") or "").startswith(yr))]
    ordered = sorted(active or [x for x in sessions if x.get("identifier")],
                     key=lambda x: (str(x.get("start_date") or ""), str(x.get("end_date") or ""), str(x.get("identifier"))), reverse=True)
    return str(ordered[0]["identifier"]) if ordered else None


payload = get("/jurisdictions", classification="state", include=["legislative_sessions"], per_page=52)
by_code = {}
for j in payload.get("results", []):
    jid = str(j.get("id", ""))
    code = (jid.split("state:")[1][:2] if "state:" in jid else "DC" if "district:dc" in jid else "").upper()
    by_code[code] = j
for code in CODES:
    j = by_code.get(code)
    if not j:
        print(f"\n##### {code}: not found in /jurisdictions"); continue
    sessions = j.get("legislative_sessions", [])
    pick = refresh_pick(sessions)
    recent = sorted([s for s in sessions if str(s.get("start_date") or "") >= "2024-06-01" or not s.get("end_date")],
                    key=lambda x: str(x.get("start_date") or ""))
    print(f"\n##### {code}: refresh picks session {pick!r}")
    for s in recent:
        r = get("/bills", jurisdiction=code, session=s["identifier"], q=AV, per_page=20)
        n = (r.get("pagination") or {}).get("total_items") if "error" not in r else r["error"]
        ids = [b.get("identifier") for b in r.get("results", [])][:6] if "error" not in r else []
        mark = "  <-- PICKED" if str(s["identifier"]) == pick else ""
        print(f"  session {s['identifier']!r:>14} {s.get('start_date')} .. {s.get('end_date')}  AV bills: {n} {ids}{mark}")
