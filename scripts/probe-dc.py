#!/usr/bin/env python3
import urllib.request, json, re
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Accept": "application/json, text/plain, */*"}
B = "https://lims.dccouncil.gov"


def get(path, n=1500, full=False, quiet=False, headers=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(B + path if path.startswith("/") else path, headers=headers or H), timeout=60)
        d = r.read().decode("utf-8", "replace")
        if not quiet:
            print(f"### {path} -> {r.status} {r.headers.get('content-type')} len={len(d)}\n{d if full else d[:n]}\n", flush=True)
        return d
    except Exception as e:
        body = getattr(e, "read", lambda: b"")()[:300]
        print(f"### {path} -> ERR {e} {body}\n", flush=True)
    return ""


js = get("/static/js/main.c11efed6.chunk.js", quiet=True)
print("=== main chunk api contexts")
seen = 0
for m in re.finditer(r"api|fetch\(|axios|\.get\(", js):
    a = max(0, m.start() - 100)
    print("  CTX:", js[a:m.end() + 200].replace("\n", " "))
    seen += 1
    if seen > 40:
        break
print("=== chunk refs")
print(sorted(set(re.findall(r"static/js/[\w.]+\.js", js)))[:20])
print("=== direct tries")
for p in ["/api/search/GetLegislationMetadata/B26-0100", "/api/search/GetLegislationMetadata/B25-0100", "/api/search/GetLegislationMetadata/PR26-0100",
          "/api/legislation/B26-0100", "/api/search/Legislation/B26-0100", "/api/Search/GetLegislation/B26-0100",
          "/api/v1/Legislation/B26-0100", "/api/Legislation/GetPublicData/B26-0100"]:
    get(p, 800)
