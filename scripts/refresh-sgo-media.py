#!/usr/bin/env python3
"""Find news coverage for each serious/fatal ADS crash in the SGO list (no AI, no keys).

For every crash with a Serious or Fatal severity the canonical SGO crash file reports, search
Google News RSS in the window around the incident month for the operator and city, keep
headlines that name the city (or operator) and describe a crash, and store up to three per
crash in public/data/sgo_serious_media_links.json. Matches are automatic and unverified;
curated narratives in sgo_media_context.json always take precedence on the page.
"""
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "public/data"
OUT = DATA / "sgo_serious_media_links.json"
UA = {"User-Agent": "Mozilla/5.0 (AVObservatory/1.0 public research)"}
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
CRASH = re.compile(r"crash|collision|collid|killed|dies|died|fatal|injur|hit|struck|accident|hospital|pedestrian|cyclist|motorcycl", re.I)
MAX_QUERIES, KEEP, RECHECK_DAYS = 40, 3, 7


def operators(entities):
    names = []
    for e in entities.split(";"):
        name = re.sub(r",?\s*(LLC|Inc\.?|Corp\.?|Corporation|Alternative Services)\b.*$", "", e.strip(), flags=re.I).strip()
        if name and name not in names and name not in ("General Motors", "Transdev"):
            names.append(name)
    return names


def month_window(raw):
    m = re.fullmatch(r"([A-Z]{3})-(\d{4})", raw.strip().upper())
    if not m or m.group(1) not in MONTHS:
        return None
    start = date(int(m.group(2)), MONTHS.index(m.group(1)) + 1, 1)
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return start - timedelta(days=3), end + timedelta(days=45)


def search(query, after, before):
    q = f"{query} after:{after.isoformat()} before:{before.isoformat()}"
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "en-US", "gl": "US", "ceid": "US:en"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as resp:
        return ET.fromstring(resp.read())


def find(crash, ops, window):
    city = crash["city"].strip()
    found = {}
    for op in ops or [""]:
        try:
            root = search(f'{op} {city} crash'.strip(), *window)
        except Exception as exc:
            print(f"WARN: search failed for {crash['incident_id']}: {exc.__class__.__name__}", file=sys.stderr)
            return None
        for item in root.iter("item"):
            title = (item.findtext("title") or "").strip()
            src = item.find("source")
            publisher = (src.text or "").strip() if src is not None else ""
            if publisher and title.endswith(" - " + publisher):
                title = title[: -len(publisher) - 3].strip()
            link = (item.findtext("link") or "").strip()
            try:
                when = parsedate_to_datetime(item.findtext("pubDate")).astimezone(timezone.utc).date()
            except Exception:
                continue
            if not (link and CRASH.search(title) and window[0] <= when <= window[1]):
                continue
            names_city = city and city.lower() in title.lower()
            names_op = any(o.lower() in title.lower() for o in ops)
            if not (names_city and (names_op or not ops)) and not (names_city and names_op):
                continue
            found.setdefault((publisher, title.lower()), {"title": title, "publisher": publisher, "published": when.isoformat(), "url": link})
        time.sleep(1)
    return sorted(found.values(), key=lambda x: x["published"])[:KEEP]


def main():
    crashes = [r for r in csv.DictReader(open(DATA / "sgo_crashes.csv", encoding="utf-8"))
               if r["automation_system_engaged"] == "ADS" and r["severity"].startswith(("Serious", "Fatal"))]
    store = json.loads(OUT.read_text()) if OUT.exists() else {"crashes": {}}
    today = datetime.now(timezone.utc).date()
    queries = ok = 0
    for crash in sorted(crashes, key=lambda c: c["incident_date"], reverse=True):
        key = crash["incident_id"]
        prior = store["crashes"].get(key)
        if prior and (today - date.fromisoformat(prior["checked"])).days < RECHECK_DAYS:
            continue
        if prior and prior["media"] and (today - date.fromisoformat(prior["checked"])).days < 60:
            continue  # coverage already found; only keep rechecking empty, recent cases
        window = month_window(crash["incident_date"])
        if not window or queries >= MAX_QUERIES:
            continue
        ops = operators(crash["reporting_entities"])
        queries += max(1, len(ops))
        media = find(crash, ops, window)
        if media is None:
            continue
        ok += 1
        store["crashes"][key] = {"report_ids": crash["report_ids"], "checked": today.isoformat(), "media": media}
    live = {c["incident_id"] for c in crashes}
    store["crashes"] = {k: v for k, v in store["crashes"].items() if k in live}
    store["checked_at"] = today.isoformat()
    store["note"] = "Automatic news matches (operator + city + crash terms within the incident window). Unverified; not evidence of fault."
    OUT.write_text(json.dumps(store, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"serious crashes={len(crashes)}; searched={ok}; with media={sum(1 for v in store['crashes'].values() if v['media'])}")


if __name__ == "__main__":
    main()
