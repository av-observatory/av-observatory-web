#!/usr/bin/env python3
"""Probe candidate bill-list endpoints and summarize each response's STRUCTURE (rows, bill-number links, JSON/XML shape)."""
import json, re, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, Path(__file__).parent.as_posix())
from bill_enumerators import http, parse_html

CHROME = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
BILL = re.compile(r"^(?:[A-Z]{1,4}\.?\s?\d{1,5}|[A-Z]{1,4}\s?[A-Z]?\d{1,5}|\d{1,5})$")
P = [
 ("NY-s-up", "https://www.nysenate.gov/legislation/bills/2025/S1", {"headers": {"User-Agent": "curl/8.5.0", "Accept": "*/*"}}),
 ("NY-s-lo", "https://www.nysenate.gov/legislation/bills/2025/s1", {"headers": {"User-Agent": "curl/8.5.0", "Accept": "*/*"}}),
 ("NY-s-list", "https://www.nysenate.gov/search/legislation?searched=true&type=f_bill&bill_session_year=2025&page=0", {"headers": {"User-Agent": "curl/8.5.0", "Accept": "*/*"}, "hrefs": r"/legislation/bills/2025/"}),
 ("NY-a-old", "https://assembly.state.ny.us/leg/?default_fld=&bn=A00001&term=2025&Summary=Y&Actions=Y&Text=Y", {"headers": {"User-Agent": "curl/8.5.0", "Accept": "*/*"}, "raw": "Sponsor"}),
 ("NY-a-new", "https://nyassembly.gov/leg/?default_fld=&leg_video=&bn=A00001&term=2025&Summary=Y&Actions=Y&Text=Y&Memo=Y", {"headers": {"User-Agent": "curl/8.5.0", "Accept": "*/*"}, "raw": "Introduced"}),
 ("NY-open", "https://legislation.nysenate.gov/api/3/bills/2025?limitOffset=1&limit=1", {"headers": {"User-Agent": "curl/8.5.0"}}),
]

def describe(code, url, opt):
    try:
        data = opt["post"].encode() if isinstance(opt.get("post"), str) else None
        body = http(url, data=data, tries=1, timeout=opt.get("timeout", 30), headers=opt.get("headers"))
    except Exception as exc:
        return f"{code} ERR {type(exc).__name__} {str(exc)[:70]}  {url}"
    text = body.decode("utf-8", "replace")
    out = [f"{code} OK {len(body)}B {url}"]
    s = text.lstrip()
    try:
        j = json.loads(s)
        if isinstance(j, dict):
            out.append("   JSON dict keys: " + ",".join(list(j)[:12]))
            for k, v in j.items():
                if isinstance(v, list) and v:
                    out.append(f"   .{k}: list[{len(v)}] first={json.dumps(v[0])[:260]}")
                    break
        else:
            out.append(f"   JSON list[{len(j)}] first={json.dumps(j[0])[:300] if j else None}")
        return "\n".join(out)
    except ValueError:
        pass
    if s.startswith("<?xml") or re.match(r"<[A-Za-z]+[^>]*xmlns", s[:300]) or "<BILL" in s[:800].upper():
        out.append("   XML: " + " ".join(s[:900].split()))
        return "\n".join(out)
    if "<html" not in s[:1500].lower() and not s.startswith("<"):
        out.append("   TEXT: " + " ".join(s[:500].split()))
        return "\n".join(out)
    if opt.get("raw") and opt["raw"] in text:
        i = text.index(opt["raw"])
        out.append("   RAWCTX: " + " ".join(re.sub(r"<[^>]+>", " ", text[max(0, i - 300): i + 900]).split()))
    p = parse_html(text, url)
    bills = [a for a in p.anchors if BILL.match(a["text"])]
    out.append(f"   HTML rows={len(p.rows)} anchors={len(p.anchors)} bill-like anchors={len(bills)}")
    for a in bills[:4]:
        out.append(f"   anchor: {a['text']} -> {a['href'][:100]}")
    for r, at in list(zip([r for r in p.rows], p.row_attrs))[:3]:
        if len(r) >= 2:
            out.append("   row: " + " | ".join(c["text"][:40] for c in r[:5]) + (f"   attrs={str(at)[:120]}" if at else ""))
    if opt.get("hrefs"):
        pick = [a for a in p.anchors if re.search(opt["hrefs"], a["href"])]
        out.append(f"   anchors matching /{opt['hrefs']}/: {len(pick)}")
        for a in pick[:6]:
            out.append(f"   hit: {a['text'][:50]} -> {a['href'][:140]}")
    if not bills:
        dig = [a for a in p.anchors if re.search(r"\d", a["text"] + a["href"])][:10]
        for a in dig:
            out.append(f"   a: {a['text'][:40]} -> {a['href'][:150]}")
        if len(p.anchors) < 5:
            out.append("   raw: " + " ".join(re.sub(r"<[^>]+>", " ", text)[:400].split()))
    m = re.search(r"<title[^>]*>(.*?)</title>", text, re.S | re.I)
    out.append("   title: " + (" ".join(m.group(1).split())[:90] if m else "-"))
    return "\n".join(out)


