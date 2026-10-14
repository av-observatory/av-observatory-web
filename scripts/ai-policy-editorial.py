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
EDITORIAL_VERSION="full-text-extract-v2"
MAX_NEW=int(os.getenv("POLICY_EDITORIAL_MAX_NEW","300"))

def invoke(messages):
    body=json.dumps({"model":MODEL,"temperature":0,
      "response_format":{"type":"json_object"},"messages":messages}).encode()
    request=Request("https://api.openai.com/v1/chat/completions",body,
        {"Content-Type":"application/json","Authorization":"Bearer "+KEY})
    for i in range(4):
        try:
            time.sleep(float(os.getenv('POLICY_EDITORIAL_REQUEST_GAP_SECONDS','1.25')))
            with urlopen(request,timeout=95) as response:
                return json.loads(json.load(response)["choices"][0]["message"]["content"])
        except Exception:
            if i==3:raise
            time.sleep(min(60,4**i))

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

def not_source_copy(row,draft):
    """Reject feed descriptions merely copied into the new summary."""
    value=" ".join(str(draft.get("summary") or "").lower().split())
    source=" ".join(str(row.get("source_summary") or "").lower().split())
    if not value or not source:return True
    return value!=source and not (len(value)>100 and value in source)

def specific_to_record(row,kind,draft):
    if kind!="fmvss" or not re.match(r"fmvss-\d{3}a?-",row.get("id","")):
        return True
    title_terms=set(re.findall(r"[a-z]{5,}",str(row.get("title") or "").lower()))
    title_terms-=set(("federal","motor","vehicle","safety","standard","rulemaking"))
    if not title_terms:return True
    summary_terms=set(re.findall(r"[a-z]{5,}",str(draft.get("summary") or "").lower()))
    return bool(title_terms&summary_terms)

def get_source(row,kind):
    if kind.startswith("nhtsa_"):
        row={**row,"source_url":row.get("source") or row.get("source_url")}
    text,provenance,url=primary_text(row,kind)
    if text:return text,provenance,url
    # A feed abstract is not a substitute for official bill text.
    return "","missing_full_text_and_substantive_abstract",""

def select_relevant_excerpt(text,row,kind):
    """Rank substantive provisions throughout a long document, not just its preamble.

    Budget omnibus bills can contain the relevant AV amendment thousands of
    lines after the title. A first-N keyword approach misses that operative text.
    """
    if len(text)<=24000:return text
    identifiers=[r"\bautonomous vehicles?\b",r"\bautomated driving systems?\b",
        r"\bdriverless\b",r"\bself[- ]driving\b",r"\brobotaxi\b"]
    if kind=="fmvss":
        match=re.match(r"fmvss-(\d{3}a?)-",str(row.get("id") or ""),re.I)
        if match:
            number=re.escape(match.group(1))
            identifiers=[rf"\bFMVSS\s*(?:No\.\s*)?{number}\b",
                rf"\b571\.{number}\b",rf"\bstandard\s*(?:No\.\s*)?{number}\b"]
    positions=sorted(set(m.start() for pattern in identifiers
        for m in re.finditer(pattern,text,re.I)))
    ranked=[]
    for pos in positions:
        fragment=text[max(0,pos-700):min(len(text),pos+1750)]
        score=(3*len(re.findall(r"\b(?:section|§|shall|amend(?:ed|s)?|requires?|expire|repeal|effective|submit|reporting|authorize)\b",fragment,re.I))
            +len(re.findall(r"\b(?:vehicles?|motor|commission|agency|operator)\b",fragment,re.I)))
        if pos<3500:score-=25
        ranked.append((score,pos))
    selected=[]
    for _,pos in sorted(ranked,reverse=True):
        if all(abs(pos-other)>1250 for other in selected):
            selected.append(pos)
        if len(selected)>=9:break
    chunks=[text[:1200]]
    for pos in sorted(selected):
        chunks.append(text[max(0,pos-650):min(len(text),pos+1800)])
    return "\n\n[Official text excerpt]\n\n".join(chunks)[:24000]


