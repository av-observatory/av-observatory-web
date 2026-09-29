#!/usr/bin/env python3
"""Append changed website-domain records to the authoritative R2 history.

The checked-in JSON files are deployment caches. R2 keeps immutable row-level
observations so a later refresh never destroys the prior state.
"""
from __future__ import annotations
import hashlib, json, os
from datetime import datetime, timezone
from pathlib import Path
import boto3

ROOT=Path(__file__).resolve().parent.parent
DATA=ROOT/"public/data"
BUCKET=os.environ["R2_BUCKET"]
ENDPOINT=os.environ.get("R2_ENDPOINT_URL") or f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"

SPECS={
  "policy":{
    "file":"policy_tracker.json",
    "collections":["federal","federal_oversight","states","state_events","city_events"],
    "key":lambda section,r:f"{section}|{r.get('id','')}"
  },
  "legislation":{
    "file":"legislation_tracker.json",
    "collections":["federal","state_bills"],
    "key":lambda section,r:f"{section}|{r.get('id','')}"
  },
  "deployment":{
    "file":"operational_domains.json",
    "collections":["locations"],
    "key":lambda section,r:"|".join(str(r.get(k,"")) for k in ("company","state","market","phase"))
  },
  "odd_history":{
    "file":"odd_history.json",
    "collections":["historical_events","current_updates"],
    "key":lambda section,r:"|".join(str(r.get(k,"")) for k in ("date","event_type","company","state","market","source_url"))
  },
  "sf_311":{
    "file":"av_311_complaints.json",
    "collections":["records"],
    "key":lambda section,r:f"{section}|{r.get('id','')}"
  },
  "austin_reports":{
    "file":"austin_av_reports.json",
    "collections":["records"],
    "key":lambda section,r:f"{section}|{r.get('id','')}"
  },
  "sgo_media_context":{
    "file":"sgo_media_context.json",
    "collections":["records","reviewed_sources"],
    "key":lambda section,r:f"{section}|{r.get('id',r.get('url',r.get('source_url','')))}"
  },
  "permits":{
    "file":"state_permit_registry.json",
    "collections":["all_permits","states_status_notes"],
    "key":lambda section,r:(f"{section}|{r.get('state','')}|{r.get('agency','')}|{r.get('company','')}|{r.get('permit_type_normalized','')}|{r.get('permit_id','')}" if section=="all_permits" else f"{section}|{r.get('state','')}")
  },
}

def client():
  return boto3.client("s3",endpoint_url=ENDPOINT,aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],region_name="auto")

def get_json(s3,key,default):
  try:return json.loads(s3.get_object(Bucket=BUCKET,Key=key)["Body"].read())
  except Exception:return default

def put_json(s3,key,value):
  s3.put_object(Bucket=BUCKET,Key=key,Body=(json.dumps(value,indent=2,ensure_ascii=False)+"\n").encode(),ContentType="application/json")

def digest(row):
  return hashlib.sha256(json.dumps(row,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()



def append_manufacturer_history(s3, now):
    path=DATA/"manufacturer_profiles.json"
    payload=json.loads(path.read_text())
    dataset="manufacturers"
    idx_key=f"database/{dataset}/latest_hashes.json"
    latest=get_json(s3,idx_key,{}) or {}
    changed=[]; next_idx=dict(latest)
    for company,profile in payload.get("profiles",{}).items():
        base={k:v for k,v in profile.items() if k!="developments"}
        key=f"profile|{company}"; h=digest(base)
        if latest.get(key)!=h:
            changed.append({"dataset":dataset,"collection":"profiles","natural_key":key,"observed_at":now,"record_hash":h,"record":{"company":company,**base}})
            next_idx[key]=h
        for event in profile.get("developments",[]):
            key=f"development|{company}|{event.get('date','')}|{event.get('source','')}|{event.get('headline','')}"
            h=digest(event)
            if latest.get(key)!=h:
                changed.append({"dataset":dataset,"collection":"developments","natural_key":key,"observed_at":now,"record_hash":h,"record":{"company":company,**event}})
                next_idx[key]=h
    if changed:
        body="".join(json.dumps(r,sort_keys=True,ensure_ascii=False,separators=(",",":"))+"\\n" for r in changed).encode()
        bh=hashlib.sha256(body).hexdigest(); stamp=now.replace("-","").replace(":","").replace("+00:00","Z").replace(".","")
        key=f"database/{dataset}/observations/{stamp[:8]}/{stamp}-{bh[:16]}.jsonl"
        try:s3.head_object(Bucket=BUCKET,Key=key)
        except Exception:s3.put_object(Bucket=BUCKET,Key=key,Body=body,ContentType="application/x-ndjson")
    put_json(s3,idx_key,next_idx)
    print(f"{dataset}: {len(changed)} new/changed row observations")


def main():
  s3=client(); now=datetime.now(timezone.utc).isoformat()
  append_manufacturer_history(s3,now)
  for dataset,spec in SPECS.items():
    payload=json.loads((DATA/spec["file"]).read_text())
    idx_key=f"database/{dataset}/latest_hashes.json"
    latest=get_json(s3,idx_key,{}) or {}
    changed=[]; next_idx=dict(latest)
    for section in spec["collections"]:
      for row in payload.get(section,[]) or []:
        key=spec["key"](section,row); h=digest(row)
        if latest.get(key)!=h:
          obs={"dataset":dataset,"collection":section,"natural_key":key,"observed_at":now,"record_hash":h,"record":row}
          if latest.get(key):obs["supersedes_hash"]=latest[key]
          changed.append(obs); next_idx[key]=h
    if changed:
      body="".join(json.dumps(r,sort_keys=True,ensure_ascii=False,separators=(",",":"))+"\n" for r in changed).encode()
      bh=hashlib.sha256(body).hexdigest()
      stamp=now.replace("-","").replace(":","").replace("+00:00","Z").replace(".","")
      key=f"database/{dataset}/observations/{stamp[:8]}/{stamp}-{bh[:16]}.jsonl"
      try:s3.head_object(Bucket=BUCKET,Key=key)
      except Exception:s3.put_object(Bucket=BUCKET,Key=key,Body=body,ContentType="application/x-ndjson")
      manifest_key=f"database/{dataset}/manifest.json"
      manifest=get_json(s3,manifest_key,{"schema_version":"1.0.0","dataset":dataset,"storage_model":"append-only immutable observation batches","batches":[]})
      if not any(x.get("key")==key for x in manifest["batches"]):
        manifest["batches"].append({"key":key,"observed_at":now,"rows":len(changed),"source_cache":spec["file"]})
        manifest["updated_at"]=now; put_json(s3,manifest_key,manifest)
    put_json(s3,idx_key,next_idx)
    print(f"{dataset}: {len(changed)} new/changed row observations")
if __name__=="__main__":main()
