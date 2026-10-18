#!/usr/bin/env python3
import sys, json, os, urllib.request, ssl, time
UA = "AVObservatory/1.0 (+https://av-observatory.com/; public-records research)"
if "--probe" in sys.argv:
    for u in ["https://malegislature.gov/api/Bills/194/H1", "https://malegislature.gov/api/Bills/194/H1/RollCalls",
              "https://malegislature.gov/api/Legislators?generalCourtNumber=194",
              "https://malegislature.gov/api/GeneralCourts/194/Legislators", "https://malegislature.gov/api/Committees",
              "https://malegislature.gov/api/GeneralCourts/194",
              "https://malegislature.gov/api/GeneralCourts/194/Documents",
              "https://malegislature.gov/Bills/194/H1", "https://malegislature.gov/Bills/194/H1/RollCall",
              "https://malegislature.gov/api/Bills/194/H1/Cosponsors", "https://malegislature.gov/api/Legislators/ABC0"]:
        t = time.time()
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json"}), timeout=40)
            b = r.read().decode("utf-8", "replace")
            print("OK", u, r.status, len(b), round(time.time() - t, 1), flush=True); print(b[:2000].replace("\n", " "), flush=True); print(flush=True)
        except Exception as e:
            print("FAIL", u, repr(e)[:200], round(time.time() - t, 1), flush=True)
