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
    global fetch
    _f = fetch
    fetch = lambda u, tries=1, timeout=25, binary=False: _f(u, 1, 25, binary)
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


import unicodedata

PDF_URL = SITE + "/RollCall/194/HouseRollCall{n}.pdf"
HDR = re.compile(r"No\.\s*(\d+)\s+(\d+)\s+YEAS\s+(\d+)\s+NAYS\s+(\d+)\s+N/V", re.I)
DATE = re.compile(r"(\d\d)/(\d\d)/(\d{4})")
CELL = re.compile(r"(?<!\S)([YNXP]\*?)[ \t]+(\S+(?: \S+)*?)(?=[ \t]+[YNXP]\*?[ \t]+\S|[ \t]*$)", re.M)


def deaccent(x):
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", x or "").encode("ascii", "ignore").decode().lower())


def pdf_text(data, n, stats):
    d = Path(tempfile.mkdtemp(prefix=f"rc{n}_"))
    f = d / "rc.pdf"
    f.write_bytes(data)
    t = subprocess.run(["pdftotext", "-layout", str(f), "-"], capture_output=True, text=True).stdout
    if len(t.strip()) >= 200:
        stats["text"] += 1
        return t
    # scanned: OCR
    try:
        subprocess.run(["pdftoppm", "-r", "200", "-png", str(f), str(d / "pg")], check=True, capture_output=True)
        out = ""
        for img in sorted(d.glob("pg*.png")):
            out += subprocess.run(["tesseract", str(img), "-", "--psm", "6", "-c", "preserve_interword_spaces=1"], capture_output=True, text=True).stdout
        stats["ocr"] += 1
        return out
    except Exception:
        stats["ocr_fail"] += 1
        return t


def parse_rc(text):
    """-> dict(number, date, yeas, nays, nv, rows[(code, name)]) or None."""
    m = HDR.search(text)
    if not m:
        return None
    dm = DATE.search(text)
    body = text[m.end():]
    cut = re.search(r"AFTER VOTE|NOT VOTING", body)
    if cut:
        body = body[:cut.start()]
    rows = []
    for line in body.splitlines():
        if not line.strip():
            continue
        for c in CELL.finditer(line):
            name = re.sub(r"^-+|-+$", "", re.sub(r"\s*\*$", "", c.group(2).strip()))
            name = re.sub(r"^(\S+), ([A-Z]\.)$", r"\1 \2", name) if False else name
            rows.append((c.group(1).rstrip("*"), name))
    return {"number": int(m.group(1)), "date": f"{dm.group(3)}-{dm.group(1)}-{dm.group(2)}" if dm else "",
            "yeas": int(m.group(2)), "nays": int(m.group(3)), "nv": int(m.group(4)), "rows": rows}


def build_matcher(legs):
    by_last = {}
    for lid, l in legs.items():
        if l.get("house") != "House":
            continue
        base = re.sub(r"(,|\s)+(jr|sr|ii|iii|iv)\.?$", "", l["last"].split(",")[0].strip(), flags=re.I)
        by_last.setdefault(deaccent(base), []).append(l)
    speaker = [l for l in legs.values() if "speaker" in (l.get("leadership") or "").lower() and "deputy" not in (l.get("leadership") or "").lower()
               and "pro tem" not in (l.get("leadership") or "").lower() and l.get("house") == "House"]

    def match(name):
        if re.match(r"mr\.?\s*speaker", name, re.I):
            return speaker[0]["id"] if len(speaker) == 1 else None
        m = re.match(r"(.+?)(?:,\s*|\s+)([A-Z])\.?$", name)
        last, ini = (m.group(1), m.group(2)) if m else (name, "")
        cands = by_last.get(deaccent(last), [])
        if len(cands) > 1 and ini:
            cands = [c for c in cands if deaccent(c["first"])[:1] == ini.lower()]
        return cands[0]["id"] if len(cands) == 1 else None
    return match


