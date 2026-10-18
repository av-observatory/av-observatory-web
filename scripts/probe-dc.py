#!/usr/bin/env python3
import urllib.request, json, re
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Accept": "application/json, text/plain, */*"}
B = "https://lims.dccouncil.gov"


def get(path, n=1500, full=False, quiet=False, data=None):
    try:
        hdrs = dict(H)
        body = None
        if data is not None:
            body = json.dumps(data).encode()
            hdrs["Content-Type"] = "application/json"
        r = urllib.request.urlopen(urllib.request.Request(B + path, headers=hdrs, data=body), timeout=90)
        d = r.read().decode("utf-8", "replace")
        if not quiet:
            print(f"### {'POST' if body else 'GET'} {path} -> {r.status} {r.headers.get('content-type')} len={len(d)}\n{d if full else d[:n]}\n", flush=True)
        return d
    except Exception as e:
        eb = getattr(e, "read", lambda: b"")()[:300]
        print(f"### {path} -> ERR {e} {eb}\n", flush=True)
    return ""


master = json.loads(get("/api/Search/GetSearchMaster", quiet=True))
md = master["masterData"]
for k, v in md.items():
    print("MASTER", k, json.dumps(v)[:1200])
get("/api/Search/GetLegislationDetails/B26-0100", 9000)
get("/api/Search/GetLegislationDetails/PR26-0001", 5000)
get("/api/Search/GetIntroducersByCouncilPeriod/26", 1500)
get("/api/Reports/GetCouncilMembersByCouncilPeriod/26", 2500)
# search by period
cp = [x for x in md.get("councilPeriod", []) if "26" in json.dumps(x)]
print("CP26", cp)
cid = None
for x in md.get("councilPeriod", []):
    if "2025" in json.dumps(x) or "26" in json.dumps(x):
        cid = x
print("cid", cid)
# voting search code
home = urllib.request.urlopen(urllib.request.Request(B + "/static/js/9.d5493dac.chunk.js", headers=H), timeout=60).read().decode()
for m in re.finditer(r"getCouncilMemberVotingSearch:function", home):
    print("VOTECODE", home[m.start():m.start() + 900])
for m in re.finditer(r"getSearchViewModel", home):
    print("SVM", home[m.start():m.start() + 200])
    break
for m in re.finditer(r"SearchResult\"\)", home):
    print("SRCODE", home[max(0, m.start() - 900):m.start() + 700])
    break
