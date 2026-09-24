#!/usr/bin/env python3
"""Build the AV Observatory state legislation database from Open States API v3."""
import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
DEST = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "public/data/legislation_tracker.json"
KEY = os.environ.get("OPENSTATES_API_KEY")
if not KEY:
    sys.exit("OPENSTATES_API_KEY is required")

API = "https://v3.openstates.org"
LAST_REQUEST_AT = 0.0
MIN_REQUEST_INTERVAL = 6.5
STATE_CODES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split()
STATE_NAMES = dict(zip(
    STATE_CODES,
    "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia".split("|")
))
AV_QUERY = '"autonomous vehicle" OR "automated driving system" OR driverless OR "self-driving" OR robotaxi OR "automated vehicle"'
RELEVANT = re.compile(
    r"\b(?:autonomous\s+(?:vehicle|vehicles|driving|truck|trucks|taxi|taxis|mobility|shuttle|shuttles)|"
    r"automated\s+(?:driving\s+system|driving\s+systems|vehicle|vehicles)|"
    r"driverless\s+(?:vehicle|vehicles|car|cars|truck|trucks|taxi|taxis|shuttle|shuttles)|"
    r"self[- ]driving\s+(?:vehicle|vehicles|car|cars|truck|trucks|taxi|taxis)|robotaxi(?:s)?|"
    r"highly\s+automated\s+vehicle(?:s)?)\b",
    re.I,
)
EXCLUDE = re.compile(r"\b(?:autonomous region|autonomous university|autonomous drone|unmanned aircraft)\b", re.I)

def api_get(path, params=None, retries=5):
    global LAST_REQUEST_AT
    elapsed = time.monotonic() - LAST_REQUEST_AT
    if elapsed < MIN_REQUEST_INTERVAL:
        time.sleep(MIN_REQUEST_INTERVAL - elapsed)
    url = API + path
    if params:
        url += "?" + urlencode(params, doseq=True)
    req = Request(url, headers={"X-API-KEY": KEY, "User-Agent": "AV-Observatory/1.0"})
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=55) as response:
                LAST_REQUEST_AT = time.monotonic()
                return json.load(response)
        except HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")
            LAST_REQUEST_AT = time.monotonic()
            if exc.code == 429 and attempt < retries - 1:
                retry_after = exc.headers.get("Retry-After")
                time.sleep(float(retry_after) if retry_after and retry_after.replace(".","",1).isdigit() else 12.0)
                continue
            if exc.code < 500 or attempt == retries - 1:
                safe_url = url.split("apikey=", 1)[0]
                raise RuntimeError(f"Open States HTTP {exc.code} for {safe_url}: {body[:500]}") from exc
        except Exception:
            if attempt == retries - 1:
                raise
        time.sleep(2 ** attempt)

def state_code_from_jurisdiction(j):
    if isinstance(j, dict):
        jid = str(j.get("id") or "")
        name = str(j.get("name") or "")
    else:
        jid, name = str(j or ""), ""
    m = re.search(r"/state:([a-z]{2})(?:/|$)", jid, re.I)
    if m:
        return m.group(1).upper()
    for code, state_name in STATE_NAMES.items():
        if name == state_name:
            return code
    return ""

def load_current_sessions():
    payload = api_get("/jurisdictions", {
        "classification": "state",
        "include": ["legislative_sessions"],
        "per_page": 52,
    })
    today = date.today().isoformat()
    sessions = {code: [] for code in STATE_CODES}
    for j in payload.get("results") or []:
        code = state_code_from_jurisdiction(j)
        if code not in sessions:
            continue
        candidates = j.get("legislative_sessions") or []
        active = [
            str(x.get("identifier") or "")
            for x in candidates
            if x.get("identifier")
            and str(x.get("start_date") or "") <= today
            and (not x.get("end_date") or today <= str(x.get("end_date")))
        ]
        if not active:
            # Prefer sessions that overlap the current calendar year; otherwise newest.
            yr = str(date.today().year)
            active = [
                str(x.get("identifier") or "")
                for x in candidates
                if x.get("identifier") and (
                    str(x.get("start_date") or "").startswith(yr)
                    or str(x.get("end_date") or "").startswith(yr)
                )
            ]
        if not active:
            ordered = sorted(
                (x for x in candidates if x.get("identifier")),
                key=lambda x: str(x.get("start_date") or ""),
                reverse=True,
            )
            active = [str(ordered[0]["identifier"])] if ordered else []
        sessions[code] = list(dict.fromkeys(active))
    return sessions

def bill_text(item):
    abstracts = item.get("abstracts") or []
    abstract_text = " ".join(
        str(x.get("abstract") or "") if isinstance(x, dict) else str(x)
        for x in abstracts
    )
    return " ".join([
        str(item.get("title") or ""),
        abstract_text,
        " ".join(str(x) for x in (item.get("subject") or [])),
    ])

def latest_action(actions, item):
    if actions:
        rows = sorted(actions, key=lambda x: (str(x.get("date") or ""), int(x.get("order") or 0)))
        last = rows[-1]
        return str(last.get("date") or "")[:10], str(last.get("description") or "No action text available"), rows
    return (
        str(item.get("latest_action_date") or "")[:10],
        str(item.get("latest_action_description") or "No action text available"),
        [],
    )

