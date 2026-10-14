#!/usr/bin/env python3
"""Merge verified editorial corrections onto the latest data without reverting concurrent edits.

The long-running backfill may start before other commits. We merge fields only
for IDs still present in the up-to-date feed, never resurrect deleted bills
or overwrite recently hand-verified authoritative corrections.
"""
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MAP={
    "legislation_tracker.json":("federal","state_bills"),
    "policy_tracker.json":("federal","federal_oversight","state_events","city_events","states"),
    "nhtsa_investigations.json":("investigations",),
    "nhtsa_av_recalls.json":("recalls",),
}
FIELDS=("summary","takeaway","analysis","summary_method","summary_quality",
        "summary_reviewed_at","editorial_status","editorial_source_hash",
        "editorial_source_url","editorial_source_type","editorial_model",
        "editorial_failure_reason")

def merge(incoming,latest):
    changes=0
    for fname,groups in MAP.items():
        dest=ROOT/"public"/"data"/fname
        oldpath=Path(incoming)/fname
        if not oldpath.is_file():continue
        previous=json.loads(oldpath.read_text())
        current=json.loads(dest.read_text())
        for group in groups:
            originals={r.get("id") or r.get("code"):r for r in previous.get(group,[])}
            for row in current.get(group,[]):
                key=row.get("id") or row.get("code")
                candidate=originals.get(key)
                if not candidate:continue
                if candidate.get("editorial_status")!="verified" or not candidate.get("editorial_source_hash"):
                    continue
                # Hand-reviewed enacted legal text takes precedence over a
                # background-run candidate that may have used an older bill version.
                if row.get("summary_quality")=="manual_primary_source_verified":
                    continue
                if row.get("editorial_source_hash")==candidate.get("editorial_source_hash") and row.get("editorial_status")=="verified":
                    continue
                for field in FIELDS:
                    if field in candidate:row[field]=candidate[field]
                    elif field=="editorial_failure_reason":row.pop(field,None)
                changes+=1
        dest.write_text(json.dumps(current,ensure_ascii=False,indent=2)+"\n")
    print(f"Merged {changes} independently verified summaries onto latest indexed records.")
    return changes

if __name__=="__main__":
    if len(sys.argv)!=2:
        sys.exit("Usage: merge-editorial-updates.py DIRECTORY_WITH_INCOMING_JSON")
    merge(sys.argv[1],ROOT)
