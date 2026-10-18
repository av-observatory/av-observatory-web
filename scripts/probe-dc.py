#!/usr/bin/env python3
import urllib.request, json, re
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Accept": "application/json, text/plain, */*"}
B = "https://lims.dccouncil.gov"


def get(path, data=None):
    hdrs = dict(H)
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        hdrs["Content-Type"] = "application/json"
    try:
        r = urllib.request.urlopen(urllib.request.Request(B + path, headers=hdrs, data=body), timeout=90)
        return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), f"ERR {e} " + getattr(e, "read", lambda: b"")()[:200].decode("utf-8", "replace")


def show(path, n=1500, data=None):
    st, d = get(path, data)
    print(f"### {'POST' if data is not None else 'GET'} {path} -> {st} len={len(d)}\n{d[:n]}\n", flush=True)
    return d


# missing numbers
show("/api/Search/GetLegislationDetails/B26-9999", 300)
show("/api/Search/GetLegislationDetails/PR26-9999", 300)
# search results
master = json.loads(get("/api/Search/GetSearchMaster")[1])
master.pop("masterData", None)
master["councilPeriodId"]["ids"] = ["26"]
master["pagination"] = {"pageSize": 5, "pageIndex": 0, "totalCount": 0}
d = show("/api/Search/SearchResult", 3500, master)
# top-level keys for a few bills
for num in ["B26-0001", "B26-0003", "B26-0010", "B26-0050", "B26-0150", "PR26-0002", "PR26-0100"]:
    st, t = get(f"/api/Search/GetLegislationDetails/{num}")
    try:
        j = json.loads(t)
    except Exception:
        print(num, st, t[:100])
        continue
    print("BILL", num, {k: (v if not isinstance(v, (list, dict)) else f"<{type(v).__name__} {len(v)}>") for k, v in j.items()})
    print("   HIST types", [(h["type"], h["date"]) for h in j.get("legislationHistory", [])])
# full dump of two interesting
for num in ["B26-0100", "B26-0010"]:
    st, t = get(f"/api/Search/GetLegislationDetails/{num}")
    print(f"FULL {num}\n{t[3000:9000]}\n")
