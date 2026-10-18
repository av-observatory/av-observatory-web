#!/usr/bin/env python3
"""Validate a state's extracted files against docs/multi-state-spec.md.  usage: check-state-extract.py WA"""
import gzip, json, sys
from collections import Counter
from pathlib import Path

ST = sys.argv[1].upper()
D = Path(__file__).resolve().parents[1] / "data-state/states" / ST
STATUS = {"Chaptered", "Vetoed", "Passed", "In Floor Process", "In Committee Process", "Pending Referral", "Died", "Failed Passage in Committee"}
REQ = ["id", "type", "number", "session", "title", "digest", "digest_source", "status", "status_raw", "last_action", "last_action_date", "house", "chapter", "chaptered", "url", "authors", "action_count"]
ROLES = {"LEAD_AUTHOR", "PRINCIPAL_COAUTHOR", "COAUTHOR"}
errs = []
bills = json.loads((D / "bills.json").read_text())
legs = json.loads((D / "legislators.json").read_text())
votes = json.load(gzip.open(D / "votes.json.gz", "rt"))
hist = json.load(gzip.open(D / "history.json.gz", "rt"))
for k, b in bills.items():
    miss = [f for f in REQ if f not in b]
    if miss:
        errs.append(f"{k}: missing {miss}")
        continue
    if b["status"] not in STATUS:
        errs.append(f"{k}: bad status {b['status']!r}")
    for a in b["authors"]:
        if a.get("role") not in ROLES:
            errs.append(f"{k}: bad role {a.get('role')!r}")
        if a.get("legislator") and a["legislator"] not in legs:
            errs.append(f"{k}: author id {a['legislator']} not in legislators")
for lid, l in legs.items():
    for f in ("id", "name", "party", "house", "district"):
        if f not in l:
            errs.append(f"legislator {lid}: missing {f}")
for k, vs in votes.items():
    if k not in bills:
        errs.append(f"votes for unknown bill {k}")
    for v in vs:
        for f in ("date", "chamber", "floor", "motion", "ayes", "noes", "abstain", "result", "members"):
            if f not in v:
                errs.append(f"{k}: vote missing {f}")
                break
        else:
            if v["members"] and (sum(1 for m in v["members"].values() if m["vote"] == "AYE") != v["ayes"] or sum(1 for m in v["members"].values() if m["vote"] == "NOE") != v["noes"]):
                errs.append(f"{k} {v['date']}: member list disagrees with tally")
for k in hist:
    if k not in bills:
        errs.append(f"history for unknown bill {k}")
n = len(bills)
print(f"{ST}: {n} bills, {len(legs)} legislators, votes for {len(votes)} bills, history for {len(hist)} bills")
print("status:", dict(Counter(b["status"] for b in bills.values())))
print(f"digest {sum(1 for b in bills.values() if b.get('digest'))}/{n}; authors {sum(1 for b in bills.values() if b.get('authors'))}/{n}; matched author ids {sum(1 for b in bills.values() for a in b.get('authors', []) if a.get('legislator'))}/{sum(len(b.get('authors', [])) for b in bills.values())}")
print(f"{len(errs)} problems")
for e in errs[:30]:
    print("  ", e)
sys.exit(1 if errs else 0)
