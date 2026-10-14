#!/usr/bin/env python3
"""Fail-loud check: every bill in data-state/known_av_bills.json must appear in the legislation index.

The index depends on feeds that have silently missed bills (D.C. B26-0684, MO HB 2069, LA SB 133 ...).
This list is the regression test: whenever a gap is found it is added here, and the check alerts if the
bill is ever absent again. Usage: check-known-bills.py [--open-issues]
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def norm(value):
    return tuple(int(t) if t.isdigit() else t for t in re.findall(r"[a-z]+|\d+", str(value).lower()))


def missing(tracker, known):
    have = {(b["jurisdiction"], norm(b["number"])) for b in tracker["state_bills"]}
    return [k for k in known["bills"] if (k["jurisdiction"], norm(k["number"])) not in have]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--open-issues", action="store_true"); args = ap.parse_args()
    tracker = json.loads((ROOT / "public/data/legislation_tracker.json").read_text(encoding="utf-8"))
    known = json.loads((ROOT / "data-state/known_av_bills.json").read_text(encoding="utf-8"))
    gone = missing(tracker, known)
    print(f"{len(known['bills'])} known bills, {len(gone)} missing from the index")
    for k in gone:
        print(f"  MISSING {k['jurisdiction']} {k['number']} ({k['status_note']}) {k.get('official_url') or ''}")
    if gone and args.open_issues:
        key = hashlib.sha256(",".join(sorted(f"{k['jurisdiction']}{k['number']}" for k in gone)).encode()).hexdigest()[:12]
        found = subprocess.run(["gh", "issue", "list", "--state", "open", "--label", "data-coverage", "--search",
                                f"coverage-key:{key} in:body", "--json", "number"], capture_output=True, text=True)
        if found.returncode == 0 and json.loads(found.stdout or "[]"):
            return 0
        rows = "\n".join(f"- **{k['jurisdiction']} {k['number']}**: {k['status_note']} {k.get('official_url') or ''}" for k in gone)
        subprocess.run(["gh", "label", "create", "data-coverage", "--color", "fbca04", "--description", "A data source may be missing records"], capture_output=True)
        subprocess.run(["gh", "issue", "create", "--label", "data-coverage", "--title",
                        f"{len(gone)} known AV bill(s) missing from the legislation index",
                        "--body", f"These bills were confirmed on official legislature sites but are absent from the index:\n\n{rows}\n\ncoverage-key:{key}"], check=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
