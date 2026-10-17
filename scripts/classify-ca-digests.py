#!/usr/bin/env python3
"""Classify California bills as AV or not from the Legislative Counsel's digests (data-state/states/CA/bills.json).

California is title-only in the page scan (its site is a JavaScript app), but the bulk file carries the digest of every
bill. This applies the same AV-term test the scanner uses to title + digest and records the result in the CA ledger.
"""
import importlib.util, json, sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("enumerate_bills", ROOT / "scripts/enumerate-bills.py")
eb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(eb)
TODAY = date.today().isoformat()


def main() -> int:
    bills = json.loads((ROOT / "data-state/states/CA/bills.json").read_text())
    path = ROOT / "data-state/bill_ledger/CA.json"
    ledger = json.loads(path.read_text())
    hits = checked = 0
    for key, row in ledger["bills"].items():
        number = row["number"]
        b = bills.get(number)
        if not b or not b.get("digest"):
            continue
        checked += 1
        if eb.is_av(f"{b.get('title', '')} {b['digest']}"):
            row["av"], row["via"], row["classified"] = "candidate", "digest", TODAY
            hits += 1
        elif row.get("via") != "title" or row.get("av") != "candidate":
            row["av"] = "no"
        row["scanned"] = TODAY
        row.pop("scan_failed", None)
    path.write_text(json.dumps(ledger, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"CA: {checked} bills with a digest checked, {hits} AV candidates")
    return 0


if __name__ == "__main__":
    sys.exit(main())
