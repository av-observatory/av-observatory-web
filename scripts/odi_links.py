#!/usr/bin/env python3
"""Resolve each NHTSA ODI investigation to its actual official document.

The investigations feed (refresh-nhtsa-oversight.py) used to fall back to the
generic https://www.nhtsa.gov/search-safety-issues page for any case that had
not been hand-curated, so most cards linked to a search box instead of the
investigation. NHTSA publishes every ODI resume on its public document store
(https://static.nhtsa.gov/odi/inv/<year>/), whose S3-style listing is open, so
the exact file can be discovered rather than guessed:

  INOA-<ID>-<n>.pdf   opening resume  (exists for every investigation)
  INCLA-<ID>-<n>.pdf  closing resume  (exists once the investigation closes)

Rule (matches the links already curated by hand): closed -> closing resume,
open -> opening resume; closed with no closing resume -> opening resume.
Hand-curated non-ODI links (e.g. a press release) are never overwritten.

Usage:  python3 scripts/odi_links.py            # rewrite sources in the JSON
        python3 scripts/odi_links.py --check    # fail if any link is generic
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data" / "nhtsa_investigations.json"
BASE = "https://static.nhtsa.gov/"
GENERIC = "https://www.nhtsa.gov/search-safety-issues"
ODI_DOC = re.compile(r"^https://static\.nhtsa\.gov/odi/inv/\d{4}/(INOA|INCLA)-")
UA = {"User-Agent": "AVObservatory/1.0 (public research)"}


def _list_year(year):
    keys, token = [], None
    while True:
        query = {"list-type": "2", "prefix": f"odi/inv/{year}/", "max-keys": "1000"}
        if token:
            query["continuation-token"] = token
        url = BASE + "?" + urllib.parse.urlencode(query)
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45) as resp:
            xml = resp.read().decode("utf-8", "replace")
        keys += re.findall(r"<Key>([^<]+)</Key>", xml)
        match = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", xml)
        if not match:
            return keys
        token = match.group(1)


class OdiIndex:
    """Lazily lists each year's documents once and answers per-ID lookups."""

    def __init__(self):
        self.years = {}

    def documents(self, number):
        year = 2000 + int(number[2:4])
        if year not in self.years:
            self.years[year] = _list_year(year)
        needle = f"-{number}-"
        return [k for k in self.years[year] if needle in k]


def resolve(number, closed, prior_source, index):
    """Return the best official URL for this investigation, or prior_source."""
    curated = bool(prior_source) and prior_source != GENERIC and not ODI_DOC.match(prior_source)
    if curated:
        return prior_source
    try:
        docs = index.documents(number)
    except Exception as exc:  # network trouble must never break a data refresh
        print(f"WARN: ODI document lookup failed for {number}: {exc}", file=sys.stderr)
        return prior_source or GENERIC
    by_kind = {}
    for key in sorted(docs):
        name = key.rsplit("/", 1)[-1]
        if not re.search(r"\.pdf$", name, re.I):
            continue
        by_kind.setdefault(name.split("-", 1)[0], key)
    order = ["INCLA", "INOA"] if closed else ["INOA"]
    for kind in order:
        if kind in by_kind:
            return BASE + by_kind[kind]
    return prior_source or GENERIC


def main():
    check = "--check" in sys.argv
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    index, changed, unresolved = OdiIndex(), 0, []
    for item in payload["investigations"]:
        new = resolve(item["id"], item.get("status") == "Closed", item.get("source"), index)
        if new == GENERIC or not new:
            unresolved.append(item["id"])
        if new != item.get("source"):
            changed += 1
            if not check:
                item["source"] = new
    if check:
        if unresolved:
            raise SystemExit(f"Generic NHTSA link remains for: {', '.join(unresolved)}")
        print(f"Every investigation links to its official ODI document ({len(payload['investigations'])} checked)")
        return
    if changed:
        DATA.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Updated {changed} investigation links; unresolved: {unresolved or 'none'}")


if __name__ == "__main__":
    main()
