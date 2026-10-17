#!/usr/bin/env python3
"""Run every registered state adapter WITHOUT writing ledgers and report whether each one really works.

A state passes when every session returns a plausible number of bills with numbers and links. Failures show the
error text so the adapter can be fixed before any enumeration run. Usage: test-adapters.py [XX,YY] [--minutes N]
"""
import os, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, Path(__file__).parent.as_posix())
from bill_enumerators import ENUMERATORS

WANT = [a for a in sys.argv[1:] if not a.startswith("-") and not a.replace(".", "").isdigit()]
_only = os.getenv("TEST_STATES", "").strip() or (Path(__file__).parents[1] / ".github/test-states").read_text().strip() if (Path(__file__).parents[1] / ".github/test-states").exists() else os.getenv("TEST_STATES", "")
WANT = WANT[0].split(",") if WANT else ([x for x in _only.replace(",", " ").split() if x in ENUMERATORS] or sorted(ENUMERATORS))
CAP = 60 * float(os.getenv("TEST_MINUTES", "6"))
MIN_BILLS = 20


def test(code):
    sessions, func = ENUMERATORS[code]
    out = {"code": code, "sessions": {}, "ok": True, "notes": []}
    for session in sessions:
        t0, n, titled, linked, sample, err, done = time.monotonic(), 0, 0, 0, [], None, True
        try:
            for bill in func(session):
                n += 1
                titled += bool(bill.get("title"))
                linked += bool(bill.get("url"))
                if len(sample) < 2:
                    sample.append(f"{bill['number']} | {(bill.get('title') or '')[:40]}")
                if time.monotonic() - t0 > CAP:
                    done = False
                    break
        except Exception as exc:
            err = f"{type(exc).__name__}: {str(exc)[:160]}"
        out["sessions"][session] = {"n": n, "titled": titled, "linked": linked, "sample": sample, "err": err, "done": done,
                                    "secs": round(time.monotonic() - t0)}
        if err or n < MIN_BILLS or linked < n * 0.9:
            out["ok"] = False
    return out


with ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(test, WANT))
lines = ["| State | Result | Session: bills (titled, linked) secs | Sample / error |", "|---|---|---|---|"]
for r in results:
    detail = "; ".join(f"{s}: {i['n']} ({i['titled']}, {i['linked']}) {i['secs']}s{'' if i['done'] else ' CAPPED'}" for s, i in r["sessions"].items())
    sample = next((i["err"] for i in r["sessions"].values() if i["err"]), None) or next((i["sample"][0] for i in r["sessions"].values() if i["sample"]), "")
    lines.append(f"| {r['code']} | {'PASS' if r['ok'] else 'FAIL'} | {detail} | {sample} |")
passed = sum(r["ok"] for r in results)
text = f"## Adapter test (no ledgers written): {passed}/{len(results)} pass; {len(ENUMERATORS)} of 51 jurisdictions have adapters\n\n" + "\n".join(lines) + "\n"
print(text)
if os.getenv("GITHUB_STEP_SUMMARY"):
    open(os.environ["GITHUB_STEP_SUMMARY"], "a").write(text)
