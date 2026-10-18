#!/usr/bin/env python3
import urllib.request, json
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Accept": "application/json, text/plain, */*"}
B = "https://lims.dccouncil.gov"


def get(path, n=3000, full=False):
    try:
        r = urllib.request.urlopen(urllib.request.Request(B + path, headers=H), timeout=60)
        d = r.read().decode("utf-8", "replace")
        print(f"### {path} -> {r.status} {r.headers.get('content-type')} len={len(d)}\n{d if full else d[:n]}\n", flush=True)
        return d
    except Exception as e:
        body = getattr(e, "read", lambda: b"")()[:200]
        print(f"### {path} -> ERR {e} {body}\n", flush=True)
    return ""


s = get("/api-docs/v2.0/swagger.json", full=True)
try:
    d = json.loads(s)
    print("=== PATHS")
    for p, v in d["paths"].items():
        print(p, "|", v["get"]["summary"][:160].replace("\r\n", " "))
    print("=== DEFS")
    for k, v in d["definitions"].items():
        print(k, {a: b.get("type") or b.get("$ref", "").split("/")[-1] for a, b in v.get("properties", {}).items()})
except Exception as e:
    print("swagger parse failed", e)
get("/api/v2/PublicData/CouncilPeriods", 3000)
get("/api/v2/PublicData/Members/26", 4000)
get("/api/v2/PublicData/Committees/26", 1500)
get("/api/v2/PublicData/LegislationDetails/B26-0001", 12000)
get("/api/v2/PublicData/LegislationDetails/PR26-0001", 6000)
