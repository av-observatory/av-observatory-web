#!/usr/bin/env python3
"""Offline tests for the legislation cross-check (manual bill merge, temp copy of the tracker)."""
import copy, importlib.util, json, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("sup", ROOT / "scripts/legislation-supplement.py")
sup = importlib.util.module_from_spec(spec); spec.loader.exec_module(sup)
BASE = json.loads((ROOT / "public/data/legislation_tracker.json").read_text(encoding="utf-8"))
MANUAL = json.loads((ROOT / "data-state/manual_bills.json").read_text(encoding="utf-8"))
MANUAL = [b for b in MANUAL if b["jurisdiction"] == "DC"]  # the tests target the DC override
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

# re-running on an already-supplemented file must not report a false "retired"
t_again = fresh(); sup.merge_manual(t_again, MANUAL)
added_again, retired_again = sup.merge_manual(t_again, MANUAL)
check("re-run keeps the manual bill without a false retire alert", added_again == ["dc-b26-0684-26"] and retired_again == [])
check("re-run leaves exactly one DC bill", len([b for b in t_again["state_bills"] if b["jurisdiction"] == "DC"]) == 1)

check("retired manual bill raises an alert", any(a[0].startswith("manual-retired-") for a in sup.alerts(["dc-b26-0684-26"])))
check("no alerts when nothing retired", sup.alerts([]) == [])
print("\nALL PASSED" if ok else "\nFAILURES"); sys.exit(0 if ok else 1)
