#!/usr/bin/env python3
"""AI editorial stage for the AV Observatory's NHTSA oversight feeds.

Called after the NHTSA primary-source ingestion, before CSV export and deploy.
Use official text only, not online search. Inferences must not be published as
established facts. Every changed record is generated and independently checked.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"public"/"data"
MODEL=os.getenv("NHTSA_EDITORIAL_MODEL","gpt-4.1-mini")
API_KEY=os.getenv("OPENAI_API_KEY")
API_URL="https://api.openai.com/v1/chat/completions"
MAX_WORDS=65
MAX_MODEL_RECORDS=int(os.getenv("NHTSA_MAX_MODEL_RECORDS","150"))

def call_model(messages):
    body=json.dumps({"model":MODEL,"temperature":0,"response_format":{"type":"json_object"},"messages":messages}).encode()
    req=urllib.request.Request(API_URL,body,{
      "Authorization":"Bearer "+API_KEY,"Content-Type":"application/json","User-Agent":"AV-Observatory-editorial/1.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req,timeout=90) as resp:
                output=json.load(resp)
            return json.loads(output["choices"][0]["message"]["content"])
        except Exception:
            if attempt==3: raise
            time.sleep(2**attempt)

def check_shape(value):
    if not isinstance(value,dict) or not isinstance(value.get("summary"),str):
        return False
    summary=value["summary"].strip()
    if not (22<=len(summary.split())<=MAX_WORDS and len(summary)<=480): return False
    if re.search(r"\\b(?:ADS|ODI|FMVSS|SGO)\\b",summary): return False
    if re.search(r"https?://|\\b(?:report id|listed below|opening resume)\\b",summary,re.I): return False
    return True

def process(path,key,kind):
    blob=json.loads(path.read_text())
    count=updated=0
    for row in blob[key]:
        source=(row.get("source_detail") or "").strip()
        if not source:
            # Previously hand-reviewed entries without their source text are retained.
            # They are not characterized as AI-verified.
            if row.get("summary_method")!="ai_source_verified":
                row["editorial_status"]="needs_source_text"
            continue
        source_hash=hashlib.sha256((kind+"\n"+source+"\n"+str(row.get("subject"))+"\n"+MODEL).encode()).hexdigest()
        if row.get("editorial_source_hash")==source_hash and row.get("editorial_status")=="verified":
            continue
        count+=1
        if count>MAX_MODEL_RECORDS:
            raise RuntimeError(f"AI editorial record limit exceeded ({MAX_MODEL_RECORDS}); review data volume before spending more")
        subject=row.get("subject","")
        system=("You are the editor of a nonpartisan autonomous-vehicle safety research publication. "
                "Produce precise, thoughtful short prose based ONLY on the supplied official NHTSA text. "
                "Do not infer causation, established defects, investigation conclusions, or outcomes unless explicitly supported. "
                "Explain any technical abbreviation, or omit it. No press-release boilerplate, report IDs, or lists of record numbers. "
                "Use 2 or 3 sentences, 35-65 words. State the core problem, most informative documented incidents/evidence, "
                "and the scope of the NHTSA investigation or the recall remedy where supported. "
                "When information is insufficient, return needs_review true and explain why. "
                "Reply JSON: {summary:string,needs_review:boolean,reason:string}.")
        payload=json.dumps({"type":kind,"company":row.get("company"),"subject":subject,
            "source_text":source[:18000]})
        draft=call_model([{"role":"system","content":system},{"role":"user","content":payload}])
        if draft.get("needs_review") or not check_shape(draft):
            row["editorial_status"]="needs_review"
            row["editorial_error"]=draft.get("reason","Summary failed length or format checks")
            continue
        judge=call_model([
          {"role":"system","content":("Independently fact-check the candidate against ONLY the official NHTSA text. "
              "Every factual assertion must be directly supported; reject omitted qualifiers, stronger assertions "
              "than the source, wrong severity, company, status, dates, or outcomes. "
              "Return JSON {supported:boolean, issues:string}. Do not rewrite the summary.")},
          {"role":"user","content":json.dumps({"official_source":source[:18000],
              "subject":subject,"company":row.get("company"),"candidate_summary":draft["summary"]})}
        ])
        if judge.get("supported") is not True:
            row["editorial_status"]="needs_review"
            row["editorial_error"]=str(judge.get("issues") or "Not sufficiently supported")[:400]
            continue
        row["summary"]=draft["summary"].strip()
        row["summary_method"]="ai_source_verified"
        row["editorial_status"]="verified"
        row["editorial_source_hash"]=source_hash
        row["editorial_model"]=MODEL
        row.pop("editorial_error",None)
        updated+=1
    # Never silently overwrite the last good summarized text on verification failure.
    # The live UI must show a clearly marked unreviewed state for those records.
    path.write_text(json.dumps(blob,ensure_ascii=False,indent=2)+"\n")
    return count,updated

def main():
    if not API_KEY:
        print("ERROR: OPENAI_API_KEY GitHub Actions secret is required for automated editorial synthesis.",file=sys.stderr)
        return 2
    total=changed=0
    for filename,key,kind in [
        ("nhtsa_investigations.json","investigations","investigation"),
        ("nhtsa_av_recalls.json","recalls","recall")]:
        count,updated=process(DATA/filename,key,kind)
        total+=count;changed+=updated
        print(f"{filename}: {updated}/{count} new/changed summaries verified")
    # Fail closed: a new or changed source lacking an approved summary must not publish.
    pending=[]
    for filename,key in [("nhtsa_investigations.json","investigations"),("nhtsa_av_recalls.json","recalls")]:
        rows=json.loads((DATA/filename).read_text())[key]
        pending += [r["id"] for r in rows if r.get("source_detail") and r.get("editorial_status")!="verified"]
    print(f"Editorial AI stage: {changed} verified of {total} changed records")
    if pending:
        print("ERROR: Unverified NHTSA entries; abort publication: "+", ".join(pending[:30]),file=sys.stderr)
        return 1
    return 0

if __name__=="__main__":
    raise SystemExit(main())
