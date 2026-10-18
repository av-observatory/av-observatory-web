#!/usr/bin/env python3
import sys, json, os, re, urllib.request, ssl, time
from concurrent.futures import ThreadPoolExecutor
UA = "AVObservatory/1.0 (+https://av-observatory.com/; public-records research)"


def get(u, timeout=60):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json, text/html"}), timeout=timeout)
    return r.read().decode("utf-8", "replace")


if "--probe" in sys.argv:
    B = "https://malegislature.gov/api/GeneralCourts/194"
    print(get(B + "/Documents/H4000/DocumentHistoryActions")[:2500], flush=True)
    docs = json.loads(get(B + "/Documents", 180))
    print("ndocs", len(docs), flush=True)
    from collections import Counter
    print(Counter(re.match(r"[A-Z]+", d["BillNumber"]).group(0) for d in docs if d.get("BillNumber")), flush=True)
    nums = [d["BillNumber"] for d in docs if d.get("BillNumber")]
    # prioritise low-numbered and a spread
    sample = nums[:1200:1]

    def one(n):
        try:
            return n, json.loads(get(f"{B}/Documents/{n}"))
        except Exception as e:
            return n, None
    shown = {"rc": 0, "pin": 0, "cr": 0, "txt": 0}
    keys = Counter()
    with ThreadPoolExecutor(4) as ex:
        for n, d in ex.map(one, sample):
            if not d:
                continue
            keys.update(d.keys())
            if d.get("RollCalls") and shown["rc"] < 2:
                shown["rc"] += 1; print("ROLLCALLS", n, json.dumps(d["RollCalls"])[:2500], flush=True)
            if d.get("Pinslip") and shown["pin"] < 3:
                shown["pin"] += 1; print("PINSLIP", n, json.dumps(d["Pinslip"])[:600], flush=True)
            if d.get("CommitteeRecommendations") and shown["cr"] < 1:
                shown["cr"] += 1; print("CR", n, json.dumps(d["CommitteeRecommendations"])[:1200], flush=True)
            if d.get("DocumentText") and shown["txt"] < 1:
                shown["txt"] += 1; print("TXT", n, json.dumps(d["DocumentText"])[:300], flush=True)
    print("keys", dict(keys), flush=True)
    # known enacted: search history of some bills for "Chapter"
    for n in ("H4000", "S2", "H4144", "H4"):
        try:
            h = get(f"{B}/Documents/{n}/DocumentHistoryActions")
            print("HIST", n, len(h), h[-900:], flush=True)
        except Exception as e:
            print("HISTFAIL", n, repr(e)[:100], flush=True)
