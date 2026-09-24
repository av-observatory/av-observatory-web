#!/usr/bin/env python3
"""Build the AV Observatory state legislation database from Open States API v3.

The database is independently discovered from Open States across all 50 states + DC.
NCSL and LegiScan are not used as seed lists. Official legislature source URLs are
retained where Open States provides them.

Environment:
  OPENSTATES_API_KEY   required
"""
import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEST = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "public/data/legislation_tracker.json"
KEY = os.environ.get("OPENSTATES_API_KEY")
if not KEY:
    sys.exit("OPENSTATES_API_KEY is required")

API = "https://v3.openstates.org"
JURISDICTIONS = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split()
NAMES = dict(zip(
    JURISDICTIONS,
    "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia".split("|")
))

# Deliberately broad enough to catch bills that avoid "autonomous vehicle" phrasing.
QUERIES = [
    "autonomous vehicle",
    "automated driving system",
    "driverless",
    "self-driving",
    "robotaxi",
    "automated vehicle",
]
RELEVANT = re.compile(
    r"\b(?:autonomous\s+(?:vehicle|driving|truck|taxi|mobility|shuttle)s?|"
    r"automated\s+(?:driving\s+system|vehicle)s?|"
    r"driverless\s+(?:vehicle|car|truck|taxi|shuttle)s?|"
    r"self[- ]driving\s+(?:vehicle|car|truck|taxi)s?|robotaxi(?:s)?|"
    r"highly\s+automated\s+vehicle)s?\b",
    re.I,
)
EXCLUDE = re.compile(r"\b(?:autonomous region|autonomous university|autonomous drone|unmanned aircraft)\b", re.I)

def api_get(path, params=None, retries=4):
    url = API + path
    if params:
        url += "?" + urlencode(params, doseq=True)
    req = Request(url, headers={"X-API-KEY": KEY, "User-Agent": "AV-Observatory/1.0"})
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=45) as response:
                return json.load(response)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)

def current_sessions(code):
    payload = api_get(f"/jurisdictions/{code}", {"include": ["legislative_sessions"]})
    sessions = payload.get("legislative_sessions") or []
    today = date.today().isoformat()
    active = []
    for session in sessions:
        start = str(session.get("start_date") or "")
        end = str(session.get("end_date") or "")
        if start and end and start <= today <= end:
            active.append(str(session.get("identifier") or session.get("name") or ""))
    if active:
        return [x for x in active if x]
    # Some states do not populate exact active dates. Use the most recently starting
    # session rather than silently dropping the state.
    dated = sorted(
        (s for s in sessions if s.get("identifier") or s.get("name")),
        key=lambda s: str(s.get("start_date") or ""),
        reverse=True,
    )
    return [str(dated[0].get("identifier") or dated[0].get("name"))] if dated else []

def bill_text(item):
    bits = [
        str(item.get("title") or ""),
        " ".join(str(x.get("abstract") or x) if isinstance(x, dict) else str(x) for x in (item.get("abstracts") or [])),
        " ".join(str(x) for x in (item.get("subject") or [])),
    ]
    return " ".join(bits)

def latest_action(actions):
    if not actions:
        return "", "No action text available", []
    rows = sorted(actions, key=lambda x: (str(x.get("date") or ""), int(x.get("order") or 0)))
    last = rows[-1]
    return str(last.get("date") or "")[:10], str(last.get("description") or "No action text available"), rows

def derive_status(actions):
    classes = []
    for action in actions:
        classes.extend(str(x) for x in (action.get("classification") or []))
    c = set(classes)
    if "executive-veto" in c:
        return "vetoed"
    if "became-law" in c or "executive-signature" in c:
        return "enacted"
    if "passage" in c:
        return "passed"
    if "committee-passage-favorable" in c:
        return "engrossed"
    return "introduced"

def derive_stage(actions, status):
    if status == "enacted":
        return "law"
    if status == "vetoed":
        return "executive"
    classes = [str(x) for a in actions for x in (a.get("classification") or [])]
    if status == "passed":
        return "passed_legislature"
    if any(x in classes for x in ("committee-passage-favorable", "passage")):
        return "floor"
    if any(x in classes for x in ("referral-committee", "committee-passage")):
        return "committee"
    return "introduced"

def source_urls(item):
    urls = []
    for source in item.get("sources") or []:
        if isinstance(source, dict):
            u = source.get("url")
        else:
            u = source
        if isinstance(u, str) and u.startswith("https://"):
            urls.append(u)
    official = next((u for u in urls if "openstates.org" not in u and "pluralpolicy.com" not in u), None)
    openstates = item.get("openstates_url")
    if not isinstance(openstates, str) or not openstates.startswith("https://"):
        openstates = None
    return official or openstates or "", openstates or official or ""

