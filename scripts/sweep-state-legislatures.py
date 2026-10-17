#!/usr/bin/env python3
"""Build our own AV bill database straight from every state legislature's official site.

Independent of Open States. For each of the 50 states + DC in ``official_sources.json``:
  1. DISCOVER  search the state's own legislative domain, fetch the pages, keep those that are
     about autonomous vehicles and name a bill, and add a stub to the database.
  2. EXTRACT   for stubs not yet processed, read the official page and extract the bill's
     number, title, session, status, stage and last action (Claude, grounded in the page text;
     the bill number and AV relevance are verified in code).
  3. SUMMARIZE the bill with the same verified, fact-checked editorial pipeline as the rest of
     the site (ai-policy-editorial.summarize), grounded in the official text.

``data-state/official_bills.json`` is the database. legislation-supplement.py merges verified
records into the public index (retiring ours once an Open States feed carries the same bill).
``data-state/docket_sweep_log.json`` records per-state checked / sources_read / unreadable.

States are swept least-recently-attempted first and unprocessed stubs persist, so rate limits,
call caps or a blocked site just defer work to the next run.
Usage: sweep-state-legislatures.py [--budget-minutes N] [--max-new N]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import runpy
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from legislation_source_text import fetch  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "data-state/official_sources.json"
SWEEP_LOG = ROOT / "data-state/docket_sweep_log.json"
DATABASE = ROOT / "data-state/official_bills.json"
TRACKER = ROOT / "public/data/legislation_tracker.json"
TODAY = date.today().isoformat()

RELEVANT = re.compile(
    r"\b(?:autonomous\s+(?:vehicle|vehicles|driving|truck|trucks|taxi|taxis|mobility|shuttle|shuttles)|"
    r"automated\s+(?:driving\s+system|driving\s+systems|vehicle|vehicles|motor\s+vehicle)|"
    r"driverless\s+(?:vehicle|vehicles|car|cars|truck|trucks|taxi|taxis|shuttle|shuttles)|"
    r"self[- ]driving|robotaxi(?:s)?|highly\s+automated\s+vehicle(?:s)?)\b", re.I)
EXCLUDE = re.compile(r"\b(?:autonomous region|autonomous university|unmanned aircraft)\b", re.I)
BILL_ID = re.compile(r"\b(HB|SB|HF|SF|AB|SJR|HJR|HCR|SCR|HSB|SSB|HR|SR|LB|LD|HD|SD|A|S|H)[\s._-]*(?:No\.?\s*)?(\d{1,5})\b")
STATUSES = ("introduced", "engrossed", "passed", "enacted", "vetoed", "stricken")
STAGES = ("introduced", "committee", "floor", "passed_legislature", "executive", "law")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")


def search(host: str, query: str) -> list[str]:
    """Official-domain search; results are candidates only (fetch() enforces gov hosts)."""
    from xml.etree import ElementTree
    url = "https://www.bing.com/search?" + urlencode({"q": f"site:{host} {query}", "format": "rss"})
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 AVObservatoryResearch/1.0"})
    with urlopen(req, timeout=20) as response:
        root = ElementTree.fromstring(response.read(300000))
    suffix = host.split(".", 1)[-1]
    return [h for h in ((l.text or "").strip() for l in root.findall(".//item/link"))
            if h.startswith("https://") and (urlparse(h).hostname or "").lower().endswith(suffix)]


def bill_numbers(url: str, text: str) -> list[str]:
    """Identifiers named by the URL or the opening of the page (where the bill header sits)."""
    found = []
    for blob in (url, text[:700]):
        for prefix, digits in BILL_ID.findall(blob):
            ident = f"{prefix.upper()} {int(digits)}"
            if ident not in found:
                found.append(ident)
    return found[:3]


def number_key(value: str):
    m = re.match(r"([A-Za-z]+)[\s._-]*(\d+)", str(value or ""))
    return (m.group(1)[0].upper(), int(m.group(2))) if m else None


def in_index(jurisdiction: str, ident: str, index: list[dict]) -> bool:
    want = number_key(ident)
    return any(b.get("jurisdiction") == jurisdiction and number_key(b.get("number")) == want for b in index)


# ------------------------------------------------------------------ 1. discover
def discover(entry: dict) -> dict:
    host = (urlparse(entry["official_site"]).hostname or "").removeprefix("www.")
    urls, errors = [], []
    for query in ("autonomous vehicle bill", '"automated driving system" bill', "driverless OR self-driving vehicle bill"):
        try:
            urls += [u for u in search(host, query) if u not in urls]
        except Exception as exc:
            errors.append(f"search {type(exc).__name__}")
        time.sleep(1)
    pages = []  # (url, identifiers)
    for url in urls[:10]:
        text, provenance = fetch(url)
        if not text:
            errors.append(f"{provenance} {urlparse(url).path[:50]}")
            continue
        sample = text[:6000]
        if RELEVANT.search(sample) and not EXCLUDE.search(sample):
            idents = bill_numbers(url, text)
            if idents:
                pages.append((url, idents))
    log = {"attempted": TODAY, "searched": len(urls)}
    if pages:
        log.update(checked=TODAY, sources_read=[u for u, _ in pages],
                   bills_found=sorted({i for _, ids in pages for i in ids}))
    else:
        log["unreadable"] = ("; ".join(sorted(set(errors)))[:300] or
                             "official-site search returned no AV bill pages") + f" (searched {len(urls)} pages)"
    return {"log": log, "pages": pages}


# ------------------------------------------------------------------ 2. extract
EXTRACT_PROMPT = (
    "You extract facts about ONE state legislative bill from the text of its official page. Use ONLY the supplied text. "
    "Return JSON {is_av_bill:boolean, number:string, title:string, session:string, measure_type:'bill'|'resolution', "
    "status:one of introduced|engrossed|passed|enacted|vetoed|stricken, "
    "progress_stage:one of introduced|committee|floor|passed_legislature|executive|law, "
    "last_action:string, last_action_date:'YYYY-MM-DD' or null, reason:string}. "
    "is_av_bill is true only if the bill substantively concerns autonomous/automated/driverless vehicles. "
    "number is the bill's own identifier as printed (e.g. 'SB 1417'). session is the legislative session or year as printed. "
    "last_action/last_action_date are the most recent action stated on the page; null the date if not stated. Never guess.")


def extract(invoke, entry: dict, url: str, text: str, ident: str) -> dict | None:
    data = invoke([{"role": "system", "content": EXTRACT_PROMPT},
                   {"role": "user", "content": json.dumps({"jurisdiction": entry["name"], "expected_number": ident,
                                                           "source_url": url, "page_text": text[:14000]})}])
    number = str(data.get("number") or ident)
    if not data.get("is_av_bill") or number_key(number) != number_key(ident):
        return None
    if data.get("status") not in STATUSES or data.get("progress_stage") not in STAGES:
        return None
    action_date = data.get("last_action_date")
    if not (isinstance(action_date, str) and DATE.match(action_date) and action_date <= TODAY):
        return None
    session = str(data.get("session") or "").strip()
    title = " ".join(str(data.get("title") or "").split())
    if not session or not title:
        return None
    return {
        "id": f"{entry['code'].lower()}-{slug(number)}-{slug(session)}",
        "jurisdiction": entry["code"], "number": number, "title": title, "session": session,
        "status": data["status"], "measure_type": data.get("measure_type") if data.get("measure_type") in ("bill", "resolution") else "bill",
        "progress_stage": data["progress_stage"], "stage_dates": {data["progress_stage"]: action_date}, "hearings": [],
        "last_action": " ".join(str(data.get("last_action") or "").split())[:300], "last_action_date": action_date,
        "source_url": url, "repository_url": url, "source_feed": "official_sweep"}


def adopt_ledger_candidates(bills: dict) -> int:
    """AV candidates found by enumerate-bills.py (every bill, every state) join the work queue."""
    added = 0
    for path in sorted((ROOT / "data-state/bill_ledger").glob("[A-Z][A-Z].json")):
        ledger = json.loads(path.read_text())
        for row in ledger["bills"].values():
            nk = number_key(row["number"])
            if row.get("av") != "candidate" or not row.get("url") or not nk:
                continue
            key = f"{ledger['jurisdiction']}:{nk[0]}{nk[1]}"
            if key not in bills:
                bills[key] = {"jurisdiction": ledger["jurisdiction"], "number": row["number"], "source_url": row["url"],
                              "stage": "discovered", "discovered": TODAY, "via": f"ledger:{row.get('via')}"}
                added += 1
    return added


# ------------------------------------------------------------------ main
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget-minutes", type=float, default=25)
    ap.add_argument("--max-new", type=int, default=int(os.getenv("SWEEP_MAX_NEW", "15")))
    args = ap.parse_args()
    jurisdictions = json.loads(SOURCES.read_text())["jurisdictions"]
    by_code = {j["code"]: j for j in jurisdictions}
    log = json.loads(SWEEP_LOG.read_text()) if SWEEP_LOG.exists() else {}
    database = json.loads(DATABASE.read_text()) if DATABASE.exists() else {"note": "First-party AV bill database built from official legislature sites by scripts/sweep-state-legislatures.py", "bills": {}}
    bills = database["bills"]
    index = json.loads(TRACKER.read_text())["state_bills"]
    started = time.monotonic()
    adopted = adopt_ledger_candidates(bills)
    print(f"Adopted {adopted} AV candidate(s) from the bill ledgers", flush=True)

    def save():
        SWEEP_LOG.write_text(json.dumps(log, indent=1, sort_keys=True) + "\n")
        DATABASE.write_text(json.dumps(database, indent=1, sort_keys=True, ensure_ascii=False) + "\n")

    # 1. DISCOVER: least-recently-attempted first.
    order = sorted(jurisdictions, key=lambda j: (log.get(j["code"], {}).get("attempted") or "", j["code"]))
    swept = readable = 0
    for entry in order:
        if time.monotonic() - started > args.budget_minutes * 60 * 0.6:
            break
        code = entry["code"]
        try:
            out = discover(entry)
        except Exception as exc:
            out = {"log": {"attempted": TODAY, "unreadable": f"sweep error {type(exc).__name__}"}, "pages": []}
        merged = {**log.get(code, {}), **out["log"]}
        if "unreadable" not in out["log"]:
            merged.pop("unreadable", None)
        log[code] = merged
        for url, idents in out["pages"]:
            for ident in idents[:1]:
                key = f"{code}:{number_key(ident)[0]}{number_key(ident)[1]}"
                if key not in bills:
                    bills[key] = {"jurisdiction": code, "number": ident, "source_url": url, "stage": "discovered", "discovered": TODAY}
        swept += 1
        readable += "unreadable" not in out["log"]
        print(f"Sweep {code}: {out['log'].get('unreadable') or 'read ' + str(len(out['pages'])) + ' AV pages'}", flush=True)
        save()
    print(f"Swept {swept}/{len(jurisdictions)} jurisdictions; {readable} produced official AV pages", flush=True)

    # 2+3. EXTRACT and SUMMARIZE unprocessed stubs (oldest first; durable across runs).
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set; stubs stay queued")
        return 0
    editorial = runpy.run_path(str(Path(__file__).resolve().parent / "ai-policy-editorial.py"))
    invoke, summarize = editorial["invoke"], editorial["summarize"]
    done = 0
    pending = sorted((k for k, b in bills.items() if b.get("stage") in ("discovered", "extracted")),
                     key=lambda k: bills[k].get("discovered", ""))
    for key in pending:
        if done >= args.max_new or time.monotonic() - started > args.budget_minutes * 60:
            break
        stub = bills[key]
        entry = by_code[stub["jurisdiction"]]
        done += 1
        try:
            text, _ = fetch(stub["source_url"])
            if not text:
                print(f"  {key}: page unreadable; stays queued", flush=True)
                continue
            record = extract(invoke, entry, stub["source_url"], text, stub["number"]) if RELEVANT.search(text[:6000]) else None
        except Exception as exc:
            print(f"  {key}: extraction error {type(exc).__name__}", flush=True)
            continue
        if not record:
            stub.update(stage="rejected", reason="not a verifiable AV bill page", checked=TODAY)
            print(f"  {key}: rejected (not a verifiable AV bill page)", flush=True)
            save()
            continue
        if in_index(record["jurisdiction"], record["number"], index):
            bills[key] = {**record, "stage": "in_feed", "checked": TODAY}
            print(f"  {key}: already carried by a feed", flush=True)
            save()
            continue
        try:
            result = summarize(record, "state_bill")
        except Exception as exc:
            result, record["editorial_failure_reason"] = "error", f"{type(exc).__name__}: {str(exc)[:160]}"
        stage = "verified" if result == "updated" and record.get("editorial_status") == "verified" else "extracted"
        bills[key] = {**record, "stage": stage, "checked": TODAY, "discovered": stub.get("discovered", TODAY)}
        print(f"  {key}: {result} -> {stage}", flush=True)
        save()
    save()
    print("Database:", {s: sum(1 for b in bills.values() if b.get("stage") == s)
                        for s in sorted({b.get("stage") for b in bills.values()})})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
