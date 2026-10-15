#!/usr/bin/env python3
"""A bounded GitHub Actions integration test with real source text and AI key.

Runs on internal PR branches only. Three cases, at most six AI API requests.
Never prints secrets, raw source documents, or request headers.
"""
import copy
import json
import os
from pathlib import Path
import runpy
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
os.environ["POLICY_EDITORIAL_DEBUG"]="1"
if not os.environ.get("ANTHROPIC_API_KEY"):
    raise SystemExit("ANTHROPIC_API_KEY is not configured for this workflow")
from legislation_source_text import primary_text
leg=json.loads((ROOT/"public/data/legislation_tracker.json").read_text())
policy=json.loads((ROOT/"public/data/policy_tracker.json").read_text())
rows=[
    ("federal_bill",next(r for r in leg["federal"] if r["id"]=="us-hr7390-119t")),
    ("state_bill",next(r for r in leg["state_bills"] if r["jurisdiction"]=="CA" and r["number"]=="AB 2193")),
    ("fmvss",next(r for r in policy["federal"] if r["id"]=="fmvss-201-2022"))
]
ns=runpy.run_path(str(ROOT/"scripts/ai-policy-editorial.py"))
success=0
for kind,seed in rows:
    row=copy.deepcopy(seed)
    try:
        original,source_type,url=ns["get_source"](row,kind)
        if len(original)<180:
            print(f"{kind} {row['id']}: NO SUBSTANTIVE SOURCE AVAILABLE")
            continue
        # Avoid fetching a primary source twice during the smoke test.
        fn=ns["summarize"]
        g=fn.__globals__
        real_get_source=g["get_source"]
        try:
            g["get_source"]=lambda _row,_kind:(original,source_type,url)
            result=fn(row,kind)
        finally:
            g["get_source"]=real_get_source
        print(f"{kind} {row['id']}: {result}, source={source_type}, chars={len(original)}")
        if result=="rejected":
            print("  Rejection:",row.get("editorial_failure_reason"),"Candidate:",row.get("_debug_candidate"))
        if result=="updated":
            print("  Sample summary:",row["summary"])
            success+=1
    except Exception as error:
        print(f"{kind} {row['id']}: {type(error).__name__}: {str(error)[:180]}")
print(f"AI live smoke test: {success}/3 verified.")
# Fail if neither federal bill nor FMVSS can get verified; state source gaps
# are reported but do not block the PR's network-free correctness checks.
if success<2:raise SystemExit(1)
