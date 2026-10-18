#!/usr/bin/env python3
"""Attach member-level House roll-call votes to data-state/states/MA/votes.json.gz.

House roll calls ("YEA and NAY No. N") are published only as PDFs on malegislature.gov. This script:
  discover : probe the site for the roll-call listing / PDF URL pattern and print what it finds (log only)
  run      : resolve a PDF per referenced roll call, pdftotext (OCR fallback), parse member votes,
             verify against the history-text tally, write `members` into votes.json.gz
Only votes.json.gz and house_votes_report.md under data-state/states/MA are written. Run in GitHub Actions.
"""
import argparse, gzip, json, re, subprocess, sys, tempfile, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data-state/states/MA"
SITE = "https://malegislature.gov"
UA = "AVObservatory/1.0 (+https://av-observatory.com/; public-records research)"
NO_RE = re.compile(r"YEA\s+and\s+NAY\s+No\.?\s*(\d+)", re.I)


def fetch(url, tries=4, timeout=90, binary=False):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                return r.status, r.headers.get("Content-Type", ""), (b if binary else b.decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            if e.code in (400, 403, 404):
                return e.code, "", None
            time.sleep(max(float(e.headers.get("Retry-After") or 0) if e.code == 429 else 0, 2 ** i))
        except Exception:
            time.sleep(2 ** i)
    return 0, "", None


def hrefs(html):
    return sorted(set(re.findall(r"""(?:href|src)=["']([^"']+)["']""", html or "")))


def discover():
    for u in [f"{SITE}/RollCall/House/194", f"{SITE}/RollCall", f"{SITE}/RollCall/House", f"{SITE}/Journal/House/194",
              f"{SITE}/Bills/194/H2024", f"{SITE}/Bills/194/H4000", f"{SITE}/Bills/194/H4"]:
        st, ct, body = fetch(u)
        print(f"\n=== {u} -> {st} {ct} len={len(body or '')}", flush=True)
        if body:
            hs = [h for h in hrefs(body) if re.search(r"roll|pdf|yea|journal|vote", h, re.I)]
            print("links:", json.dumps(hs[:80], indent=0))
            if "RollCall" in u:
                print(re.sub(r"\s+", " ", re.sub(r"<script.*?</script>|<style.*?</style>", "", body, flags=re.S))[:3000])
    for u in [f"{SITE}/api/GeneralCourts/194/Documents/H2024", f"{SITE}/api/GeneralCourts/194/Branches/House/RollCalls",
              f"{SITE}/api/GeneralCourts/194/Branches/House/RollCalls/20", f"{SITE}/api/GeneralCourts/194/Branches/House"]:
        st, ct, body = fetch(u, tries=2)
        print(f"\n=== {u} -> {st} {ct} len={len(body or '')}", flush=True)
        if body:
            m = re.search(r'"RollCalls".{0,600}', body, re.S)
            print(m.group(0) if m else body[:600])
    for n in (20, 24):
        for pat in ["/Content/Documents/RollCall/House/194/{n}.pdf", "/Content/Documents/RollCall/House/194/{n:03d}.pdf",
                    "/Content/Documents/RollCall/House/194/RC{n}.pdf", "/Content/Documents/RollCall/House/194/RC{n:03d}.pdf",
                    "/Content/Documents/RollCall/House/194/RC{n:04d}.pdf", "/RollCall/House/194/{n}", "/RollCall/House/194/{n}.pdf",
                    "/Journal/RollCall/House/194/{n}", "/Content/Documents/Journal/RollCalls/House/194/{n}.pdf",
                    "/Content/Documents/RollCalls/House/194/{n}.pdf", "/Content/Documents/House/RollCalls/194/{n}.pdf",
                    "/Content/Documents/RollCall/194/House/{n}.pdf"]:
            u = SITE + pat.format(n=n)
            st, ct, body = fetch(u, tries=1, timeout=30, binary=True)
            print(f"guess {u} -> {st} {ct} {len(body or b'')}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["discover", "run"])
    a = ap.parse_args()
    if a.mode == "discover":
        discover()
        return 0
    print("run mode not implemented yet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
