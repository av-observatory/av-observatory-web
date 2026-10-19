#!/usr/bin/env python3
"""Automatically watch European news for new AV crash reports (no AI, no API keys).

Searches Google News RSS in several languages, keeps headlines that mention both an
automated-driving term and a crash term, drops anything already cited by the tracker,
and stores the rest in ``media_watch``. These are UNVERIFIED headlines: they are shown
separately on the page and never counted as crashes. Promotion into ``incidents``
stays an editorial decision, so verified counts cannot be polluted by scraping.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "public/data/europe_crash_tracker.json"
UA = {"User-Agent": "Mozilla/5.0 (AVObservatory/1.0 public research)"}
KEEP, MAX_AGE_DAYS = 120, 120
AV = re.compile(r"waymo|wayve|zoox|cruise|baidu|apollo go|weride|pony\.ai|moia|holon|easymile|navya|ohmio|oxa|"
                r"robotaxi|robo-?taxi|driverless|self-driving|autonomous|autonom|selbstfahr|fahrerlos|"
                r"sans conducteur|autonome|zelfrijdend|autónomo|conducción autónoma|guida autonoma|självkörande|"
                r"autonomiczn|autonomní|ajoneuvo", re.I)
CRASH = re.compile(r"crash|collision|collid|accident|hit |struck|injur|killed|fatal|unfall|kollision|verunglück|"
                   r"accroch|accident|collision|ongeval|botsing|aanrijding|choque|accidente|incidente|scontro|"
                   r"olycka|kolli|wypadek|nehoda", re.I)
EUROPE = re.compile(r"europe|\bUK\b|britain|british|england|scotland|wales|london|oxford|milton keynes|sunderland|"
                    r"german|berlin|munich|hamburg|france|french|paris|lyon|spain|madrid|barcelona|ital(?:y|ian)|rome|milan|"
                    r"nether|amsterdam|rotterdam|belgi|brussels|swed|gothenburg|stockholm|norw|oslo|denmark|copenhagen|"
                    r"finland|helsinki|switzerland|swiss|zurich|geneva|sion|austria|vienna|poland|warsaw|czech|prague|"
                    r"portugal|lisbon|ireland|dublin|luxembourg|estonia|tallinn|lithuania|latvia|norway|hungary|budapest|"
                    r"greece|athens|croatia|zagreb|serbia|turkey|istanbul|monheim|\bEU\b", re.I)
NOT_EUROPE = re.compile(r"california|texas|arizona|austin|phoenix|san francisco|los angeles|florida|nhtsa|\bU\.?S\.?\b|china|beijing|"
                        r"shenzhen|wuhan|japan|korea|india|singapore|dubai|abu dhabi|houston|dallas|miami|los [aá]ngeles|pakist|uruguay|"
                        r"m[eé]xico|argentina|chile|colombia|brasil|brazil|atlanta|nashville|washington|new york", re.I)
QUERIES = [  # (query, hl, gl, ceid)
    ("robotaxi crash Europe", "en-GB", "GB", "GB:en"),
    ("self-driving car collision UK", "en-GB", "GB", "GB:en"),
    ("driverless shuttle accident Europe", "en-GB", "GB", "GB:en"),
    ("Waymo London accident", "en-GB", "GB", "GB:en"),
    ("Wayve crash", "en-GB", "GB", "GB:en"),
    ("autonomous bus collision", "en-IE", "IE", "IE:en"),
    ("autonomer Bus Unfall", "de", "DE", "DE:de"),
    ("selbstfahrendes Auto Unfall Robotaxi", "de", "DE", "DE:de"),
    ("navette autonome accident", "fr", "FR", "FR:fr"),
    ("véhicule autonome collision", "fr", "FR", "FR:fr"),
    ("zelfrijdende bus ongeluk", "nl", "NL", "NL:nl"),
    ("vehículo autónomo accidente", "es", "ES", "ES:es"),
    ("guida autonoma incidente navetta", "it", "IT", "IT:it"),
    ("självkörande buss olycka", "sv", "SE", "SE:sv"),
    ("autonomiczny autobus wypadek", "pl", "PL", "PL:pl"),
    ("Baidu Apollo Go Europe accident", "en-GB", "GB", "GB:en"),
]


def norm(text):
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def fetch(query, hl, gl, ceid):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": query + " when:" + os.environ.get("EU_WATCH_WINDOW", "14d"), "hl": hl, "gl": gl, "ceid": ceid})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as resp:
        return ET.fromstring(resp.read())


def main():
    data = json.loads(PATH.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)
    known_urls = {u for i in data["incidents"] for u in i.get("sources", [])} | {u for l in data["unresolved_leads"] for u in l.get("sources", [])}
    watch = data.get("media_watch", [])
    seen = {w["url"] for w in watch} | known_urls
    seen_titles = {norm(w["title"]) for w in watch}
    ok = failed = added = 0
    for q in QUERIES:
        try:
            root = fetch(*q)
            ok += 1
        except Exception as exc:
            failed += 1
            print(f"WARN: {q[0]!r} failed: {exc.__class__.__name__}", file=sys.stderr)
            continue
        for item in root.iter("item"):
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            src = item.find("source")
            publisher = (src.text or "").strip() if src is not None else ""
            if publisher and title.endswith(" - " + publisher):
                title = title[: -len(publisher) - 3].strip()
            try:
                when = parsedate_to_datetime(item.findtext("pubDate")).astimezone(timezone.utc)
            except Exception:
                continue
            if not link or not AV.search(title) or not CRASH.search(title) or now - when > timedelta(days=MAX_AGE_DAYS):
                continue
            if q[1][:2] in ("en", "es") and not EUROPE.search(title):
                continue
            if NOT_EUROPE.search(title) and not EUROPE.search(title):
                continue
            if link in seen or norm(title) in seen_titles:
                continue
            seen.add(link); seen_titles.add(norm(title))
            watch.append({"title": title, "publisher": publisher, "published": when.date().isoformat(),
                          "url": link, "query_language": q[1], "first_seen": now.date().isoformat(),
                          "status": "unverified media headline; not counted as a crash"})
            added += 1
    if ok == 0:
        raise SystemExit("every news query failed; leaving the tracker unchanged")
    cutoff = (now - timedelta(days=MAX_AGE_DAYS)).date().isoformat()
    watch = sorted((w for w in watch if w["published"] >= cutoff), key=lambda w: (w["published"], w["url"]), reverse=True)[:KEEP]
    data["media_watch"] = watch
    data["media_watch_checked_at"] = now.date().isoformat()
    PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"queries ok={ok} failed={failed}; new headlines={added}; stored={len(watch)}")


if __name__ == "__main__":
    main()