def derive_status(actions):
    classes = {str(c) for a in actions for c in (a.get("classification") or [])}
    if "executive-veto" in classes:
        return "vetoed"
    if "became-law" in classes or "executive-signature" in classes:
        return "enacted"
    if "passage" in classes:
        return "passed"
    if "committee-passage-favorable" in classes:
        return "engrossed"
    return "introduced"

def derive_stage(actions, status):
    if status == "enacted":
        return "law"
    if status == "vetoed":
        return "executive"
    classes = {str(c) for a in actions for c in (a.get("classification") or [])}
    if status == "passed":
        return "passed_legislature"
    if "committee-passage-favorable" in classes:
        return "floor"
    if "referral-committee" in classes or "committee-passage" in classes:
        return "committee"
    return "introduced"

def source_urls(item):
    urls = []
    for source in item.get("sources") or []:
        u = source.get("url") if isinstance(source, dict) else source
        if isinstance(u, str) and u.startswith(("https://", "http://")):
            urls.append(u)
    openstates = item.get("openstates_url")
    if not isinstance(openstates, str) or not openstates.startswith(("https://", "http://")):
        openstates = ""
    official = next(
        (u for u in urls if "openstates.org" not in u and "pluralpolicy.com" not in u),
        ""
    )
    return official or openstates, openstates

sessions_by_state = load_current_sessions()
seen = {}

for code in STATE_CODES:
    for session in sessions_by_state.get(code, []):
        page = 1
        while True:
            payload = api_get("/bills", {
                "jurisdiction": code,
                "session": session,
                "q": AV_QUERY,
                "include": ["actions", "abstracts", "sources"],
                "sort": "latest_action_desc",
                "page": page,
                "per_page": 20,
            })
            results = payload.get("results") or []
            for item in results:
                text = bill_text(item)
                if RELEVANT.search(text) and not EXCLUDE.search(text):
                    seen[str(item.get("id") or f"{code}|{session}|{item.get('identifier')}")] = item
            pagination = payload.get("pagination") or {}
            max_page = int(pagination.get("max_page") or page)
            if page >= max_page or not results:
                break
            page += 1

bills = []
for item in seen.values():
    code = state_code_from_jurisdiction(item.get("jurisdiction"))
    if code not in STATE_CODES:
        continue
    identifier = str(item.get("identifier") or "").strip()
    title = str(item.get("title") or "").strip()
    actions = item.get("actions") or []
    action_date, action_text, ordered_actions = latest_action(actions, item)
    status = derive_status(ordered_actions)
    stage = derive_stage(ordered_actions, status)
    source_url, openstates_url = source_urls(item)
    session = str(item.get("session") or "")
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
    if not action_date:
        action_date = str(item.get("updated_at") or "")[:10] or date.today().isoformat()
    bill_id = re.sub(r"[^a-z0-9]+", "-", identifier.lower()).strip("-")
    session_slug = re.sub(r"[^0-9a-z]+", "-", session.lower()).strip("-")
    bills.append({
        "id": f"{code.lower()}-{bill_id}-{session_slug}",
        "jurisdiction": code,
        "number": identifier,
        "title": title,
        "summary": summary[:700],
        "takeaway": summary.split(". ")[0].rstrip(".")[:350],
        "status": status,
        "measure_type": "resolution" if any("resolution" in str(x).lower() for x in (item.get("classification") or [])) else "bill",
        "last_action_date": action_date,
        "last_action": action_text,
        "session": session,
        "progress_stage": stage,
        "stage_dates": stage_dates,
        "hearings": [],
        "source_url": source_url,
        "repository_url": openstates_url,
        "reviewed_at": date.today().isoformat(),
        "summary_reviewed_at": None,
        "openstates_id": item.get("id"),
        "openstates_updated_at": item.get("updated_at"),
    })

base = json.loads((ROOT / "public/data/legislation_tracker.json").read_text())
states = [{
    "code": code,
    "name": STATE_NAMES[code],
    "repository_url": "https://open.pluralpolicy.com/",
    "sessions": sessions_by_state.get(code, []),
} for code in STATE_CODES]

out = {
    "schema_version": "1.1.0",
    "as_of": date.today().isoformat(),
    "state_index_reviewed": date.today().isoformat(),
    "methodology": "Current-session AV legislation is independently discovered across all 50 states and D.C. with Open States API v3. One full-text AV query is run for each active legislative session, results are deduplicated, and normalized Open States actions are used to derive progress status. Official legislature source URLs supplied by Open States are retained where available; Open States bill URLs are stored separately for source inspection.",
    "source": "Open States API v3 national AV bill discovery",
    "federal": base.get("federal", []),
    "state_bills": sorted(bills, key=lambda x: (x["jurisdiction"], x["number"], x["session"])),
    "states": states,
}
DEST.parent.mkdir(parents=True, exist_ok=True)
DEST.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
print(f"Open States AV database: {len(bills)} bills across {len({b['jurisdiction'] for b in bills})} jurisdictions")
