#!/usr/bin/env python3
"""Cross-check the state AV bill index against independent sources and fill the gaps.

The primary feed (Open States) can answer successfully and still not list a bill. This script:
  1. Adds bills from ``data-state/manual_bills.json`` (maintainer-curated from official records)
     and retires each one automatically once a feed carries the same bill.
  2. Searches a second source (LegiScan) for every jurisdiction and adds any AV bill the
     primary feed lacks, labelled ``source_feed: "legiscan"``.
  3. Writes ``data-state/legislation_coverage.json`` and, with --open-issues, files de-duplicated
     GitHub issues (label ``data-coverage``) for: bills only the second source found, a second
     source that is not configured or failing (so the check can never fail silently), and
     manual entries that can now be removed.

Run AFTER refresh-legislation.py. Usage: legislation-supplement.py [--open-issues]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACKER = ROOT / "public/data/legislation_tracker.json"
MANUAL = ROOT / "data-state/manual_bills.json"
COVERAGE = ROOT / "data-state/legislation_coverage.json"
TODAY = date.today().isoformat()
SUMMARY_FALLBACK = "Substantive summary unavailable in the source feed; review the official bill record for the bill text."

# Same relevance test as refresh-legislation.py (that script cannot be imported: it runs on import).
RELEVANT = re.compile(
    r"\b(?:autonomous\s+(?:vehicle|vehicles|driving|truck|trucks|taxi|taxis|mobility|shuttle|shuttles)|"
    r"automated\s+(?:driving\s+system|driving\s+systems|vehicle|vehicles)|"
    r"driverless\s+(?:vehicle|vehicles|car|cars|truck|trucks|taxi|taxis|shuttle|shuttles)|"
    r"self[- ]driving\s+(?:vehicle|vehicles|car|cars|truck|trucks|taxi|taxis)|robotaxi(?:s)?|"
    r"highly\s+automated\s+vehicle(?:s)?)\b", re.I)
EXCLUDE = re.compile(r"\b(?:autonomous region|autonomous university|autonomous drone|unmanned aircraft)\b", re.I)
LEGISCAN_QUERY = '"autonomous vehicle" OR "automated driving system" OR driverless OR "self-driving" OR robotaxi OR "automated vehicle"'
# LegiScan bill status: 1 introduced, 2 engrossed, 3 enrolled, 4 passed (became law), 5 vetoed, 6 failed.
LEGISCAN_STATUS = {1: ("introduced", "committee"), 2: ("engrossed", "floor"), 3: ("passed", "passed_legislature"),
                   4: ("enacted", "law"), 5: ("vetoed", "executive")}


def norm_number(value: str) -> tuple:
    """'B 26-0684', 'B26-684' and 'b26-0684' all normalise to ('b', 26, 684)."""
    return tuple(int(t) if t.isdigit() else t for t in re.findall(r"[a-z]+|\d+", str(value).lower()))


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")


def key_of(bill: dict) -> tuple:
    return bill["jurisdiction"], norm_number(bill["number"])


# ---------------------------------------------------------------- LegiScan
def legiscan_get(**params):
    """One LegiScan API call; returns parsed JSON or raises."""
    params["key"] = os.environ["LEGISCAN_API_KEY"]
    url = "https://api.legiscan.com/?" + urllib.parse.urlencode(params)
    time.sleep(0.3)
    req = urllib.request.Request(url, headers={"User-Agent": "AV-Observatory/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    if data.get("status") != "OK":
        raise RuntimeError(f"LegiScan error for {params.get('op')}: {str(data.get('alert') or data)[:200]}")
    return data


def legiscan_search(code: str) -> list[dict]:
    found, page = [], 1
    while True:
        result = legiscan_get(op="getSearch", state=code, year=2, query=LEGISCAN_QUERY, page=page)["searchresult"]
        found += [v for v in result.values() if isinstance(v, dict) and "bill_number" in v]
        summary = result.get("summary") or {}
        if page >= int(summary.get("page_total") or 1):
            return found
        page += 1


def secondary_bill(code: str, hit: dict) -> dict | None:
    """Build a tracker record from a LegiScan hit (one getBill call for status and official link)."""
    detail = legiscan_get(op="getBill", id=hit["bill_id"]).get("bill") or {}
    status_code = int(detail.get("status") or 1)
    if status_code not in LEGISCAN_STATUS:
        return None  # failed/dead bills are not tracked
    title = (detail.get("title") or hit.get("title") or "").strip()
    description = (detail.get("description") or "").strip()
    if not RELEVANT.search(f"{title} {description}") or EXCLUDE.search(f"{title} {description}"):
        return None
    source_url = detail.get("state_link") or detail.get("url") or hit.get("url") or ""
    if not source_url.startswith("https://"):
        source_url = hit.get("url", "")
    if not source_url.startswith("https://"):
        return None
    status, stage = LEGISCAN_STATUS[status_code]
    history = sorted(detail.get("history") or [], key=lambda h: h.get("date", ""))
    last = history[-1] if history else {}
    last_date = (last.get("date") or hit.get("last_action_date") or TODAY)[:10]
    stage_dates = {}
    for h in history:
        action = str(h.get("action", "")).lower()
        if "introduc" in action or "filed" in action:
            stage_dates.setdefault("introduced", str(h.get("date"))[:10])
        if "refer" in action or "committee" in action:
            stage_dates.setdefault("committee", str(h.get("date"))[:10])
    session = detail.get("session") or {}
    session_name = str(session.get("year_start") or session.get("session_name") or "")
    number = hit["bill_number"]
    return {
        "id": f"{code.lower()}-{slug(number)}-{slug(session_name) or 'current'}",
        "jurisdiction": code, "number": number, "title": title,
        "summary": SUMMARY_FALLBACK, "takeaway": SUMMARY_FALLBACK, "source_summary": description[:500],
        "summary_method": "Second-source record; no substantive summary has been written",
        "summary_quality": "source_summary_insufficient", "status": status,
        "measure_type": "resolution" if re.search(r"resolution", f"{detail.get('bill_type_name', '')} {title}", re.I) else "bill",
        "last_action_date": last_date, "last_action": str(last.get("action") or hit.get("last_action") or "")[:300],
        "session": session_name, "progress_stage": stage, "stage_dates": stage_dates, "hearings": [],
        "source_url": source_url, "repository_url": hit.get("url") or source_url,
        "reviewed_at": TODAY, "summary_reviewed_at": None, "source_feed": "legiscan",
        "legiscan_bill_id": detail.get("bill_id") or hit.get("bill_id"),
    }


# ---------------------------------------------------------------- merge logic
def merge_manual(tracker: dict, manual: list[dict]) -> tuple[list[str], list[str]]:
    # Drop manual entries from an earlier run so only a real feed counts as "already present".
    tracker["state_bills"] = [b for b in tracker["state_bills"] if b.get("source_feed") != "manual_official"]
    present = {key_of(b) for b in tracker["state_bills"]}
    added, retired = [], []
    for bill in manual:
        if key_of(bill) in present:
            retired.append(bill["id"])  # a feed now carries it: the manual entry can be removed
            continue
        record = dict(bill, reviewed_at=TODAY, source_feed="manual_official")
        tracker["state_bills"].append(record)
        present.add(key_of(record))
        added.append(bill["id"])
    return added, retired


def merge_secondary(tracker: dict, codes: list[str], coverage: dict) -> None:
    present = {key_of(b): b for b in tracker["state_bills"]}
    for code in codes:
        entry = coverage.setdefault(code, {})
        try:
            hits = legiscan_search(code)
        except Exception as exc:
            entry["legiscan"] = f"error: {exc.__class__.__name__}: {str(exc)[:120]}"
            continue
        entry["legiscan"], entry["legiscan_hits"], entry["added_from_legiscan"] = "ok", len(hits), []
        for hit in hits:
            existing = present.get((code, norm_number(hit["bill_number"])))
            if existing is not None:
                existing["legiscan_bill_id"] = hit.get("bill_id")
                continue
            try:
                bill = secondary_bill(code, hit)
            except Exception as exc:
                entry.setdefault("detail_errors", []).append(f"{hit.get('bill_number')}: {exc.__class__.__name__}")
                continue
            if bill is None:
                continue
            tracker["state_bills"].append(bill)
            present[key_of(bill)] = bill
            entry["added_from_legiscan"].append(bill["number"])


# ---------------------------------------------------------------- alerts
def open_issue(key: str, title: str, body: str, only_open: bool = False) -> None:
    state = "open" if only_open else "all"
    found = subprocess.run(["gh", "issue", "list", "--state", state, "--label", "data-coverage", "--search",
                            f"coverage-key:{key} in:body", "--json", "number"], capture_output=True, text=True)
    if found.returncode == 0 and json.loads(found.stdout or "[]"):
        print(f"  alert already filed: {key}")
        return
    subprocess.run(["gh", "label", "create", "data-coverage", "--color", "fbca04", "--description",
                    "A data source may be missing records"], capture_output=True)
    subprocess.run(["gh", "issue", "create", "--title", title, "--label", "data-coverage",
                    "--body", f"{body}\n\ncoverage-key:{key}"], check=False)


def alerts(report: dict, retired: list[str], configured: bool) -> list[tuple]:
    out = []
    if not configured:
        out.append(("legiscan-not-configured", "Legislation cross-check is not running (LEGISCAN_API_KEY missing)",
                    "The second legislation source is not configured, so bills missing from Open States cannot be detected. "
                    "Create a free key at https://legiscan.com/legiscan and run `gh secret set LEGISCAN_API_KEY "
                    "--repo av-observatory/av-observatory-web`.", True))
    for code, entry in sorted(report["jurisdictions"].items()):
        added = entry.get("added_from_legiscan") or []
        if added:
            digest = hashlib.sha256(",".join(sorted(added)).encode()).hexdigest()[:10]
            out.append((f"missing-{code}-{digest}", f"Open States is missing {len(added)} {code} AV bill(s): {', '.join(added)}",
                        f"LegiScan lists these autonomous-vehicle bills for {code}, but Open States does not. They were added "
                        "to the site automatically with a placeholder summary and the label `legiscan`. Review each official "
                        "record, then consider writing a summary.", False))
        if str(entry.get("legiscan", "ok")).startswith("error"):
            out.append((f"legiscan-error-{code}-{TODAY}", f"Legislation cross-check failed for {code}",
                        f"LegiScan returned `{entry['legiscan']}` for {code} on {TODAY}; that jurisdiction was not cross-checked today.", False))
    for bill_id in retired:
        out.append((f"manual-retired-{bill_id}", f"Manual bill {bill_id} is now in a feed; remove it from manual_bills.json",
                    "A data feed now carries this bill, so the manual override in `data-state/manual_bills.json` is redundant.", False))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--open-issues", action="store_true")
    args = ap.parse_args()
    tracker = json.loads(TRACKER.read_text(encoding="utf-8"))
    manual = json.loads(MANUAL.read_text(encoding="utf-8")) if MANUAL.exists() else []
    codes = [s["code"] for s in tracker["states"]]
    report = {"generated": TODAY, "jurisdictions": {c: {"primary_bills": sum(1 for b in tracker["state_bills"]
              if b["jurisdiction"] == c and not b.get("source_feed"))} for c in codes}}

    added_manual, retired = merge_manual(tracker, manual)
    configured = bool(os.environ.get("LEGISCAN_API_KEY"))
    if configured:
        merge_secondary(tracker, codes, report["jurisdictions"])
    else:
        print("::warning::LEGISCAN_API_KEY not set; second-source cross-check skipped")
    report["manual_added"], report["manual_retired"], report["second_source_configured"] = added_manual, retired, configured

    tracker["state_bills"].sort(key=lambda b: (b["jurisdiction"], b["number"], b["session"]))
    TRACKER.write_text(json.dumps(tracker, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    COVERAGE.parent.mkdir(exist_ok=True)
    COVERAGE.write_text(json.dumps(report, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    pending = alerts(report, retired, configured)
    print(f"manual added={len(added_manual)} retired={len(retired)} alerts={len(pending)}")
    if args.open_issues:
        for key, title, body, only_open in pending:
            open_issue(key, title, body, only_open)
    return 0


if __name__ == "__main__":
    sys.exit(main())
