#!/usr/bin/env python3
"""Cross-check the state AV bill index against independent sources and fill the gaps.

The primary feed (Open States) can answer successfully and still not list a bill. This script:
  1. Adds bills from ``data-state/manual_bills.json`` (maintainer-curated from official records)
     and retires each one automatically once a feed carries the same bill.
  2. Writes ``data-state/legislation_coverage.json`` and, with --open-issues, files de-duplicated
     GitHub issues (label ``data-coverage``) for manual entries that can now be removed.

Run AFTER refresh-legislation.py. Usage: legislation-supplement.py [--open-issues]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACKER = ROOT / "public/data/legislation_tracker.json"
MANUAL = ROOT / "data-state/manual_bills.json"
OFFICIAL = ROOT / "data-state/official_bills.json"
COVERAGE = ROOT / "data-state/legislation_coverage.json"
TODAY = date.today().isoformat()

# Same relevance test as refresh-legislation.py (that script cannot be imported: it runs on import).
RELEVANT = re.compile(
    r"\b(?:autonomous\s+(?:vehicle|vehicles|driving|truck|trucks|taxi|taxis|mobility|shuttle|shuttles)|"
    r"automated\s+(?:driving\s+system|driving\s+systems|vehicle|vehicles)|"
    r"driverless\s+(?:vehicle|vehicles|car|cars|truck|trucks|taxi|taxis|shuttle|shuttles)|"
    r"self[- ]driving\s+(?:vehicle|vehicles|car|cars|truck|trucks|taxi|taxis)|robotaxi(?:s)?|"
    r"highly\s+automated\s+vehicle(?:s)?)\b", re.I)
EXCLUDE = re.compile(r"\b(?:autonomous region|autonomous university|autonomous drone|unmanned aircraft)\b", re.I)

def norm_number(value: str) -> tuple:
    """'B 26-0684', 'B26-684' and 'b26-0684' all normalise to ('b', 26, 684)."""
    return tuple(int(t) if t.isdigit() else t for t in re.findall(r"[a-z]+|\d+", str(value).lower()))


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")


def key_of(bill: dict) -> tuple:
    return bill["jurisdiction"], norm_number(bill["number"])


def official_database_bills() -> list[dict]:
    """Verified records from our own official-site database (scripts/sweep-state-legislatures.py)."""
    if not OFFICIAL.exists():
        return []
    bills = json.loads(OFFICIAL.read_text(encoding="utf-8")).get("bills", {}).values()
    internal = ("stage", "discovered", "checked", "reason")
    return [{k: v for k, v in b.items() if k not in internal} for b in bills
            if b.get("stage") == "verified" and b.get("summary") and b.get("takeaway")]


# ---------------------------------------------------------------- merge logic
def merge_manual(tracker: dict, manual: list[dict]) -> tuple[list[str], list[str]]:
    # Drop manual entries from an earlier run so only a real feed counts as "already present".
    tracker["state_bills"] = [b for b in tracker["state_bills"]
                              if b.get("source_feed") not in ("manual_official", "official_sweep")]
    present = {key_of(b) for b in tracker["state_bills"]}
    added, retired = [], []
    for bill in manual:
        if key_of(bill) in present:
            retired.append(bill["id"])  # a feed now carries it: the manual entry can be removed
            continue
        record = dict(bill, reviewed_at=TODAY)
        record.setdefault("source_feed", "manual_official")
        tracker["state_bills"].append(record)
        present.add(key_of(record))
        added.append(bill["id"])
    return added, retired


def apply_progress(tracker: dict) -> int:
    """Overlay first-party status from data-state/av_progress.json (scripts/refresh-av-bill-progress.py)."""
    path = ROOT / "data-state/av_progress.json"
    if not path.exists():
        return 0
    progress = json.loads(path.read_text(encoding="utf-8"))
    applied = 0
    for bill in tracker["state_bills"]:
        rec = progress.get(bill.get("id"))
        if not rec or not rec.get("status") or rec.get("error"):
            continue
        if (rec.get("last_action_date") or "") < (bill.get("last_action_date") or ""):
            continue  # the index already has a newer action
        for key in ("status", "progress_stage", "last_action", "last_action_date"):
            if rec.get(key):
                bill[key] = rec[key]
        bill["progress_checked"], bill["progress_source"] = rec.get("checked"), "official_site"
        applied += 1
    return applied


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


def alerts(retired: list[str]) -> list[tuple]:
    out = []
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
    manual += official_database_bills()
    codes = [s["code"] for s in tracker["states"]]
    report = {"generated": TODAY, "jurisdictions": {c: {"primary_bills": sum(1 for b in tracker["state_bills"]
              if b["jurisdiction"] == c and not b.get("source_feed"))} for c in codes}}

    added_manual, retired = merge_manual(tracker, manual)
    report["manual_added"], report["manual_retired"] = added_manual, retired

    report["progress_applied"] = apply_progress(tracker)
    tracker["state_bills"].sort(key=lambda b: (b["jurisdiction"], b["number"], b["session"]))
    TRACKER.write_text(json.dumps(tracker, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    COVERAGE.parent.mkdir(exist_ok=True)
    COVERAGE.write_text(json.dumps(report, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    pending = alerts(retired)
    print(f"manual added={len(added_manual)} retired={len(retired)} alerts={len(pending)}")
    if args.open_issues:
        for key, title, body, only_open in pending:
            open_issue(key, title, body, only_open)
    return 0


if __name__ == "__main__":
    sys.exit(main())
