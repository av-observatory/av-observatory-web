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


home = get("/", quiet=True)
m = re.search(r'\{0:"6d870a77".*?\}\[d\]', home)
ids = dict(re.findall(r'(\d+):"([0-9a-f]{8})"', m.group(0))) if m else {}
print("lazy chunks", ids)
apis = {}
for k, h in ids.items():
    t = get(f"/static/js/{k}.{h}.chunk.js", quiet=True)
    found = sorted(set(re.findall(r'apiUrl,"(/[^"]+)"', t)) | set(re.findall(r'["\'`](/api/[A-Za-z0-9_/.\-]+)', t)))
    print(f"chunk {k} len={len(t)}", found)
    for f in found:
        apis[f] = k
    for mm in re.finditer(r'apiUrl,"(/[^"]+)"\)?(?:\.concat\([^)]*\))?[^;]{0,300}', t):
        print("   CALL:", mm.group(0)[:400])
print("=== live tries")
for p in ["/api/Search/GetSearchMaster", "/api/Search/GetWhatsNew"]:
    get(p, 2500)