def georgia():
    import hashlib, time, urllib.request
    ts = str(int(time.time() * 1000))
    key = hashlib.sha512(("QFpCwKfd7" + "fjVEXFFwSu36BwwcP83xYgxLAhLYmKk" + "letvarconst" + ts).encode()).hexdigest()
    try:
        token = json.loads(http(f"https://www.legis.ga.gov/api/authentication/token?key={key}&ms={ts}", headers=CHROME, tries=1))
        hdr = {**CHROME, "Authorization": "Bearer " + token, "Content-Type": "application/json"}
        body = http("https://www.legis.ga.gov/api/Legislation/Search/5/0", data=json.dumps({"sessionId": 1033}).encode(), headers=hdr, tries=1)
        return "GA OK token+search: " + " ".join(body.decode("utf-8", "replace")[:700].split())
    except Exception as exc:
        return f"GA ERR {type(exc).__name__} {str(exc)[:80]}"

def texas_ftp():
    import ftplib
    try:
        ftp = ftplib.FTP("ftp.legis.state.tx.us", timeout=30); ftp.login()
        out = []
        for d in ("/", "/bills"):
            try:
                ftp.cwd(d); out.append(f"{d}: {ftp.nlst()[:12]}")
            except Exception as e:
                out.append(f"{d}: {e}")
        return "TX FTP OK " + " | ".join(out)
    except Exception as exc:
        return f"TX FTP ERR {type(exc).__name__} {str(exc)[:80]}"

def maine():
    import http.cookiejar, urllib.request, urllib.parse
    try:
        jar = http.cookiejar.CookieJar()
        op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        op.addheaders = [("User-Agent", CHROME["User-Agent"])]
        form = urllib.parse.urlencode({"PaperType": "HP", "LegSession": "16", "LRType": "None", "Sponsor": "None", "Introducer": "None", "Committee": "None", "AmdFilingChamber": "None", "RollcallChamber": "None", "Action": "None", "ActionChamber": "None", "GovernorAction": "None", "FinalLawType": "None"}).encode()
        op.open("https://legislature.maine.gov/LawMakerWeb/doadvancedsearch.asp", form, timeout=40).read()
        html = op.open("https://legislature.maine.gov/LawMakerWeb/searchresults.asp?StartWith=1", timeout=40).read().decode("utf-8", "replace")
        p = parse_html(html, "https://legislature.maine.gov/LawMakerWeb/")
        hits = [a for a in p.anchors if "summary.asp" in a["href"]]
        return f"ME OK {len(html)}B summary anchors={len(hits)} e.g. {[(a['text'], a['href'][-40:]) for a in hits[:3]]}"
    except Exception as exc:
        return f"ME ERR {type(exc).__name__} {str(exc)[:80]}"

def oklahoma():
    try:
        html = http("https://webapps.oklegislature.gov/WebApplication3/WebForm1.aspx", headers=CHROME, tries=1).decode("utf-8", "replace")
        hidden = re.findall(r'<input type="hidden" name="([^"]+)"', html)
        opts = re.findall(r'<option[^>]*value="([^"]*)"[^>]*>([^<]*)</option>', html)[:25]
        return f"OK webform hidden={hidden[:6]} options={opts}"
    except Exception as exc:
        return f"OK ERR {type(exc).__name__} {str(exc)[:80]}"

def dc_bundle():
    try:
        html = http("https://lims.dccouncil.gov/Legislation/B26-0684", headers=CHROME, tries=1).decode("utf-8", "replace")
        srcs = re.findall(r'src="([^"]+\.js[^"]*)"', html) + re.findall(r"src='([^']+\.js[^']*)'", html)
        out = [f"scripts={srcs[:8]}"]
        srcs = [x for x in srcs if "/static/js/" in x]
        for src in srcs[:6]:
            url = src if src.startswith("http") else "https://lims.dccouncil.gov" + (src if src.startswith("/") else "/" + src)
            try:
                js = http(url, headers=CHROME, tries=1, timeout=60).decode("utf-8", "replace")
            except Exception as exc:
                out.append(f"{url[-50:]} ERR {exc}")
                continue
            if "main." in url:
                for m in list(re.finditer(r"(Authorization|PublicData|apiKey|api_key|Bearer)", js))[:10]:
                    out.append(f"{url[-30:]} @{m.start()}: " + " ".join(js[max(0, m.start() - 150): m.start() + 250].split()))
        return "DC bundle: " + " || ".join(out)
    except Exception as exc:
        return f"DC bundle ERR {type(exc).__name__} {str(exc)[:80]}"

with ThreadPoolExecutor(max_workers=12) as pool:
    futs = [pool.submit(describe, *x) for x in P] + [pool.submit(dc_bundle)]
    for f in futs:
        print(f.result(), flush=True)
