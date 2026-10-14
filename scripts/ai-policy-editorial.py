#!/usr/bin/env python3
"""Generate fact-checked, short policy summaries from authoritative source texts.

Never replace existing useful text with guesses. Each generation requires a
second independent model check and preserves provenance and a source hash.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.request import Request,urlopen
from legislation_source_text import primary_text

ROOT=Path(__file__).resolve().parents[1]
KEY=os.getenv("OPENAI_API_KEY")
MODEL=os.getenv("POLICY_EDITORIAL_MODEL","gpt-4.1-mini")
MAX_NEW=int(os.getenv("POLICY_EDITORIAL_MAX_NEW","30"))

def invoke(messages):
    body=json.dumps({"model":MODEL,"temperature":0,
      "response_format":{"type":"json_object"},"messages":messages}).encode()
    request=Request("https://api.openai.com/v1/chat/completions",body,
        {"Content-Type":"application/json","Authorization":"Bearer "+KEY})
    for i in range(3):
        try:
            with urlopen(request,timeout=95) as response:
                return json.loads(json.load(response)["choices"][0]["message"]["content"])
        except Exception:
            if i==2:raise
            time.sleep(2**i)

def quality(value):
    s=value.get("summary") if isinstance(value,dict) else None
    return isinstance(s,str) and 25<=len(s.split())<=68 and len(s)<=500 and not re.search(
      r"\\b(?:ADS|ODI|FMVSS)\\b|https?://|substantive summary unavailable",s,re.I)

def get_source(row,kind):
    text,provenance,url=primary_text(row,kind)
    if text:return text,provenance,url
    # Official state-law abstracts are useful evidence when substantive, but
    # are explicitly NOT treated as the full bill.
    abstract=" ".join(str(row.get("source_summary") or "").split())
    if kind=="state_bill" and len(abstract)>180 and not abstract.lower().startswith("substantive summary unavailable"):
        return abstract,"openstates_abstract",row.get("repository_url") or row.get("source_url")
    return "","missing_full_text_and_substantive_abstract",""

def summarize(row,kind):
    source,source_type,source_url=get_source(row,kind)
    if not source:
        row["editorial_status"]="needs_primary_source"
        return "missing"
    digest=hashlib.sha256((MODEL+"\n"+source+"\n"+str(row.get("status"))).encode()).hexdigest()
    if row.get("editorial_source_hash")==digest and row.get("editorial_status")=="verified":
        return "cached"
    if not KEY:raise RuntimeError("OPENAI_API_KEY not configured")
    source=source[:24000]
    prompt=("You are an impartial legislative and regulatory researcher. Write a readable 2–3 sentence summary, "
      "about 35–65 words, grounded EXCLUSIVELY in the supplied original bill text, official rule, or source abstract. "
      "Explain what it proposes or changes, which vehicles or actors it affects, and any important reporting duties, "
      "deadlines or authority where stated. Distinguish proposed and enacted measures. Explain abbreviations. "
      "Never make up provisions, dates or status. If insufficient, return needs_review=true. "
      "Return JSON {summary:string,needs_review:boolean,reason:string}.")
    request=json.dumps({"kind":kind,"jurisdiction":row.get("jurisdiction"),"bill_or_rule":row.get("number") or row.get("title"),"title":row.get("title"),
        "status":row.get("status"),"evidence_type":source_type,"official_source_text":source})
    draft=invoke([{"role":"system","content":prompt},{"role":"user","content":request}])
    if draft.get("needs_review") or not quality(draft):
        row["editorial_status"]="needs_review"
        return "rejected"
    check=invoke([{"role":"system","content":"Compare the candidate only with the provided source text. Reject invented, exaggerated or unsupported factual claims, incorrect bill status, or confusion of proposed and final rules. Respond JSON {supported:boolean,issues:string}."},
       {"role":"user","content":json.dumps({"text":source,"summary":draft["summary"],"status":row.get("status")})}])
    if check.get("supported") is not True:
        row["editorial_status"]="needs_review"
        return "rejected"
    row["summary"]=draft["summary"].strip()
    row["takeaway"]=row["summary"]
    row["summary_method"]="ai_verified_primary_source" if source_type.startswith("official_") else "ai_verified_source_abstract"
    row["summary_quality"]="verified"
    row["editorial_status"]="verified"
    row["editorial_source_hash"]=digest
    row["editorial_source_url"]=source_url
    row["editorial_source_type"]=source_type
    row["editorial_model"]=MODEL
    return "updated"

def main():
    if not KEY:
        print("OPENAI_API_KEY not set; refusing to claim AI verification.",file=sys.stderr)
        return 2
    counts={}
    used=0
    for filename,groups in [
        ("public/data/legislation_tracker.json",[("federal","federal_bill"),("state_bills","state_bill")]),
        ("public/data/policy_tracker.json",[("federal","fmvss")])]:
        path=ROOT/filename
        data=json.loads(path.read_text())
        for field,kind in groups:
            for row in data[field]:
                if kind=="fmvss" and "FMVSS" not in row.get("instrument",""):continue
                if used>=MAX_NEW:
                    counts["deferred_due_to_limit"]=counts.get("deferred_due_to_limit",0)+1
                    continue
                # Existing verified records are reconsidered to detect changed sources.
                result=summarize(row,kind)
                counts[result]=counts.get(result,0)+1
                if result in ("updated","rejected"):used+=1
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
    print("Policy editorial results:",counts)
    # Missing source or failed verification is marked, not silently invented.
    # Existing summaries remain in place until a verified replacement exists.
    return 0

if __name__=="__main__":raise SystemExit(main())
