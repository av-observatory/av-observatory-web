#!/usr/bin/env python3
import urllib.request, json, re
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Accept": "application/json, text/plain, */*"}
B = "https://lims.dccouncil.gov"


def get(path, n=3000, full=False, quiet=False):
    try:
        r = urllib.request.urlopen(urllib.request.Request(B + path if path.startswith("/") else path, headers=H), timeout=60)
        d = r.read().decode("utf-8", "replace")
        if not quiet:
            print(f"### {path} -> {r.status} {r.headers.get('content-type')} len={len(d)}\n{d if full else d[:n]}\n", flush=True)
        return d
    except Exception as e:
        body = getattr(e, "read", lambda: b"")()[:200]
        print(f"### {path} -> ERR {e} {body}\n", flush=True)
    return ""


home = get("/", quiet=True)
scripts = re.findall(r'src="([^"]+\.js[^"]*)"', home)
print("scripts", scripts)
for s in scripts:
    if "sharethis" in s or "google" in s:
        continue
    js = get(s if s.startswith("http") else s, quiet=True)
    print(f"=== {s} len={len(js)}")
    for m in sorted(set(re.findall(r"""["'`]([^"'`]{0,120}(?:/api/|api/v|Token|token|GetLegislationMetadata|/search/)[^"'`]{0,120})["'`]""", js)))[:120]:
        print("  ", m)
    for m in re.finditer(r"(?:Authorization|Bearer|access_token|getToken|GetToken)", js):
        a = max(0, m.start() - 150)
        print("  CTX:", js[a:m.end() + 250].replace("\n", " "))
        break
