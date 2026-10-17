#!/usr/bin/env python3
"""Sweep every state legislature's official site for AV bills, independent of Open States.

For each of the 50 states + DC in ``data-state/official_sources.json`` this searches the
state's own legislative domain, fetches the candidate pages, keeps only pages that are
about autonomous vehicles and name a bill, and compares them with the bill index.

  * ``data-state/docket_sweep_log.json``  per-jurisdiction record (checked / sources_read /
    bills_found / unreadable). The editorial step uses ``sources_read`` as bill-text candidates.
  * ``data-state/state_sweep_candidates.json``  AV bills found on an official site but absent
    from the index; with --open-issues each jurisdiction's new candidates get one GitHub issue.

Jurisdictions are processed least-recently-checked first, so a time budget or a blocked site
never starves the same states: the next run resumes with whatever was swept longest ago.
Usage: sweep-state-legislatures.py [--open-issues] [--budget-minutes N]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from legislation_source_text import fetch  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "data-state/official_sources.json"
SWEEP_LOG = ROOT / "data-state/docket_sweep_log.json"
CANDIDATES = ROOT / "data-state/state_sweep_candidates.json"
TRACKER = ROOT / "public/data/legislation_tracker.json"
TODAY = date.today().isoformat()
YEARS = (str(date.today().year), str(date.today().year - 1))

RELEVANT = re.compile(
    r"\b(?:autonomous\s+(?:vehicle|vehicles|driving|truck|trucks|taxi|taxis|mobility|shuttle|shuttles)|"
    r"automated\s+(?:driving\s+system|driving\s+systems|vehicle|vehicles|motor\s+vehicle)|"
    r"driverless\s+(?:vehicle|vehicles|car|cars|truck|trucks|taxi|taxis|shuttle|shuttles)|"
    r"self[- ]driving|robotaxi(?:s)?|highly\s+automated\s+vehicle(?:s)?)\b", re.I)
EXCLUDE = re.compile(r"\b(?:autonomous region|autonomous university|unmanned aircraft)\b", re.I)
BILL_ID = re.compile(r"\b(HB|SB|HF|SF|AB|SJR|HJR|HCR|SCR|HSB|SSB|HR|SR|LB|LD|HD|SD|A|S|H)[\s._-]*(?:No\.?\s*)?(\d{1,5})\b")


def search(host: str, query: str) -> list[str]:
    """Official-domain search; results are candidates only (fetch() enforces gov hosts)."""
    from xml.etree import ElementTree
    q = f"site:{host} {query}"
    url = "https://www.bing.com/search?" + urlencode({"q": q, "format": "rss"})
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 AVObservatoryResearch/1.0"})
    with urlopen(req, timeout=20) as response:
        root = ElementTree.fromstring(response.read(300000))
    links = []
    for link in root.findall(".//item/link"):
        href = (link.text or "").strip()
        if href.startswith("https://") and (urlparse(href).hostname or "").lower().endswith(host.split(".", 1)[-1]):
            links.append(href)
    return links


def bill_numbers(url: str, text: str) -> list[str]:
    """Identifiers named by the URL or the opening of the page (where the bill header sits)."""
    found = []
    for blob in (url, text[:700]):
        for prefix, digits in BILL_ID.findall(blob):
            ident = f"{prefix.upper()} {int(digits)}"
            if ident not in found:
                found.append(ident)
    return found[:3]


def in_index(jurisdiction: str, ident: str, index: list[dict]) -> bool:
    prefix, number = ident.split()
    for bill in index:
        if bill.get("jurisdiction") != jurisdiction:
            continue
        m = re.match(r"([A-Za-z]+)[\s._-]*(\d+)", str(bill.get("number") or ""))
        if m and int(m.group(2)) == int(number) and m.group(1)[0].upper() == prefix[0]:
            return True
    return False


def sweep_one(entry: dict, index: list[dict]) -> dict:
    host = (urlparse(entry["official_site"]).hostname or "").removeprefix("www.")
    queries = ["autonomous vehicle bill", '"automated driving system" bill', "driverless OR self-driving vehicle bill"]
    urls, errors = [], []
    for query in queries:
        try:
            urls += [u for u in search(host, query) if u not in urls]
        except Exception as exc:
            errors.append(f"search {type(exc).__name__}")
        time.sleep(1)
    read, found, candidates = [], [], []
    for url in urls[:10]:
        text, provenance = fetch(url)
        if not text:
            errors.append(f"{provenance} {urlparse(url).path[:50]}")
            continue
        sample = text[:6000]
        if not RELEVANT.search(sample) or EXCLUDE.search(sample):
            continue
        idents = bill_numbers(url, text)
        if not idents:
            continue
        read.append(url)
        for ident in idents:
            found.append(ident)
            if not in_index(entry["code"], ident, index) and any(y in text[:4000] for y in YEARS):
                candidates.append({"number": ident, "url": url, "first_seen": TODAY})
    result = {"attempted": TODAY, "searched": len(urls)}
    if read:
        result.update(checked=TODAY, sources_read=read, bills_found=sorted(set(found)))
    else:
        result["unreadable"] = ("; ".join(sorted(set(errors)))[:300] or
                                "official-site search returned no AV bill pages") + f" (searched {len(urls)} pages)"
    return {"log": result, "candidates": candidates}


def open_issue(code: str, new: list[dict]) -> None:
    title = f"AV bill on official {code} site missing from index"
    body = ("The weekly official-site sweep found AV bills on the state's own legislative site that the "
            "index does not carry:\n\n" + "\n".join(f"- {c['number']}: {c['url']}" for c in new) +
            "\n\nVerify and add via data-state/manual_bills.json if genuine.")
    found = subprocess.run(["gh", "issue", "list", "--state", "open", "--label", "data-coverage", "--search",
                            f'"{title}" in:title', "--json", "number"], capture_output=True, text=True)
    if found.returncode == 0 and found.stdout.strip() not in ("", "[]"):
        return
    subprocess.run(["gh", "issue", "create", "--title", title, "--label", "data-coverage", "--body", body])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--open-issues", action="store_true")
    ap.add_argument("--budget-minutes", type=float, default=25)
    args = ap.parse_args()
    jurisdictions = json.loads(SOURCES.read_text())["jurisdictions"]
    log = json.loads(SWEEP_LOG.read_text()) if SWEEP_LOG.exists() else {}
    known = json.loads(CANDIDATES.read_text()) if CANDIDATES.exists() else {}
    index = json.loads(TRACKER.read_text())["state_bills"]
    # Least-recently-attempted first: resume where the previous sweep stopped.
    order = sorted(jurisdictions, key=lambda j: (log.get(j["code"], {}).get("attempted") or "", j["code"]))
    started, done, readable = time.monotonic(), 0, 0
    for entry in order:
        if time.monotonic() - started > args.budget_minutes * 60:
            break
        code = entry["code"]
        try:
            out = sweep_one(entry, index)
        except Exception as exc:
            out = {"log": {"attempted": TODAY, "unreadable": f"sweep error {type(exc).__name__}"}, "candidates": []}
        previous = log.get(code, {})
        merged = {**previous, **out["log"]}
        if "unreadable" not in out["log"]:
            merged.pop("unreadable", None)
        log[code] = merged
        old = {c["number"] for c in known.get(code, [])}
        new = [c for c in out["candidates"] if c["number"] not in old]
        if out["candidates"]:
            known[code] = known.get(code, []) + new
        done += 1
        readable += "unreadable" not in out["log"]
        print(f"Sweep {code}: {'read ' + str(len(out['log'].get('sources_read', []))) + ' pages' if 'unreadable' not in out['log'] else out['log']['unreadable']}"
              f"; {len(new)} new candidate(s)", flush=True)
        SWEEP_LOG.write_text(json.dumps(log, indent=1, sort_keys=True) + "\n")
        CANDIDATES.write_text(json.dumps(known, indent=1, sort_keys=True) + "\n")
        if args.open_issues and new:
            open_issue(code, new)
    print(f"Swept {done}/{len(jurisdictions)} jurisdictions; {readable} produced official AV pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
