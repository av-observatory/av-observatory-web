#!/usr/bin/env python3
import importlib.util, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("kb", Path(__file__).resolve().parent / "check-known-bills.py")
kb = importlib.util.module_from_spec(spec); spec.loader.exec_module(kb)
ok = True
def check(n, c):
    global ok; print(("PASS  " if c else "FAIL  ") + n); ok &= bool(c)
tracker = {"state_bills": [{"jurisdiction": "DC", "number": "B 26-0684"}, {"jurisdiction": "MO", "number": "HB 2069"}]}
known = {"bills": [{"jurisdiction": "DC", "number": "B26-684"}, {"jurisdiction": "MO", "number": "HB2069"},
                   {"jurisdiction": "LA", "number": "SB 133"}, {"jurisdiction": "MO", "number": "HB 20"}]}
gone = kb.missing(tracker, known)
check("number formats from different feeds match", all(k["number"] not in ("B26-684", "HB2069") for k in gone))
check("an absent bill is reported", any(k["number"] == "SB 133" for k in gone))
check("HB 20 is not confused with HB 2069", any(k["number"] == "HB 20" for k in gone))
check("same number in another state does not count", kb.missing({"state_bills": [{"jurisdiction": "TX", "number": "SB 133"}]}, {"bills": [{"jurisdiction": "LA", "number": "SB 133"}]}) != [])
print("\nALL PASSED" if ok else "\nFAILURES"); sys.exit(0 if ok else 1)