def summarize(row,kind):
    source,source_type,source_url=get_source(row,kind)
    if not source:
        row["editorial_status"]="needs_primary_source"
        row["editorial_failure_reason"]="Official text, bill-version discovery and independent bill-ID research yielded no verified substantive document"
        return "missing"
    digest=hashlib.sha256((MODEL+"\n"+EDITORIAL_VERSION+"\n"+kind+"\n"+source+"\n"+str(row.get("status"))).encode()).hexdigest()
    current_text=row.get("analysis") if kind=="state_framework" else row.get("summary")
    if row.get("editorial_source_hash")==digest and row.get("editorial_status")=="verified" and quality({"summary":current_text}):
        return "cached"
    if not KEY:raise RuntimeError("OPENAI_API_KEY not configured")
    row["editorial_source_hash"]=digest
    row["editorial_source_type"]=source_type
    row["editorial_source_url"]=source_url
    source=select_relevant_excerpt(source,row,kind)
    current_status=str(row.get("status") or "")
    status_note=("This is NOT enacted law. Describe ALL substantive provisions with conditional language such as would or proposes. Never claim this law already requires something." if kind.endswith("_bill") and current_status not in ("enacted","signed","chaptered") else "Clearly distinguish the measure's legal status.")
    if kind=="nhtsa_investigation":
        status_note="This is an NHTSA investigation, not a finding of defect or fault. State the alleged problem, vehicles affected, and the investigation's scope; distinguish reported events from verified conclusions."
    elif kind=="nhtsa_recall":
        status_note="This is an NHTSA recall record. Describe the specific reported defect, its potential safety consequence and the documented remedy, without implying a completion rate."
    prompt=(status_note+" You are an impartial legislative and regulatory researcher. Write a readable 2–3 sentence summary, "
      "about 35–65 words, grounded EXCLUSIVELY in the supplied original bill text or official rule. "
      "Explain what it proposes or changes, which vehicles or actors it affects, and any important reporting duties, "
      "deadlines or authority where stated. Distinguish proposed and enacted measures. Explain abbreviations. "
      "Do not restate the title or procedural history. Focus on a specific numbered standard rather than the entire rulemaking. Avoid unexplained acronyms. Never invent provisions, dates or status. If insufficient, return needs_review=true. "
      "Return JSON {summary:string,needs_review:boolean,reason:string}.")
    request=json.dumps({"kind":kind,"jurisdiction":row.get("jurisdiction") or row.get("code"),"bill_or_rule":row.get("number") or row.get("framework") or row.get("title"),"title":row.get("title") or row.get("name"),
        "status":row.get("status"),"evidence_type":source_type,"official_source_text":source})
    draft=invoke([{"role":"system","content":prompt},{"role":"user","content":request}])
    for _attempt in range(2):
        if draft.get("needs_review") or (quality(draft) and status_consistent(row,kind,draft) and specific_to_record(row,kind,draft) and not_source_copy(row,draft)):
            break
        strict_status=("This measure is NOT LAW. The final answer must begin exactly with 'The bill would' and EVERY sentence must use would or could when describing proposed legal obligations. Never use present-tense statements of unpassed requirements."
                       if kind.endswith("_bill") and row.get("status") not in ("enacted","signed","chaptered")
                       else "Preserve the official proposed-versus-effective status.")
        draft=invoke([
          {"role":"system","content":strict_status+" Rewrite into exactly two clear sentences, 40–55 words, at most 440 characters. No unexplained abbreviations, especially ADS, ODI and FMVSS. Write out 'Federal Motor Vehicle Safety Standard' instead. State the specific substantive change supported by the source, not a general policy description. Respond JSON {summary:string,needs_review:boolean,reason:string}."},
          {"role":"user","content":json.dumps({"record_title":row.get("title"),"status":row.get("status"),"source":source,"draft":draft.get("summary")})}
        ])
    if draft.get("needs_review") or not quality(draft) or not status_consistent(row,kind,draft) or not specific_to_record(row,kind,draft) or not not_source_copy(row,draft):
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
    if kind=="state_framework":
        row["analysis"]=draft["summary"].strip()
    else:
        row["summary"]=draft["summary"].strip()
        row["takeaway"]=row["summary"]
    row["summary_method"]="ai_verified_primary_source" if source_type.startswith("official_") else "ai_verified_mirrored_full_text"
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
        ("public/data/policy_tracker.json",[("federal","policy_rule"),("federal_oversight","policy_rule"),
            ("state_events","state_regulation"),("city_events","state_regulation"),("states","state_framework")]),
        ("public/data/nhtsa_investigations.json",[("investigations","nhtsa_investigation")]),
        ("public/data/nhtsa_av_recalls.json",[("recalls","nhtsa_recall")])]:
        path=ROOT/filename
        data=json.loads(path.read_text())
        for field,kind in groups:
            for row in data[field]:
                actual_kind="fmvss" if kind=="policy_rule" and "FMVSS" in row.get("instrument","") else kind
                if used>=MAX_NEW:
                    counts["deferred_due_to_limit"]=counts.get("deferred_due_to_limit",0)+1
                    continue
                # Existing verified records are reconsidered to detect changed sources.
                try:
                    result=summarize(row,actual_kind)
                except Exception as exc:
                    # One unavailable jurisdiction or throttled source must not
                    # prevent verified corrections for other records being saved.
                    result="error"
                    row["editorial_status"]="needs_review"
                    row["editorial_failure_reason"]=f"{type(exc).__name__}: {str(exc)[:160]}"
                counts[result]=counts.get(result,0)+1
                print(f"Editorial progress: {filename} {field} {row.get('id') or row.get('code')} -> {result}",flush=True)
                if result in ("updated","rejected","error"):used+=1
                # Durable checkpoint for long nationwide retrospective audits.
                if sum(counts.values())%10==0:
                    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
    print("Policy editorial results:",counts)
    # Missing source or failed verification is marked, not silently invented.
    # Any failure remains visible as a coverage gap, never a successful editorial run.
    return 1 if any(counts.get(k,0) for k in ("missing","rejected","deferred_due_to_limit","awaiting_review","error")) else 0

if __name__=="__main__":raise SystemExit(main())
