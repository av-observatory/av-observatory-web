#!/usr/bin/env python3
"""Monitor every cited source used by curated Observatory datasets.

A changed source is archived immutably in R2 and recorded as an append-only
source observation. Semantic/legal interpretation remains a reviewed row; this
watcher prevents silent source changes from being missed.
"""
from __future__ import annotations
import hashlib,json,os,re
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen
import boto3

ROOT=Path(__file__).resolve().parent.parent
DATA=ROOT/"public/data"
FILES=["policy_tracker.json","manufacturer_profiles.json","operational_domains.json","odd_history.json","state_permit_registry.json"]
BUCKET=os.environ["R2_BUCKET"]
ENDPOINT=os.environ.get("R2_ENDPOINT_URL") or f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
URL_RE=re.compile(r"^https?://",re.I)

def client():
 return boto3.client("s3",endpoint_url=ENDPOINT,aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],region_name="auto")

def urls(value,out):
 if isinstance(value,dict):
  for k,v in value.items():
   if k in {"source_url","source","url","proposal_url","comment_extension_url","dashboard_url","source_api","source_list_url"} and isinstance(v,str) and URL_RE.match(v): out.add(v)
   elif k=="sources" and isinstance(v,list):
    for x in v:
     if isinstance(x,str) and URL_RE.match(x):out.add(x)
     elif isinstance(x,dict):urls(x,out)
   else:urls(v,out)
 elif isinstance(value,list):
  for x in value:urls(x,out)

def get_json(s3,key,default):
 try:return json.loads(s3.get_object(Bucket=BUCKET,Key=key)["Body"].read())
 except Exception:return default

def main():
 s3=client(); found=set()
 for name in FILES:
  urls(json.loads((DATA/name).read_text()),found)
 latest=get_json(s3,"database/source_watch/latest_hashes.json",{}) or {}
 changes=[]; now=datetime.now(timezone.utc).isoformat(); next_latest=dict(latest)
 for url in sorted(found):
  try:
   req=Request(url,headers={"User-Agent":"AV-Observatory/1.0 public research"})
   with urlopen(req,timeout=45) as resp:
    body=resp.read(); content_type=resp.headers.get("Content-Type","application/octet-stream")
   h=hashlib.sha256(body).hexdigest(); prior=latest.get(url)
   raw_key=f"raw/source-watch/{h}"
   try:s3.head_object(Bucket=BUCKET,Key=raw_key)
   except Exception:s3.put_object(Bucket=BUCKET,Key=raw_key,Body=body,ContentType=content_type.split(";")[0])
   if prior!=h:
    changes.append({"url":url,"observed_at":now,"content_hash":h,"previous_hash":prior,"raw_key":raw_key,"bytes":len(body),"content_type":content_type})
    next_latest[url]=h
  except Exception as e:
   changes.append({"url":url,"observed_at":now,"error":str(e)[:500]})
 if changes:
  body="".join(json.dumps(x,sort_keys=True,separators=(",",":"))+"\n" for x in changes).encode()
  h=hashlib.sha256(body).hexdigest(); stamp=now.replace("-","").replace(":","").replace("+00:00","Z").replace(".","")
  key=f"database/source_watch/observations/{stamp[:8]}/{stamp}-{h[:16]}.jsonl"
  s3.put_object(Bucket=BUCKET,Key=key,Body=body,ContentType="application/x-ndjson")
 s3.put_object(Bucket=BUCKET,Key="database/source_watch/latest_hashes.json",Body=json.dumps(next_latest,indent=2).encode(),ContentType="application/json")
 status={"checked_at":now,"source_count":len(found),"observations":len(changes),"sources":[{"url":u,"hash":next_latest.get(u)} for u in sorted(found)]}
 s3.put_object(Bucket=BUCKET,Key="published/_meta/source-watch.json",Body=json.dumps(status,indent=2).encode(),ContentType="application/json")
 print(f"Checked {len(found)} sources; wrote {len(changes)} change/error observations")
if __name__=="__main__":main()
