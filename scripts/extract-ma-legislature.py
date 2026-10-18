#!/usr/bin/env python3
import sys, json, os, re, urllib.request, ssl, time
UA = "AVObservatory/1.0 (+https://av-observatory.com/; public-records research)"


def get(u, timeout=40):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json, text/html"}), timeout=timeout)
    return r.read().decode("utf-8", "replace")


if "--probe" in sys.argv:
    B = "https://malegislature.gov"
    for u, n in [(B + "/api/GeneralCourts/194/Documents/H1", 3000), (B + "/api/GeneralCourts/194/Documents/H4000", 6000),
                 (B + "/api/GeneralCourts/194/LegislativeMembers", 1500), (B + "/api/GeneralCourts/194/LegislativeMembers/JCD1", 2000),
                 (B + "/api/GeneralCourts/194/Committees/H53", 1200), (B + "/api/GeneralCourts/194/Documents/H4000/RollCalls", 1500),
                 (B + "/api/GeneralCourts/194/Documents/H4000/History", 1500), (B + "/api/GeneralCourts/194/Documents/H4000/Actions", 1500),
                 (B + "/api/Bills/194/H4000", 500)]:
        t = time.time()
        try:
            b = get(u)
            print("OK", u, len(b), round(time.time() - t, 1), flush=True); print(b[:n].replace("\n", " "), flush=True); print(flush=True)
        except Exception as e:
            print("FAIL", u, repr(e)[:200], flush=True)
    for num in ("H4000", "H1"):
        try:
            h = get(B + f"/Bills/194/{num}")
            print("HTML", num, len(h), flush=True)
            for m in re.finditer(r"(?i)(rollcall|roll call|pinslip|Bill History|Votes?)", h):
                pass
            for kw in ("RollCall", "pinslip", "Pinslip", "history", "Chapter"):
                for m in list(re.finditer(kw, h))[:4]:
                    print("  ", kw, "::", re.sub(r"\s+", " ", h[max(0, m.start() - 200):m.start() + 300]), flush=True)
            # show the text body stripped
            body = re.sub(r"(?s)<(script|style).*?</\1>", " ", h)
            body = re.sub(r"<[^>]+>", " ", body)
            body = re.sub(r"\s+", " ", body)
            print("  TEXT:", body[:4000], flush=True)
        except Exception as e:
            print("FAIL html", num, repr(e)[:200], flush=True)
