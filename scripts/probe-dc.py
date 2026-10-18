#!/usr/bin/env python3
import urllib.request, re
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Accept": "application/json, text/plain, */*"}
B = "https://lims.dccouncil.gov"


def get(path, n=1500, full=False):
    try:
        r = urllib.request.urlopen(urllib.request.Request(B + path, headers=H), timeout=40)
        d = r.read().decode("utf-8", "replace")
        ct = r.headers.get("content-type")
        if "text/html" in (ct or "") and "<title>DC Legislation Information" in d:
            print(f"### {path} -> SPA shell\n", flush=True)
            return d
        print(f"### {path} -> {r.status} {ct} len={len(d)}\n{d if full else d[:n]}\n", flush=True)
        return d
    except Exception as e:
        body = getattr(e, "read", lambda: b"")()[:200]
        print(f"### {path} -> ERR {e} {body}\n", flush=True)
    return ""


h = get("/api/help", full=True)
cands = set(re.findall(r"""['"]([^'"]*(?:swagger|api-docs)[^'"]*)['"]""", h))
print("candidates", cands)
for p in ["/swagger/docs/v1", "/swagger/docs/v2", "/swagger/ui/index", "/api/swagger/docs/v1", "/api/swagger/docs/v2", "/api/v1/swagger.json", "/api/v2/swagger.json", "/api/swagger/v1/swagger.json"]:
    get(p, 3000)
for p in cands:
    if p.startswith("/"):
        get(p, 4000)
