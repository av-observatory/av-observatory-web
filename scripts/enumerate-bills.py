#!/usr/bin/env python3
"""Enumerate EVERY bill from each state's own legislature, classify AV bills, queue them for analysis.

  1. ENUMERATE  run each registered state enumerator (bill_enumerators.py) for its sessions and
                record every bill in ``data-state/bill_ledger/<STATE>.json`` (first/last seen).
  2. CLASSIFY   every ledger bill is screened: title/summary match -> AV candidate; otherwise the
                bill's official page is scanned for AV language, oldest-scanned first within a
                per-run budget, so every bill is eventually scanned.
  3. HAND OFF   AV candidates stay in the ledger; sweep-state-legislatures.py adopts them into
                ``data-state/official_bills.json``, then extracts, verifies (is it really an AV bill?)
                and summarizes them. (Separate writers: no file is written by both workflows.)
  4. REPORT     ``data-state/bill_ledger/_report.json`` plus a table (also the Actions job summary):
                per state, bills enumerated, scan coverage, candidates, failures.

States without an enumerator are listed as ``not_built`` so coverage gaps are explicit, never silent.
Usage: enumerate-bills.py [--scan-budget N] [--states XX,YY]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bill_enumerators import ENUMERATORS, REV  # noqa: E402
from legislation_source_text import fetch  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
LEDGER_DIR = ROOT / "data-state/bill_ledger"
SOURCES = ROOT / "data-state/official_sources.json"
TODAY = date.today().isoformat()

AV = re.compile(
    r"\b(?:autonomous\s+(?:vehicle|vehicles|driving|truck|trucks|taxi|taxis|mobility|shuttle|shuttles|technology)|"
    r"automated\s+(?:driving\s+system|driving\s+systems|vehicle|vehicles|motor\s+vehicle|motor\s+vehicles)|"
    r"driverless|self[- ]driving|robotaxi(?:s)?|highly\s+automated\s+vehicle(?:s)?|"
    r"(?:fully|conditionally)\s+automated)\b", re.I)
EXCLUDE = re.compile(r"\b(?:autonomous region|autonomous university|unmanned aircraft|autonomous weapon)\b", re.I)


def number_key(value: str):
    m = re.match(r"([A-Za-z]+)[\s._-]*(\d+)", str(value or ""))
    return (m.group(1)[0].upper(), int(m.group(2))) if m else None


def is_av(text: str) -> bool:
    return bool(AV.search(text)) and not EXCLUDE.search(text)


def load_ledger(code: str) -> dict:
    path = LEDGER_DIR / f"{code}.json"
    return json.loads(path.read_text()) if path.exists() else {"jurisdiction": code, "sessions": {}, "bills": {}}


def save_ledger(code: str, ledger: dict) -> None:
    LEDGER_DIR.mkdir(parents=True, exist_ok=True)
    (LEDGER_DIR / f"{code}.json").write_text(json.dumps(ledger, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n")


def recently_enumerated(code: str, days: int) -> bool:
    """True when every session of this state enumerated cleanly within `days` days (nothing to redo)."""
    sessions = load_ledger(code).get("sessions", {})
    want = ENUMERATORS[code][0]
    cutoff = date.fromordinal(date.today().toordinal() - days).isoformat()
    return all(s in sessions and not sessions[s].get("error") and sessions[s].get("enumerated", 0) > 0
               and sessions[s].get("last_run", "") >= cutoff and sessions[s].get("rev", 1) == REV.get(code, 1)
               for s in want)


def enumerate_state(code: str) -> dict:
    sessions, func = ENUMERATORS[code]
    ledger = load_ledger(code)
    result = {"sessions": {}, "error": None}
    for session in sessions:
        info = {"enumerated": 0, "error": None}
        started = time.monotonic()
        try:
            seen = set()
            for bill in func(session):
                number = " ".join(str(bill["number"]).split())
                if not number:
                    continue
                key = f"{session}:{number}"
                seen.add(key)
                row = ledger["bills"].setdefault(key, {"session": session, "number": number, "first_seen": TODAY, "av": "unknown"})
                title = " ".join(str(bill.get("title") or "").split())
                row.update(title=title, url=bill.get("url") or row.get("url") or "", last_seen=TODAY)
                if bill.get("text_url"):
                    row["text_url"] = bill["text_url"]
                if bill.get("summary"):
                    row["summary"] = " ".join(str(bill["summary"]).split())[:400]
                info["enumerated"] += 1
            if info["enumerated"] == 0:
                raise RuntimeError("enumerator returned no bills")
            prefixes: dict = {}
            for key in seen:
                m = re.match(r"[^:]+:([A-Za-z]+)\s*(\d+)", key)
                if m:
                    p = prefixes.setdefault(m.group(1).upper(), [0, 0])
                    p[0] += 1
                    p[1] = max(p[1], int(m.group(2)))
            info["density"] = {k: f"{n}/{top}" for k, (n, top) in sorted(prefixes.items())}
            info["with_title"] = sum(1 for k in seen if ledger["bills"][k].get("title"))
        except Exception as exc:
            info["error"] = f"{type(exc).__name__}: {str(exc)[:200]}"
        info["seconds"] = round(time.monotonic() - started, 1)
        info["last_run"] = TODAY
        info["rev"] = REV.get(code, 1)
        ledger["sessions"][session] = info
        result["sessions"][session] = info
    # Drop sessions the adapter no longer covers (e.g. an overlapping biennium) so counts are not doubled.
    keep = set(sessions)
    ledger["bills"] = {k: v for k, v in ledger["bills"].items() if v.get("session") in keep}
    ledger["sessions"] = {k: v for k, v in ledger["sessions"].items() if k in keep}
    save_ledger(code, ledger)
    return result


def classify(ledgers: dict, scan_budget: int, scan_minutes: float) -> dict:
    """Title/summary screen for all; parallel page scan of unscanned bills (oldest first) within budget.

    Scans run in a thread pool with a per-host cap (politeness), in batches so progress is
    checkpointed to the ledgers and the deadline is honoured.
    """
    from concurrent.futures import ThreadPoolExecutor
    from threading import BoundedSemaphore
    from urllib.parse import urlparse

    stats = {code: {"candidates": 0, "scanned": 0, "unscanned": 0, "scan_failed": 0, "scan_seconds": 0.0} for code in ledgers}
    for code, ledger in ledgers.items():
        for row in ledger["bills"].values():
            if row.get("av") == "unknown" and is_av(f"{row.get('title', '')} {row.get('summary', '')}"):
                row["av"], row["via"], row["classified"] = "candidate", "title", TODAY
    queue = sorted(((row.get("scanned") or "", code, key) for code, ledger in ledgers.items()
                    for key, row in ledger["bills"].items() if row.get("av") in ("unknown", "no") and (row.get("text_url") or row.get("url"))))[:scan_budget]
    gates: dict = {}

    def scan(item):
        _, code, key = item
        url = ledgers[code]["bills"][key].get("text_url") or ledgers[code]["bills"][key]["url"]
        gate = gates.setdefault(urlparse(url).hostname, BoundedSemaphore(int(os.getenv("SCAN_PER_HOST", "4"))))
        started = time.monotonic()
        with gate:
            try:
                text, _ = fetch(url)
            except Exception:
                text = ""
        return code, key, text, time.monotonic() - started

    deadline = time.monotonic() + scan_minutes * 60
    workers = int(os.getenv("SCAN_WORKERS", "24"))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for start in range(0, len(queue), 400):
            if time.monotonic() > deadline:
                break
            for code, key, text, secs in pool.map(scan, queue[start:start + 400]):
                row = ledgers[code]["bills"][key]
                row["scanned"] = TODAY
                stats[code]["scan_seconds"] += secs
                if not text:
                    row["scan_failed"] = True
                    continue
                row.pop("scan_failed", None)
                if is_av(text):
                    row["av"], row["via"], row["classified"] = "candidate", "page_scan", TODAY
                else:
                    row["av"] = "no"
            for code, ledger in ledgers.items():  # checkpoint: progress survives a killed run
                save_ledger(code, ledger)
            print(f"Scanned {min(start + 400, len(queue))}/{len(queue)} queued pages", flush=True)
    for code, ledger in ledgers.items():
        s = stats[code]
        for row in ledger["bills"].values():
            s["candidates"] += row.get("av") in ("candidate", "yes")
            s["scanned"] += bool(row.get("scanned")) and not row.get("scan_failed")
            s["scan_failed"] += bool(row.get("scan_failed"))
        s["unscanned"] = sum(1 for r in ledger["bills"].values() if not r.get("scanned") and r.get("via") != "title")
    return stats


def report(results: dict, stats: dict, ledgers: dict) -> str:
    all_codes = [j["code"] for j in json.loads(SOURCES.read_text())["jurisdictions"]]
    lines = ["| State | Status | Bills | Titled | Scanned | Unreadable | AV candidates | Scan secs | Notes |", "|---|---|---:|---:|---:|---:|---:|---:|---|"]
    built = ok = total = 0
    for code in all_codes:
        if code not in ENUMERATORS:
            lines.append(f"| {code} | not built | 0 | 0 | 0 | 0 | 0 | 0 | no enumerator yet |")
            continue
        built += 1
        res = results.get(code)
        led = ledgers.get(code, {"bills": {}})
        n = len(led["bills"])
        errs = [f"{s}: {i['error']}" for s, i in (res["sessions"] if res else led.get("sessions", {})).items() if i.get("error")]
        good = [s for s, i in (res["sessions"] if res else led.get("sessions", {})).items() if not i.get("error")]
        status = "ok" if good and not errs else ("partial" if good else "FAILED")
        ok += status == "ok"
        total += n
        titled = sum(1 for r in led["bills"].values() if r.get("title"))
        st = stats.get(code, {})
        dens = "; ".join(f"{s} {','.join(f'{k} {v}' for k, v in (i.get('density') or {}).items())}"
                         for s, i in led.get("sessions", {}).items() if i.get("density"))
        lines.append(f"| {code} | {status} | {n} | {titled} | {st.get('scanned', 0)} | {st.get('scan_failed', 0)} | {st.get('candidates', 0)} | {st.get('scan_seconds', 0):.0f} | "
                     f"{'; '.join(errs)[:160] or dens[:120]} |")
    head = (f"## Bill enumeration report ({TODAY})\n\n{built}/{len(all_codes)} jurisdictions have an enumerator; "
            f"{ok} enumerated cleanly; {total} bills in the ledgers; {sum(v['candidates'] for v in stats.values())} AV candidate(s) awaiting analysis.\n\n")
    return head + "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan-budget", type=int, default=int(os.getenv("SCAN_BUDGET", "100000")))
    ap.add_argument("--scan-minutes", type=float, default=float(os.getenv("SCAN_MINUTES", "40")))
    ap.add_argument("--states", default="")
    ap.add_argument("--force", action="store_true", help="re-enumerate states even if enumerated recently")
    ap.add_argument("--refresh-days", type=int, default=int(os.getenv("ENUM_REFRESH_DAYS", "5")))
    ap.add_argument("--skip-enumerate", action="store_true", help="reuse the ledgers; only scan/report (scan chunks)")
    args = ap.parse_args()
    wanted = [s for s in args.states.split(",") if s] or sorted(ENUMERATORS)
    results = {}
    for code in ([] if args.skip_enumerate else wanted):
        if not args.force and recently_enumerated(code, args.refresh_days):
            print(f"Skipped {code}: enumerated within the last {args.refresh_days} days", flush=True)
            continue
        results[code] = enumerate_state(code)
        print(f"Enumerated {code}: " + "; ".join(
            f"{s}={i['enumerated']}{' ERROR ' + i['error'] if i['error'] else ''}" for s, i in results[code]["sessions"].items()), flush=True)
    ledgers = {code: load_ledger(code) for code in sorted(ENUMERATORS)}
    stats = classify(ledgers, args.scan_budget, args.scan_minutes)
    for code, ledger in ledgers.items():
        save_ledger(code, ledger)
    text = report(results, stats, ledgers)
    (LEDGER_DIR / "_report.md").write_text(text)
    print(text)
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as fh:
            fh.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
