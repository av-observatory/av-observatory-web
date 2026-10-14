#!/usr/bin/env python3
"""Apply one maintainer-approved policy proposal (from a ``policy-review`` issue body).

The proposal JSON is embedded in the issue body by refresh-policy.py. This script re-validates
everything: it only edits status / instrument / date / summary / takeaway of ONE existing entry,
and only to values the site already supports.

Usage: apply-policy-proposal.py <issue-body-file>
"""
from __future__ import annotations

import base64
import importlib.util
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "public/data/policy_tracker.json"

spec = importlib.util.spec_from_file_location("refresh_policy", ROOT / "scripts/refresh-policy.py")
rp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rp)


def parse(body: str) -> dict:
    match = re.search(r"<!-- policy-proposal:([A-Za-z0-9+/=]+) -->", body)
    if not match:
        raise SystemExit("No policy proposal found in the issue body")
    return json.loads(base64.b64decode(match.group(1)))


def apply(policy: dict, proposal: dict) -> str:
    if proposal["list"] not in ("federal", "federal_oversight", "state_events", "city_events"):
        raise SystemExit("Invalid list in proposal")
    entry = next((e for e in policy[proposal["list"]] if e["id"] == proposal["id"]), None)
    if entry is None:
        raise SystemExit(f"Entry {proposal['id']} no longer exists")
    allowed = {"status": rp.STATUSES, "instrument": rp.INSTRUMENTS}
    for field, change in proposal["changes"].items():
        if field not in ("status", "instrument", "date"):
            raise SystemExit(f"Field not editable by proposals: {field}")
        if entry.get(field) != change["from"]:
            raise SystemExit(f"{field} changed since the proposal was made; re-run the refresh")
        new = change["to"]
        if field in allowed and new not in allowed[field]:
            raise SystemExit(f"Unsupported {field}: {new}")
        if field == "date" and new is not None and not rp.DATE_RE.match(new):
            raise SystemExit(f"Invalid date: {new}")
    for field, change in proposal["changes"].items():
        entry[field] = change["to"]
    entry["summary"] = proposal["summary"].strip()
    entry["takeaway"] = proposal["takeaway"].strip().rstrip(".")
    entry["verified_at"] = date.today().isoformat()
    entry["review_status"] = "maintainer_approved"
    policy["as_of"] = date.today().isoformat()
    return entry["title"]


def main() -> int:
    proposal = parse(Path(sys.argv[1]).read_text(encoding="utf-8"))
    policy = json.loads(POLICY.read_text(encoding="utf-8"))
    title = apply(policy, proposal)
    POLICY.write_text(json.dumps(policy, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Applied approved change to: {title}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
