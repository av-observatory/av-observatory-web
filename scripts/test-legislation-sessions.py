#!/usr/bin/env python3
"""Session-selection tests built from the REAL Open States session lists observed on 2026-10-14."""
import importlib.util
import sys
from datetime import date
from pathlib import Path

spec = importlib.util.spec_from_file_location("ls", Path(__file__).resolve().parent / "legislation_sessions.py")
ls = importlib.util.module_from_spec(spec); spec.loader.exec_module(ls)
TODAY = date(2026, 10, 14)
S = lambda i, a=None, b=None: {"identifier": i, "start_date": a, "end_date": b}
ok = True


def check(name, cond):
    global ok
    print(("PASS  " if cond else "FAIL  ") + name); ok &= bool(cond)


MO = [S("2017S1", "2017-06-01"), S("2017S2", "2017-07-25"), S("2018", "2017-12-01"), S("2018S1", "2018-05-21"),
      S("2018S2", "2018-09-10"), S("2025", "2025-01-08", "2025-05-16"), S("2025S1", "2025-06-02", "2025-06-13"),
      S("2025S2", "2025-09-03", "2025-09-13"), S("2026", "2026-01-07", "2026-05-15")]
AK = [S("27"), S("34", "2025-01-21", "2025-05-21")]
FL = [S("2025A", "2025-01-27", "2025-12-31"), S("2025", "2025-03-04", "2025-05-02"), S("2026", "2026-01-13", "2026-03-13"),
      S("2026D", "2026-04-28", "2026-05-01"), S("2026E", "2026-05-12", "2026-05-29"), S("2026F", "2026-06-01", "2026-06-05"),
      S("2027", "2027-01-13", "2027-03-13")]
MS = [S("2026", "2025-01-06", "2025-04-05"), S("2025", "2025-01-07", "2025-04-06"), S("20251E", "2025-05-28", "2025-06-06"),
      S("20261E", "2026-07-14", "2026-07-17")]
LA = [S("2024s3", "2024-11-01", "2024-11-29"), S("2025", "2025-04-14", "2025-06-12"), S("2025s1", "2025-10-23", "2025-10-24"),
      S("2026", "2026-03-09", "2026-06-01")]
DC = [S("26", "2025-01-02", "2026-12-31")]

pick = lambda rows: ls.select_sessions(rows, TODAY)
check("MO: regular 2026 session is searched (not 2018S2)", "2026" in pick(MO) and "2018S2" not in pick(MO))
check("AK: session 34 is searched (not undated 27)", "34" in pick(AK) and "27" not in pick(AK))
check("FL: regular 2026 is searched, not only special 2026F", "2026" in pick(FL))
check("FL: future 2027 session is never picked", "2027" not in pick(FL))
check("MS: regular 2026 is searched, not only special 20261E", "2026" in pick(MS))
check("LA: regular 2026 is searched", "2026" in pick(LA))
check("DC: session 26 is searched", pick(DC) == ["26"])
check("never more than 3 sessions per jurisdiction", all(len(pick(r)) <= 3 for r in (MO, AK, FL, MS, LA, DC)))
check("empty/undated input returns nothing safely", ls.select_sessions([S("x")], TODAY) == [] and ls.select_sessions([], TODAY) == [])
print("\nALL PASSED" if ok else "\nFAILURES"); sys.exit(0 if ok else 1)
