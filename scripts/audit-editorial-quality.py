#!/usr/bin/env python3
"""Audit AI-facing editorial text across policy, legislation and NHTSA feeds.
Exit nonzero on any unsafe, unreviewed or copied-source text.
Run before publishing refreshed datasets; do not treat a successful API request as editorial success.
"""
import json, re, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BAD=re.compile(r"substantive summary unavailable|review the official bill record|summary unavailable|no action text available",re.I)
MAX=550

def audit(rows,group):
    errors=[]
    for row in rows:
        ident=row.get("id") or row.get("code") or "unknown"
        summary=str(row.get("summary") or row.get("analysis") or "").strip()
        takeaway=str(row.get("takeaway") or "").strip()
        if not summary or BAD.search(summary) or len(summary)>MAX:
            errors.append(f"{group}/{ident}: missing, placeholder or overlong summary ({len(summary)} chars)")
        if takeaway and (BAD.search(takeaway) or len(takeaway)>MAX):
            errors.append(f"{group}/{ident}: placeholder or overlong takeaway")
        source=str(row.get("source_summary") or "").strip()
        if source and len(source)>120 and summary==source:
            errors.append(f"{group}/{ident}: verbatim source abstract")
        if row.get("editorial_status") in ("needs_review","needs_primary_source"):
            errors.append(f"{group}/{ident}: editorial verification incomplete")
    return errors

def main():
    errors=[]
    for filename,groups in [
        ("legislation_tracker.json",("federal","state_bills")),
        ("policy_tracker.json",("federal","federal_oversight","state_events","city_events","states")),
        ("nhtsa_investigations.json",("investigations",)),
        ("nhtsa_av_recalls.json",("recalls",)),
    ]:
        path=ROOT/"public"/"data"/filename
        if not path.exists():continue
        data=json.loads(path.read_text())
        for group in groups:
            rows=data.get(group,[])
            if isinstance(rows,list):
                errors+=audit(rows,filename+":"+group)
    for issue in errors:print("EDITORIAL BLOCKER:",issue,file=sys.stderr)
    print(f"Editorial audit: {len(errors)} blockers across the current policy, legislation and NHTSA snapshots")
    return 1 if errors else 0

if __name__=="__main__":raise SystemExit(main())
