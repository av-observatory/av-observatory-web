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
    if not isinstance(s,str) or not 24<=len(s.split())<=75 or len(s)>550:
        return False
    for acronym, expansion in (
        ("ADS","automated driving system"),
        ("FMVSS","federal motor vehicle safety standard"),
        ("ODI","office of defects investigation"),
        ("SGO","standing general order")):
        if re.search(r"\b"+acronym+r"\b",s) and expansion not in s.lower():
            return False
    return not re.search(r"https?://|substantive summary unavailable",s,re.I)

def status_consistent(row,kind,draft):
    summary=str(draft.get("summary") or "")
    status=str(row.get("status") or "").lower()
    if kind.endswith("_bill") and status not in ("enacted","signed","chaptered"):
        if re.search(r"\b(?:the|this)\s+law\b",summary,re.I):
            return False
        safe=summary.replace("U.S.","US").replace("No.","No").replace("H.R.","HR").replace("S.B.","SB")
        sentences=re.split(r"(?<=[.!?])\s+(?=[A-Z])",safe)
        if any(not re.search(r"\b(?:would|could|if enacted)\b",sentence,re.I) for sentence in sentences):
            return False
    if kind=="fmvss" and status in ("under_review","advance_notice","request_for_comment"):
        if not re.search(r"\b(?:would|propos(?:e|es|ed)|seeks?|requested|sought|invited|considering)\b",summary,re.I):
            return False
    return True

def specific_to_record(row,kind,draft):
    if kind!="fmvss" or not re.match(r"fmvss-\d{3}a?-",row.get("id","")):
        return True
    title_terms=set(re.findall(r"[a-z]{5,}",str(row.get("title") or "").lower()))
    title_terms-=set(("federal","motor","vehicle","safety","standard","rulemaking"))
    if not title_terms:return True
    summary_terms=set(re.findall(r"[a-z]{5,}",str(draft.get("summary") or "").lower()))
    return bool(title_terms&summary_terms)

def get_source(row,kind):
    text,provenance,url=primary_text(row,kind)
    if text:return text,provenance,url
    # A feed abstract is not a substitute for official bill text.
    return "","missing_full_text_and_substantive_abstract",""

def select_relevant_excerpt(text,row,kind):
    """Ground summarization in the relevant provisions of long documents."""
    if len(text)<=24000:return text
    snippets=[text[:3000]]
    if kind=="fmvss":
        m=re.match(r"fmvss-(\d{3}a?)-",str(row.get("id") or ""),re.I)
        n=m.group(1) if m else None
        targets=([rf"\bFMVSS\s*(?:No\.\s*)?{n}\b",rf"\b571\.{n}\b",
                  rf"\bstandard\s*(?:No\.\s*)?{n}\b"] if n else
                 [r"\bautomated driving\b",r"\bmanual driving controls\b"])
    else:
        targets=[r"\bautonomous vehicles?\b",r"\bautomated driving systems?\b",
                 r"\bdriverless\b",r"\bself[- ]driving\b",r"\brobotaxi\b"]
    offsets=sorted(set(m.start() for pattern in targets for m in re.finditer(pattern,text,re.I)))
    for pos in offsets[:18]:
        fragment=text[max(0,pos-600):min(len(text),pos+1450)]
        if sum(len(x) for x in snippets)+len(fragment)>22000:break
        snippets.append(fragment)
    return "\n\n[Source excerpt]\n\n".join(snippets)[:24000]


