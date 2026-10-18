#!/usr/bin/env python3
"""Diagnostic (workflow only): look for a cheap summary/text endpoint for the title-only states. Prints response shapes."""
import json
import re
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bill_enumerators import CHROME, http  # noqa: E402


def get(label, url, headers=None, data=None, show=500, timeout=60):
    t = time.monotonic()
    try:
        raw = http(url, headers=headers or CHROME, data=data, tries=1, timeout=timeout)
    except Exception as exc:
        print(f"[{label}] {url[:120]} -> {type(exc).__name__} {getattr(exc, 'code', '')} {str(exc)[:80]}", flush=True)
        return None
    print(f"[{label}] {url[:120]} -> {len(raw)}b ({time.monotonic() - t:.1f}s) :: {raw[:show].decode('utf-8', 'replace')!r}", flush=True)
    return raw


def keys(obj, depth=0):
    if isinstance(obj, dict):
        return {k: (keys(v, depth + 1) if depth < 2 else type(v).__name__) for k, v in list(obj.items())[:40]}
    if isinstance(obj, list):
        return [keys(obj[0], depth + 1)] if obj else []
    return type(obj).__name__


def main():
    print("=== VA: sibling files next to BILLS.CSV")
    for name in ("BILLS.CSV", "SUMMARY.CSV", "BILLSUMMARY.CSV", "SUMMARIES.CSV", "BILL_SUMMARY.CSV", "HISTORY.CSV", "SUBJECTS.CSV", "AMENDMENTS.CSV"):
        get("va", f"https://lis.blob.core.windows.net/lisfiles/20261/{name}", show=300)
    get("va-detail", "https://lis.virginia.gov/api/BillDetails/20261/HB1125", show=800)
    print("=== SD: per-bill API")
    raw = get("sd-list", "https://sdlegislature.gov/api/Bills/Session/Light/71", show=300)
    if raw:
        first = json.loads(raw)[0]; bid = first["BillId"]; print("sd keys", list(first))
        for u in (f"https://sdlegislature.gov/api/Bills/{bid}", f"https://sdlegislature.gov/api/Bills/Detail/{bid}", f"https://sdlegislature.gov/api/Bills/Text/{bid}"):
            raw2 = get("sd", u, show=200)
            if raw2:
                try: print("   keys", json.dumps(keys(json.loads(raw2)))[:900])
                except Exception: pass
    print("=== WY: BillInformation keys")
    raw = get("wy", "https://lsoservice.wyoleg.gov/api/BillInformation?$filter=Year%20eq%202026&$top=1", show=200)
    if raw:
        try: print("   keys", json.dumps(json.loads(raw)[0] if isinstance(json.loads(raw), list) else json.loads(raw))[:1500])
        except Exception as e: print(e)
    print("=== AL: GraphQL Instrument fields")
    body = json.dumps({"query": '{__type(name:"Instrument"){fields{name}}}'}).encode()
    get("al", "https://alison.legislature.state.al.us/graphql", headers={**CHROME, "Content-Type": "application/json"}, data=body, show=1500)
    print("=== MT: search row keys")
    body = json.dumps({"sessionIds": [2]}).encode()
    raw = get("mt", "https://api.legmt.gov/bills/v1/bills/search?limit=2&offset=0", headers={**CHROME, "Content-Type": "application/json"}, data=body, show=100)
    if raw:
        print("   row", json.dumps(json.loads(raw)["content"][0])[:1800])
    print("=== AZ: list row + overview endpoints")
    raw = get("az", "https://apps.azleg.gov/api/Bill/?sessionID=130", show=100)
    if raw:
        data = json.loads(raw); rows = data if isinstance(data, list) else data.get("ListItems") or []
        print("   row", json.dumps(rows[0])[:600] if rows else str(data)[:300])
        bid = rows[0].get("BillId") if rows else None
        for u in (f"https://apps.azleg.gov/api/BillStatusOverview/{bid}", f"https://apps.azleg.gov/api/Bill/{bid}", f"https://apps.azleg.gov/api/BillStatus/{bid}",
                  f"https://apps.azleg.gov/api/DocType/?billStatusId={bid}"):
            get("az", u, show=700)
    print("=== NH: bill text page")
    get("nh", "https://gc.nh.gov/bill_status/billinfo.aspx?id=1&inflect=2", show=400)
    print("=== GA: legislation detail")
    import hashlib
    ts = str(int(time.time() * 1000))
    key = hashlib.sha512(("QFpCwKfd7" + "fjVEXFFwSu36BwwcP83xYgxLAhLYmKk" + "letvarconst" + ts).encode()).hexdigest()
    token = json.loads(http(f"https://www.legis.ga.gov/api/authentication/token?key={key}&ms={ts}", headers=CHROME))
    h = {**CHROME, "Authorization": "Bearer " + token, "Content-Type": "application/json"}
    raw = get("ga", "https://www.legis.ga.gov/api/Legislation/Search/2/0", headers=h, data=json.dumps({"sessionId": 1033}).encode(), show=100)
    if raw:
        r0 = json.loads(raw)["results"][0]; print("   row", json.dumps(r0)[:800])
        lid = r0.get("legislationId")
        for u in (f"https://www.legis.ga.gov/api/legislation/detail/{lid}", f"https://www.legis.ga.gov/api/Legislation/{lid}", f"https://www.legis.ga.gov/api/legislation/summary/{lid}"):
            get("ga", u, headers=h, show=1200)
    print("=== DC: LIMS detail")
    for u in ("https://lims.dccouncil.gov/api/search/GetLegislationMetadata/B26-0684", "https://lims.dccouncil.gov/api/v2/legislation/B26-0684",
              "https://lims.dccouncil.gov/api/search/GetLegislationDetail/B26-0684"):
        get("dc", u, show=900)
    print("=== NJ: MAINBILL columns come from the DB zip (Synopsis already used)")
    print("=== AK/AL pages (stale scan flags)")
    get("ak", "https://www.akleg.gov/basis/Bill/Detail/34?Root=HB%20217", show=300)
    get("al", "https://alison.legislature.state.al.us/bill/2026rs/sb222", show=300)


main()
