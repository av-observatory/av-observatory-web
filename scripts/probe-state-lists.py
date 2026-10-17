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
 ("TN", "https://wapp.capitol.tn.gov/apps/Indexes/BillIndex?startNum=HB0001&endNum=HB0100&ga=114", {}),
 ("UT", "https://le.utah.gov/billlist.jsp?session=2026GS", {"hrefs": r"static|bills/"}),
 ("NM", "https://www.nmlegis.gov/Legislation/Legislation_List?Chamber=H&LegType=B&Year=26", {"hrefs": r"legNo|Legislation\?"}),
 ("CO", "https://leg.colorado.gov/bill-search", {"hrefs": r"/bills/[A-Z]"}),
 ("CT", "ftp://ftp.cga.ct.gov/pub/data/bill_info.csv", {}),
 ("MN", "https://www.revisor.mn.gov/bills/status_result.php?body=House&session=0942025&bill=HF1-HF150", {"hrefs": r"bill\.php"}),
 ("VA", "https://lis.blob.core.windows.net/lisfiles/20261/BILLS.CSV", {}),
 ("NH", "https://gc.nh.gov/rssFeeds/rssQueryResults.aspx?&sortoption=&txtsessionyear=2026", {}),
 ("LA", "https://www.legis.la.gov/Legis/BillSearchListQ.aspx?s=26RS&r=HB1*", {"hrefs": r"BillInfo"}),
 ("SC1", "https://www.scstatehouse.gov/sessphp/hintros.php", {"hrefs": r"billnum|bill="}),
 ("IL", "https://ilga.gov/Legislation/RegularSession/HouseBills?SessionId=114", {"hrefs": r"BillStatus|DocNum"}),
 ("PA", "https://www.palegis.us/legislation/bills/2025/hb1", {}),
 ("DE", "https://legis.delaware.gov/json/AllLegislation/GetAllLegislation", {"post": "page=1&pageSize=5&selectedGA[0]=153&selectedLegislationTypeId[0]=1&sort=&group=&filter=", "headers": {**CHROME, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest"}}),
 ("AL", "https://alison.legislature.state.al.us/graphql", {"post": json.dumps({"query": "query bills($sessionAbbreviation: String, $instrumentType: InstrumentType, $offset: Int, $limit: Int){instruments(where:[{sessionAbbreviation:{eq:$sessionAbbreviation},instrumentType:{eq:$instrumentType}}], order:[\"sessionAbbreviation\",\"DESC\"], limit:$limit, offset:$offset){data{id instrumentNbr shortTitle sessionYear currentStatus} count}}", "variables": {"sessionAbbreviation": "2026rs", "instrumentType": "B", "offset": 0, "limit": 3}}), "headers": {**CHROME, "Content-Type": "application/json"}}),
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
    p = parse_html(text, url)
    bills = [a for a in p.anchors if BILL.match(a["text"])]
    out.append(f"   HTML rows={len(p.rows)} anchors={len(p.anchors)} bill-like anchors={len(bills)}")
    for a in bills[:4]:
        out.append(f"   anchor: {a['text']} -> {a['href'][:100]}")
    for r in [r for r in p.rows if len(r) >= 2][:3]:
        out.append("   row: " + " | ".join(c["text"][:40] for c in r[:5]))
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
        form = urllib.parse.urlencode({"PaperType": "HP", "LegSession": "132", "LRType": "None", "Sponsor": "None", "Introducer": "None", "Committee": "None", "AmdFilingChamber": "None", "RollcallChamber": "None", "Action": "None", "ActionChamber": "None", "GovernorAction": "None", "FinalLawType": "None"}).encode()
        op.open("https://legislature.maine.gov/LawMakerWeb/doadvancedsearch.asp", form, timeout=40).read()
        html = op.open("https://legislature.maine.gov/LawMakerWeb/searchresults.asp?StartWith=1", timeout=40).read().decode("utf-8", "replace")
        p = parse_html(html, "https://legislature.maine.gov/LawMakerWeb/")
        hits = [a for a in p.anchors if "summary.asp" in a["href"]]
        return f"ME OK {len(html)}B summary anchors={len(hits)} e.g. {[(a['text'], a['href'][-40:]) for a in hits[:3]]}"
    except Exception as exc:
        return f"ME ERR {type(exc).__name__} {str(exc)[:80]}"

with ThreadPoolExecutor(max_workers=12) as pool:
    futs = [pool.submit(describe, *x) for x in P] + [pool.submit(georgia), pool.submit(texas_ftp), pool.submit(maine)]
    for f in futs:
        print(f.result(), flush=True)
