#!/usr/bin/env python3
import sys, json, os
sys.path.insert(0, os.path.dirname(__file__))
from bill_enumerators import http
if "--probe" in sys.argv:
    for u in ["https://malegislature.gov/api/GeneralCourts/194/Documents", "https://malegislature.gov/api/Bills/194/H1",
              "https://malegislature.gov/api/Bills/194/H1/RollCalls", "https://malegislature.gov/api/Legislators?generalCourtNumber=194",
              "https://malegislature.gov/api/GeneralCourts/194/Legislators", "https://malegislature.gov/api/Committees",
              "https://malegislature.gov/api/Bills/194/H1/Actions", "https://malegislature.gov/api/Bills/194/H1/Cosponsors",
              "https://malegislature.gov/Bills/194/H1/RollCall", "https://malegislature.gov/api/Bills/194/H1/BillHistory",
              "https://malegislature.gov/Bills/194/H1.json"]:
        try:
            b = http(u, timeout=120).decode("utf-8", "replace")
            print("OK", u, len(b)); print(b[:2500].replace("\n", " ")); print()
        except Exception as e:
            print("FAIL", u, repr(e)[:200])