seen = {}
state_sessions = {}
for code in JURISDICTIONS:
    sessions = current_sessions(code)
    state_sessions[code] = sessions
    for session in sessions:
        for query in QUERIES:
            page = 1
            while True:
                payload = api_get("/bills", {
                    "jurisdiction": code,
                    "session": session,
                    "q": query,
                    "include": ["actions", "abstracts", "sources"],
                    "page": page,
                    "per_page": 50,
                })
                results = payload.get("results") or []
                for item in results:
                    text = bill_text(item)
                    if RELEVANT.search(text) and not EXCLUDE.search(text):
                        key = item.get("id") or f"{code}|{session}|{item.get('identifier')}"
                        seen[key] = item
                pagination = payload.get("pagination") or {}
                max_page = int(pagination.get("max_page") or pagination.get("pages") or page)
                if page >= max_page or not results:
                    break
                page += 1

bills = []
for item in seen.values():
    jurisdiction = str(item.get("jurisdiction") or item.get("jurisdiction_abbreviation") or "")
    if jurisdiction not in JURISDICTIONS:
        # API results normally return a jurisdiction object/name rather than abbreviation.
        jid = str((item.get("legislative_session") or {}).get("jurisdiction_id") or item.get("jurisdiction_id") or "")
        m = re.search(r"/state:([a-z]{2})", jid)
        jurisdiction = m.group(1).upper() if m else jurisdiction.upper()
    if jurisdiction not in JURISDICTIONS:
        continue
    identifier = str(item.get("identifier") or "")
    title = str(item.get("title") or "").strip()
    actions = item.get("actions") or []
    action_date, action_text, ordered_actions = latest_action(actions)
    status = derive_status(ordered_actions)
    stage = derive_stage(ordered_actions, status)
    source_url, repository_url = source_urls(item)
    session = str((item.get("legislative_session") or {}).get("identifier") or item.get("session") or "")
    abstracts = item.get("abstracts") or []
    summary = ""
    for abstract in abstracts:
        value = abstract.get("abstract") if isinstance(abstract, dict) else str(abstract)
        if value:
            summary = str(value).strip()
            break
    if not summary:
        summary = title
    stage_dates = {}
    for action in ordered_actions:
        adate = str(action.get("date") or "")[:10]
        for cls in action.get("classification") or []:
            if cls == "introduction": stage_dates["introduced"] = adate
            elif cls in {"referral-committee", "committee-passage-favorable"}: stage_dates["committee"] = adate
            elif cls == "passage": stage_dates["passed_legislature"] = adate
            elif cls in {"executive-signature", "executive-veto"}: stage_dates["executive"] = adate
            elif cls == "became-law": stage_dates["law"] = adate
    bill_id = re.sub(r"[^a-z0-9]+", "-", identifier.lower()).strip("-")
    bills.append({
        "id": f"{jurisdiction.lower()}-{bill_id}-{re.sub(r'[^0-9a-z]+','-',session.lower()).strip('-')}",
        "jurisdiction": jurisdiction,
        "number": identifier,
        "title": title,
        "summary": summary[:700],
        "takeaway": summary.split(". ")[0].rstrip(".")[:350],
        "status": status,
        "measure_type": "resolution" if any("resolution" in str(x).lower() for x in (item.get("classification") or [])) else "bill",
        "last_action_date": action_date or date.today().isoformat(),
        "last_action": action_text,
        "session": session,
        "progress_stage": stage,
        "stage_dates": stage_dates,
        "hearings": [],
        "source_url": source_url,
        "repository_url": repository_url,
        "reviewed_at": date.today().isoformat(),
        "summary_reviewed_at": None,
        "openstates_id": item.get("id"),
        "openstates_updated_at": item.get("updated_at"),
    })

# Preserve federal section from current snapshot; this workflow is specifically the
# 50-state + DC database. Federal legislation remains in its existing pipeline/page.
base = json.loads((ROOT / "public/data/legislation_tracker.json").read_text())
states = [{
    "code": code,
    "name": NAMES[code],
    "repository_url": f"https://open.pluralpolicy.com/{code.lower()}/bills/",
    "sessions": state_sessions.get(code, []),
} for code in JURISDICTIONS]

out = {
    "schema_version": "1.1.0",
    "as_of": date.today().isoformat(),
    "state_index_reviewed": date.today().isoformat(),
    "methodology": "Current-session AV legislation is independently discovered across all 50 states and DC using Open States API v3 full-text search. The database is not seeded from NCSL or LegiScan. Multiple AV search concepts are queried for each active legislative session, results are deduplicated, and normalized actions are used to derive progress status. Official legislature source URLs supplied by Open States are retained where available. Machine-discovered records should be checked against the linked official bill record before legal reliance.",
    "source": "Open States API v3 national AV bill discovery",
    "federal": base.get("federal", []),
    "state_bills": sorted(bills, key=lambda x: (x["jurisdiction"], x["number"], x["session"])),
    "states": states,
}
DEST.parent.mkdir(parents=True, exist_ok=True)
DEST.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
print(f"Open States AV database: {len(bills)} bills across {len({b['jurisdiction'] for b in bills})} jurisdictions")
