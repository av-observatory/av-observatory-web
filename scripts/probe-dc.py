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
i = js.find("getAxioInstance:function")
print("=== axios instance module:\n", js[max(0, i - 300):i + 1800])
print("=== all api paths")
for m in sorted(set(re.findall(r'apiUrl,"(/[^"]+)"', js))):
    print("  ", m)
for m in re.finditer(r'(?i)authori[sz]|bearer|\bkey\b.{0,40}api|GetToken|accessToken', js):
    a = max(0, m.start() - 200)
    print("  AUTHCTX:", js[a:m.end() + 300].replace("\n", " "))
print("=== chunk map")
home = get("/", quiet=True)
for s in re.findall(r'src="(/static/js/[^"]+)"', home):
    t = get(s, quiet=True)
    print(s, len(t))
    for m in sorted(set(re.findall(r'apiUrl,"(/[^"]+)"', t))):
        print("   api:", m)
    for m in re.finditer(r'(?i)GetToken|accessToken|Authorization["\']?\s*[:=]', t):
        a = max(0, m.start() - 200)
        print("   AUTH:", t[a:m.end() + 300].replace("\n", " "))
        break
k = home.find("static/js/")
print("HOME-INLINE", home[max(0, home.find("<script>", 2000)):][:200])
for m in re.finditer(r'static/js/"\s*\+[^;]{0,400}', home):
    print("HOMEMAP", m.group(0)[:500])
for m in re.finditer(r'"static/js/"\s*\+[^;]{0,300}', js):
    print("CHUNKMAP", m.group(0)[:400])
