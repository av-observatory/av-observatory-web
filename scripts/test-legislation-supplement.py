#!/usr/bin/env python3
"""Offline tests for the legislation cross-check (fake LegiScan, temp copy of the tracker)."""
import copy, importlib.util, json, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("sup", ROOT / "scripts/legislation-supplement.py")
sup = importlib.util.module_from_spec(spec); spec.loader.exec_module(sup)
BASE = json.loads((ROOT / "public/data/legislation_tracker.json").read_text(encoding="utf-8"))
MANUAL = json.loads((ROOT / "data-state/manual_bills.json").read_text(encoding="utf-8"))
ok = True


def check(name, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + name); ok &= bool(cond)


def fresh():
    t = copy.deepcopy(BASE)
    t["state_bills"] = [b for b in t["state_bills"] if not b.get("source_feed") and b["jurisdiction"] != "DC"]
    return t


# number normalisation: formats from different feeds must match
check("B 26-0684 == B26-684", sup.norm_number("B 26-0684") == sup.norm_number("B26-684"))
check("different bills differ", sup.norm_number("SB 12") != sup.norm_number("SB 120"))

# manual bill added when no feed has it, retired once a feed does
t = fresh(); added, retired = sup.merge_manual(t, MANUAL)
dc = [b for b in t["state_bills"] if b["jurisdiction"] == "DC"]
check("manual DC bill is added", added == ["dc-b26-0684-26"] and len(dc) == 1)
check("manual bill labelled", dc and dc[0]["source_feed"] == "manual_official")
t2 = fresh(); t2["state_bills"].append({**MANUAL[0], "number": "B 26-0684", "id": "dc-b-26-0684-26"})
added2, retired2 = sup.merge_manual(t2, MANUAL)
check("manual bill retired when a feed carries it", added2 == [] and retired2 == ["dc-b26-0684-26"])
check("no duplicate when retired", len([b for b in t2["state_bills"] if b["jurisdiction"] == "DC"]) == 1)

# second source: adds only what the primary lacks, skips failed bills and irrelevant ones
HITS = {"DC": [{"bill_number": "B26-0684", "bill_id": 1, "title": "x", "url": "https://legiscan.com/DC/bill/B26-0684/2025", "last_action_date": "2026-07-13", "last_action": "Hearing"},
               {"bill_number": "B26-0001", "bill_id": 2, "title": "Dead AV bill", "url": "https://legiscan.com/DC/bill/B26-0001/2025", "last_action_date": "2026-01-01", "last_action": ""},
               {"bill_number": "B26-0002", "bill_id": 3, "title": "Tax bill", "url": "https://legiscan.com/DC/bill/B26-0002/2025", "last_action_date": "2026-01-01", "last_action": ""}]}
DETAIL = {1: {"status": 1, "title": "Autonomous Vehicle Deployment Authorization Amendment Act of 2026", "description": "Autonomous vehicles program", "state_link": "https://lims.dccouncil.gov/Legislation/B26-0684", "session": {"year_start": 2025}, "history": [{"date": "2026-05-01", "action": "Introduced"}, {"date": "2026-05-05", "action": "Referred to committee"}]},
          2: {"status": 6, "title": "Dead autonomous vehicle bill", "description": "autonomous vehicle", "state_link": "https://x.gov/b", "session": {}},
          3: {"status": 1, "title": "Property tax relief", "description": "Taxes", "state_link": "https://x.gov/t", "session": {}}}
sup.legiscan_search = lambda code: HITS.get(code, [])
sup.legiscan_get = lambda **p: {"bill": DETAIL[p["id"]]}
t3 = fresh(); cov = {}; sup.merge_secondary(t3, ["DC", "UT"], cov)
added3 = [b for b in t3["state_bills"] if b["jurisdiction"] == "DC"]
check("second source adds the missing live bill", [b["number"] for b in added3] == ["B26-0684"])
check("failed bill skipped", all(b["number"] != "B26-0001" for b in added3))
check("irrelevant bill skipped", all(b["number"] != "B26-0002" for b in added3))
check("record passes site field rules", added3 and added3[0]["source_url"].startswith("https://") and added3[0]["progress_stage"] in
      {"introduced", "committee", "floor", "passed_legislature", "executive", "law"} and added3[0]["summary"] and added3[0]["hearings"] == [])
check("coverage records what was added", cov["DC"]["added_from_legiscan"] == ["B26-0684"] and cov["DC"]["legiscan"] == "ok")

# when the primary already has it, nothing is added and no alert is raised
t4 = fresh(); t4["state_bills"].append({**MANUAL[0], "number": "B 26-0684"}); cov4 = {}
sup.merge_secondary(t4, ["DC"], cov4)
check("nothing added when primary has the bill", cov4["DC"]["added_from_legiscan"] == [])

# a failing second source is reported, never silent
def boom(code): raise RuntimeError("HTTP 500")
sup.legiscan_search = boom
cov5 = {}; sup.merge_secondary(fresh(), ["DC"], cov5)
check("source failure is recorded", cov5["DC"]["legiscan"].startswith("error"))
report = {"jurisdictions": {"DC": cov5["DC"]}}
check("failure raises an alert", any(a[0].startswith("legiscan-error-DC") for a in sup.alerts(report, [], True)))
check("missing key raises an alert", any(a[0] == "legiscan-not-configured" for a in sup.alerts({"jurisdictions": {}}, [], False)))
check("added bills raise an alert", any(a[0].startswith("missing-DC") for a in sup.alerts({"jurisdictions": {"DC": cov["DC"]}}, [], True)))
print("\nALL PASSED" if ok else "\nFAILURES"); sys.exit(0 if ok else 1)
