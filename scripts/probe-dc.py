#!/usr/bin/env python3
import urllib.request
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Accept": "application/json, text/plain, */*"}
B = "https://lims.dccouncil.gov"


def get(path, n=1800):
    try:
        r = urllib.request.urlopen(urllib.request.Request(B + path, headers=H), timeout=60)
        d = r.read().decode("utf-8", "replace")
        print(f"### {path} -> {r.status} {r.headers.get('content-type')} len={len(d)}\n{d[:n]}\n", flush=True)
    except Exception as e:
        body = getattr(e, "read", lambda: b"")()[:200]
        print(f"### {path} -> ERR {e} {body}\n", flush=True)


for p in ["/api/search/GetLegislationMetadata/B26-0001", "/api/v1/Legislation/GetPublicData/B26-0001", "/api/v2/legislation/GetPublicData/B26-0001",
          "/api/v1/Legislation/GetPublicData/PR26-0001", "/api/v2/legislation/GetPublicData/PR26-0001",
          "/api/v1/Legislation/GetPublicData/B26-0100",
          "/api/v1/Councilmembers/GetPublicData", "/api/v2/Councilmembers/GetPublicData", "/api/v1/Councilmembers", "/api/v2/councilmembers",
          "/api/v1/Committees/GetPublicData", "/api/v2/committees/GetPublicData",
          "/api/v1/Legislation/GetVotes/B26-0001", "/api/v2/Legislation/GetVotes/B26-0001",
          "/api/v1/Legislation/GetRollCall/B26-0001", "/swagger/index.html", "/swagger/v1/swagger.json", "/swagger/v2/swagger.json",
          "/api/swagger.json", "/Help", "/api/help", "/Legislation/B26-0001"]:
    get(p)
