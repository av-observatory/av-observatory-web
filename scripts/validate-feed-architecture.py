#!/usr/bin/env python3
"""Fail CI unless every Observatory feed has an R2-backed persistence path."""
from __future__ import annotations
import os
from pathlib import Path
import boto3

ROOT=Path(__file__).resolve().parent.parent
BUCKET=os.environ["R2_BUCKET"]
ENDPOINT=os.environ.get("R2_ENDPOINT_URL") or f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"

REQUIRED_KEYS=[
  "published/activity/cpuc_activity_monthly.json",
  "published/safety/sgo_incidents_monthly.json",
  "published/safety/waymo_s2_state_summary.json",
  "published/deployment/ma_adt_testing_registry.json",
  "published/deployment/state_permit_registry.json",
  "published/oversight/nhtsa_investigations.json",
  "database/nhtsa_investigations/manifest.json",
  "database/policy/latest_hashes.json",
  "database/legislation/latest_hashes.json",
  "database/deployment/latest_hashes.json",
  "database/odd_history/latest_hashes.json",
  "database/permits/latest_hashes.json",
  "database/sf_311/latest_hashes.json",
  "database/austin_reports/latest_hashes.json",
  "database/manufacturers/latest_hashes.json",
  "database/sgo_media_context/latest_hashes.json",
  "database/source_watch/latest_hashes.json",
  "published/_meta/source-watch.json",
]

BANNED_FILES=[
  "src/lib/statePolicy.ts",
  "src/lib/statePolicySurvey.ts",
  "scripts/build-policy-data.py",
]

BANNED_SNIPPETS={
  "src/components/InvestigationTracker.tsx":["const investigations:"],
}

def main():
  s3=boto3.client("s3",endpoint_url=ENDPOINT,aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],region_name="auto")
  errors=[]
  for key in REQUIRED_KEYS:
    try:
      head=s3.head_object(Bucket=BUCKET,Key=key)
      if int(head.get("ContentLength",0))<=0: errors.append(f"empty R2 object: {key}")
    except Exception: errors.append(f"missing R2 object: {key}")
  for rel in BANNED_FILES:
    if (ROOT/rel).exists(): errors.append(f"hard-coded data source still exists: {rel}")
  for rel,snippets in BANNED_SNIPPETS.items():
    path=ROOT/rel
    if path.exists():
      text=path.read_text()
      for snippet in snippets:
        if snippet in text: errors.append(f"hard-coded domain records found in {rel}: {snippet}")
  if errors:
    raise SystemExit("\n".join(errors))
  print(f"Feed architecture PASS: {len(REQUIRED_KEYS)} required R2 objects present; banned hard-coded sources absent.")

if __name__=="__main__":main()