def run():
    legs = json.loads((OUT / "legislators.json").read_text(encoding="utf-8"))
    votes = json.load(gzip.open(OUT / "votes.json.gz", "rt", encoding="utf-8"))
    match = build_matcher(legs)
    refs = {}  # number -> [(bill, vote)]
    no_number = 0
    house_votes = 0
    for bill, vs in votes.items():
        for v in vs:
            if v.get("chamber") != "House":
                continue
            house_votes += 1
            m = NO_RE.search(v.get("motion", ""))
            if not m:
                no_number += 1
                continue
            refs.setdefault(int(m.group(1)), []).append((bill, v))
    nums = sorted(refs)
    print(f"{house_votes} House votes, {sum(len(x) for x in refs.values())} with a roll-call number, {len(nums)} distinct roll calls, {no_number} without number", flush=True)
    stats = {"text": 0, "ocr": 0, "ocr_fail": 0}
    results = {}

    def one(n):
        st, ct, b = fetch(PDF_URL.format(n=n), tries=4, timeout=60, binary=True)
        if st != 200 or not b or b[:4] != b"%PDF":
            return n, ("nopdf", st)
        txt = pdf_text(b, n, stats)
        p = parse_rc(txt)
        return n, ("ok", p) if p else ("noparse", len(txt))
    with ThreadPoolExecutor(4) as ex:
        for n, r in ex.map(one, nums):
            results[n] = r
    found = parsed = tally_ok = rows_total = rows_matched = attached = 0
    problems = []
    unmatched = {}
    for n in nums:
        kind, p = results[n]
        if kind == "nopdf":
            problems.append(f"No. {n}: PDF not found (HTTP {p})")
            continue
        found += 1
        if kind == "noparse":
            problems.append(f"No. {n}: PDF text could not be parsed ({p} chars)")
            continue
        parsed += 1
        ay = sum(1 for c, _ in p["rows"] if c == "Y")
        no = sum(1 for c, _ in p["rows"] if c == "N")
        ab = len(p["rows"]) - ay - no
        nx = sum(1 for c, _ in p["rows"] if c == "X")
        if p["number"] != n or ay != p["yeas"] or no != p["nays"] or nx != p["nv"]:
            problems.append(f"No. {n}: PDF header {p['yeas']}Y/{p['nays']}N/{p['nv']}NV (no {p['number']}) but parsed rows {ay}Y/{no}N/{ab}other ({len(p['rows'])} rows)")
            continue
        members = {}
        for code, name in p["rows"]:
            lid = match(name)
            rows_total += 1
            rows_matched += lid is not None
            if lid is None:
                unmatched[name] = unmatched.get(name, 0) + 1
            members[name] = {"legislator": lid, "vote": {"Y": "AYE", "N": "NOE"}.get(code, "ABSTAIN")}
        for bill, v in refs[n]:
            if v["ayes"] != ay or v["noes"] != no:
                problems.append(f"No. {n} {bill}: history tally {v['ayes']}-{v['noes']} != PDF {ay}-{no}; members left empty")
                continue
            if p["date"] and v["date"] and p["date"] != v["date"]:
                problems.append(f"No. {n} {bill}: date {v['date']} vs PDF {p['date']} (attached; tallies match)")
            v["members"] = members
            v["abstain"] = ab
            attached += 1
        tally_ok += 1
    dump = json.dumps(votes, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    with gzip.open(OUT / "votes.json.gz", "wt", encoding="utf-8") as fh:
        fh.write(dump)
    lines = ["# MA House roll-call member votes", "",
             f"- House vote records: {house_votes}; with a 'YEA and NAY No.' reference: {sum(len(x) for x in refs.values())} ({len(nums)} distinct roll calls); without reference: {no_number}",
             f"- PDFs found: {found}/{len(nums)}; parsed: {parsed}; parsed with PDF counts == row counts: {tally_ok}",
             f"- vote records given members (also equal to history tally): {attached}",
             f"- PDF text extraction: pdftotext text layer {stats['text']}, OCR {stats['ocr']}, OCR failures {stats['ocr_fail']}",
             f"- member rows: {rows_total}; matched to a legislator id: {rows_matched}", "",
             f"## Unmatched printed names ({len(unmatched)})"] + [f"- {k} x{v}" for k, v in sorted(unmatched.items(), key=lambda x: -x[1])[:80]] + \
            ["", f"## Problems ({len(problems)})"] + [f"- {x}" for x in problems[:400]]
    (OUT / "house_votes_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:12]))
    print("\n".join(lines[-min(len(problems), 60) - 2:]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["discover", "sample", "run"])
    a = ap.parse_args()
    if a.mode == "discover":
        discover()
        return 0
    if a.mode == "sample":
        for n in (20, 24, 150, 400):
            st, ct, b = fetch(f"{SITE}/RollCall/194/HouseRollCall{n}.pdf", tries=2, timeout=40, binary=True)
            print(f"\n##### {n}: {st} {ct} {len(b or b'')}", flush=True)
            if b:
                f = Path(f"/tmp/rc{n}.pdf"); f.write_bytes(b)
                t = subprocess.run(["pdftotext", "-layout", str(f), "-"], capture_output=True, text=True).stdout
                print(f"text chars={len(t)}")
                print(t[:3500])
                print("...TAIL...")
                print(t[-800:])
        return 0
    run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
