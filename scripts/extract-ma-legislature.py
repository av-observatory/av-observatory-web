#!/usr/bin/env python3
import sys, json, os, re, urllib.request, ssl, time

UA = "AVObservatory/1.0 (+https://av-observatory.com/; public-records research)"


def get(u, timeout=60):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json, text/html"}), timeout=timeout)
    return r.read().decode("utf-8", "replace")


if "--probe" in sys.argv:
    B = "https://malegislature.gov/api/GeneralCourts/194"
    for u, n in [("/Branches/Senate/RollCalls/119", 3500), ("/Branches/House/RollCalls/30", 3500), ("/Branches/House/RollCalls", 1200),
                 ("/Branches/Senate/RollCalls", 1200), ("/Branches/House", 800), ("/Branches", 600), ("/Documents/S1948", 2500),
                 ("/LegislativeMembers/GOV7", 800), ("/LegislativeMembers/DAF0", 600)]:
        try:
            b = get(B + u)
            print("OK", u, len(b), flush=True); print(b[:n].replace("\n", " "), flush=True); print(flush=True)
        except Exception as e:
            print("FAIL", u, repr(e)[:200], flush=True)
    # does an enacted law exist? search last-action of some docs for 'Chapter'
    try:
        h = get("https://malegislature.gov/Laws/SessionLaws/Acts/2025/Chapter17")
        t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h))
        i = t.find("Chapter 17")
        print("SESSIONLAW", t[i:i + 600], flush=True)
    except Exception as e:
        print("SLFAIL", repr(e)[:150], flush=True)