def summarize(row,kind):
    source,source_type,source_url=get_source(row,kind)
    if not source:
        row["editorial_status"]="needs_primary_source"
        return "missing"
    digest=hashlib.sha256((MODEL+"\n"+source+"\n"+str(row.get("status"))).encode()).hexdigest()
    if row.get("editorial_source_hash")==digest and row.get("editorial_status")=="verified":
        return "cached"
    if not KEY:raise RuntimeError("OPENAI_API_KEY not configured")
    row["editorial_source_hash"]=digest
    row["editorial_source_type"]=source_type
    row["editorial_source_url"]=source_url
    source=select_relevant_excerpt(source,row,kind)
    current_status=str(row.get("status") or "")
    status_note=("This is NOT enacted law. Describe ALL substantive provisions with conditional language such as would or proposes. Never claim this law already requires something." if kind.endswith("_bill") and current_status not in ("enacted","signed","chaptered") else "Clearly distinguish the measure's legal status.")
    prompt=(status_note+" You are an impartial legislative and regulatory researcher. Write a readable 2–3 sentence summary, "
      "about 35–65 words, grounded EXCLUSIVELY in the supplied original bill text or official rule. "
      "Explain what it proposes or changes, which vehicles or actors it affects, and any important reporting duties, "
      "deadlines or authority where stated. Distinguish proposed and enacted measures. Explain abbreviations. "
      "Do not restate the title or procedural history. Focus on a specific numbered standard rather than the entire rulemaking. Avoid unexplained acronyms. Never invent provisions, dates or status. If insufficient, return needs_review=true. "
      "Return JSON {summary:string,needs_review:boolean,reason:string}.")
    request=json.dumps({"kind":kind,"jurisdiction":row.get("jurisdiction"),"bill_or_rule":row.get("number") or row.get("title"),"title":row.get("title"),
        "status":row.get("status"),"evidence_type":source_type,"official_source_text":source})
    draft=invoke([{"role":"system","content":prompt},{"role":"user","content":request}])
    for _attempt in range(2):
        if draft.get("needs_review") or (quality(draft) and status_consistent(row,kind,draft) and specific_to_record(row,kind,draft)):
            break
        strict_status=("This measure is NOT LAW. The final answer must begin exactly with 'The bill would' and EVERY sentence must use would or could when describing proposed legal obligations. Never use present-tense statements of unpassed requirements."
                       if kind.endswith("_bill") and row.get("status") not in ("enacted","signed","chaptered")
                       else "Preserve the official proposed-versus-effective status.")
        draft=invoke([
          {"role":"system","content":strict_status+" Rewrite into exactly two clear sentences, 40–55 words, at most 440 characters. No unexplained abbreviations, especially ADS, ODI and FMVSS. Write out 'Federal Motor Vehicle Safety Standard' instead. State the specific substantive change supported by the source, not a general policy description. Respond JSON {summary:string,needs_review:boolean,reason:string}."},
          {"role":"user","content":json.dumps({"record_title":row.get("title"),"status":row.get("status"),"source":source,"draft":draft.get("summary")})}
        ])
    if draft.get("needs_review") or not quality(draft) or not status_consistent(row,kind,draft):
        row["editorial_status"]="needs_review"
        row["editorial_failure_reason"]=(str(draft.get("reason") or "")[:250]
            if draft.get("needs_review") else "Failed format: words="+str(len(str(draft.get("summary") or "").split()))
            +", chars="+str(len(str(draft.get("summary") or ""))))
        if os.getenv("POLICY_EDITORIAL_DEBUG")=="1":
            row["_debug_candidate"]=str(draft.get("summary") or "")[:500]
        return "rejected"
    check=invoke([{"role":"system","content":"Compare the candidate only with the provided source text. Reject invented, exaggerated or unsupported factual claims, incorrect bill status, confusion of proposed and final rules, or for a numbered FMVSS standard a candidate that describes only the general rulemaking without the specific standard change. Respond JSON {supported:boolean,issues:string}."},
       {"role":"user","content":json.dumps({"text":source,"summary":draft["summary"],"status":row.get("status")})}])
    if check.get("supported") is not True:
        row["editorial_status"]="needs_review"
        row["editorial_failure_reason"]=str(check.get("issues") or "Source fact-check failed")[:250]
        if os.getenv("POLICY_EDITORIAL_DEBUG")=="1":
            row["_debug_candidate"]=str(draft.get("summary") or "")[:500]
        return "rejected"
    row.pop("editorial_failure_reason",None)
    row.pop("_debug_candidate",None)
    row["summary"]=draft["summary"].strip()
    row["takeaway"]=row["summary"]
    row["summary_method"]="ai_verified_primary_source" if source_type.startswith("official_") else "ai_verified_source_abstract"
    row["summary_quality"]="verified"
    row["editorial_status"]="verified"
    row["editorial_source_hash"]=digest
    row["editorial_source_url"]=source_url
    row["editorial_source_type"]=source_type
    row["editorial_model"]=MODEL
    from datetime import datetime, timezone
    row["summary_reviewed_at"]=datetime.now(timezone.utc).date().isoformat()
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
    return 1 if any(counts.get(k,0) for k in ("missing","rejected","deferred_due_to_limit","awaiting_review")) else 0

if __name__=="__main__":raise SystemExit(main())
