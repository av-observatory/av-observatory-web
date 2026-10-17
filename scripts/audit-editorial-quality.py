#!/usr/bin/env python3
"""Audit AI-facing editorial text across policy, legislation and NHTSA feeds.
Exit nonzero on any unsafe, unreviewed or copied-source text.
Run before publishing refreshed datasets; do not treat a successful API request as editorial success.
"""
import json, re, subprocess, sys, time
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
        if row.get("editorial_status") in ("needs_review","needs_primary_source","source_retrieval_failed"):
            errors.append(f"{group}/{ident}: editorial verification incomplete")
    return errors

QUARANTINE=ROOT/"data-state"/"editorial_quarantine.json"

def quarantine_legislation():
    """Keep unverified bill text out of the published index without failing the whole refresh.

    A bill that fails the audit is replaced by its last committed (audited) version when there is one;
    otherwise it is withheld from the index and parked in data-state/editorial_quarantine.json until the
    editorial pipeline verifies it. Policy and NHTSA feeds are never quarantined: they keep failing the run.
    """
    path=ROOT/"public"/"data"/"legislation_tracker.json"
    if not path.exists():return
    data=json.loads(path.read_text())
    try:
        prior=json.loads(subprocess.run(["git","show","HEAD:public/data/legislation_tracker.json"],capture_output=True,text=True,check=True,cwd=ROOT).stdout)
    except Exception:
        prior={}
    old={r.get("id"):r for g in ("federal","state_bills") for r in prior.get(g,[]) if isinstance(r,dict)}
    held=json.loads(QUARANTINE.read_text()) if QUARANTINE.exists() else {}
    changed=False
    for group in ("federal","state_bills"):
        keep=[]
        for row in data.get(group,[]):
            issues=audit([row],group)
            ident=row.get("id")
            if not issues:
                held.pop(ident,None);keep.append(row);continue
            changed=True
            if ident in old and not audit([old[ident]],group):
                print(f"QUARANTINE: {ident} reverted to its last audited version ({issues[0].split(': ',1)[-1]})");keep.append(old[ident])
            else:
                print(f"QUARANTINE: {ident} withheld from the index ({issues[0].split(': ',1)[-1]})")
                held[ident]={"group":group,"issues":[i.split(": ",1)[-1] for i in issues],"held_since":held.get(ident,{}).get("held_since") or time.strftime("%Y-%m-%d",time.gmtime()),"row":row}
        data[group]=keep
    if changed:
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
    QUARANTINE.parent.mkdir(exist_ok=True)
    QUARANTINE.write_text(json.dumps(held,ensure_ascii=False,indent=1,sort_keys=True)+"\n")

def main():
    if "--quarantine" in sys.argv:quarantine_legislation()
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
