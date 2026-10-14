#!/usr/bin/env python3
"""Print what Open States returns for a jurisdiction (default DC); never prints the API key."""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

KEY = os.environ.get("OPENSTATES_API_KEY")
if not KEY:
    sys.exit("OPENSTATES_API_KEY is not configured")
CODE = (sys.argv[1] if len(sys.argv) > 1 else "DC").upper()


def get(path, **params):
    url = "https://v3.openstates.org" + path + "?" + urllib.parse.urlencode(params, doseq=True)
    time.sleep(1.3)
    req = urllib.request.Request(url, headers={"X-API-KEY": KEY, "User-Agent": "AV-Observatory-diagnose/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        return {"error": f"{exc.__class__.__name__}: {exc}"}


print(f"=== Jurisdictions matching {CODE}")
js = get("/jurisdictions", classification="state", include=["legislative_sessions"], per_page=52)
for j in js.get("results", []):
    if CODE.lower() in str(j.get("id", "")).lower() or j.get("name") == "District of Columbia":
        sess = [(s.get("identifier"), s.get("start_date"), s.get("end_date")) for s in j.get("legislative_sessions", [])][-4:]
        print(json.dumps({"id": j["id"], "name": j["name"], "classification": j.get("classification"), "last_sessions": sess}))
if "error" in js:
    print("jurisdictions error:", js["error"])

for label, params in [
    ("AV full-text query, session 26 (what the refresh runs)", dict(jurisdiction=CODE, session="26", q='"autonomous vehicle" OR "automated driving system" OR driverless OR "self-driving" OR robotaxi OR "automated vehicle"')),
    ("title search 'Autonomous Vehicle Deployment', any session", dict(jurisdiction=CODE, q="Autonomous Vehicle Deployment")),
    ("newest bills in session 26 (is the feed alive?)", dict(jurisdiction=CODE, session="26", sort="updated_desc")),
]:
    print(f"\n=== {label}")
    r = get("/bills", per_page=10, **params)
    if "error" in r:
        print("error:", r["error"])
        continue
    print("total_items:", (r.get("pagination") or {}).get("total_items"))
    for b in r.get("results", []):
        print(" ", b.get("identifier"), "|", (b.get("title") or "")[:80], "| updated", str(b.get("updated_at"))[:10], "| latest action", str((b.get("latest_action") or {}).get("date")))
