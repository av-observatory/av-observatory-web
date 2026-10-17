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
 ("FL", "https://www.flsenate.gov/Session/Bills/2026", {}),
 ("FL2", "https://www.flsenate.gov/Session/Bills/2026?Chamber=both&SearchOnlyCurrentVersions=True&LegislativeSessionTitle=2026&pageNumber=2", {}),
 ("TN", "https://wapp.capitol.tn.gov/apps/indexes/BillsByIndex/?year=2025", {}),
 ("UT", "https://le.utah.gov/billlist.jsp?session=2026GS", {}),
 ("MN", "https://www.revisor.mn.gov/bills/status_search.php?body=House&session=0942025&submit=Search", {}),
 ("CO", "https://leg.colorado.gov/bill-search", {}),
 ("OR", "https://olis.oregonlegislature.gov/liz/2026R1/Measures/list/", {}),
 ("NM", "https://www.nmlegis.gov/Legislation/Legislation_List?Chamber=H&LegType=B&Year=26", {}),
 ("NV", "https://www.leg.state.nv.us/App/NELIS/REL/83rd2025/Bills/List", {}),
 ("KS", "https://www.kslegislature.gov/li/b2025_26/measures/", {}),
 ("NH", "https://gc.nh.gov/bill_status/billinfo.aspx?id=1&inflect=2", {}),
 ("CT", "https://www.cga.ct.gov/asp/cgabillstatus/cgabillstatus.asp", {}),
 ("SC", "https://www.scstatehouse.gov/billsearch.php", {}),
 ("AL", "https://alison.legislature.state.al.us/bill-search", {"headers": CHROME}),
 ("IL", "https://ilga.gov/Legislation/RegularSession/HouseBills?SessionId=114", {}),
 ("NJ", "https://www.njleg.state.nj.us/bill-search", {}),
 ("RI", "https://status.rilegislature.gov/", {}),
 ("ME", "https://legislature.maine.gov/LawMakerWeb/doadvancedsearch.asp", {}),
 ("OK", "https://www.oklegislature.gov/BillInfo.aspx", {}),
 ("DE", "https://legis.delaware.gov/AllLegislation", {}),
 ("PA", "https://www.legis.state.pa.us/cfdocs/legis/home/bills/", {}),
 ("MO", "https://documents.house.mo.gov/xml/261-BillList.xml", {}),
 ("MO2", "https://www.senate.mo.gov/BillTracking/Bills/BillList?year=2026&session=R", {"headers": CHROME}),
 ("LA", "https://www.legis.la.gov/legis/BillSearchListQ.aspx?s=26RS&r=HB1-HB9999", {}),
 ("LA2", "https://www.legis.la.gov/legis/BillSearch.aspx?sid=26RS", {}),
 ("IN", "https://iga.in.gov/legislative/2026/bills", {"headers": CHROME}),
 ("TX2", "https://capitol.texas.gov/Search/BillSearchResults.aspx", {"headers": CHROME}),
 ("AR", "https://arkleg.state.ar.us/Bills/SearchResults?ddBienniumSession=2025%2F2025R&Page=1", {"headers": CHROME}),
 ("GA", "https://www.legis.ga.gov/api/legislation/search/20252026?pageSize=5", {"headers": CHROME}),
 ("HI", "https://www.capitol.hawaii.gov/measure_indiv.aspx?billtype=HB&billnumber=1&year=2026", {"headers": CHROME}),
 ("CA", "https://downloads.leginfo.legislature.ca.gov/", {"headers": CHROME}),
 ("NY", "https://www.nysenate.gov/legislation/bills/2025/S1", {"headers": CHROME}),
 ("NY2", "https://nyassembly.gov/leg/?default_fld=&bn=A1&term=2025&Summary=Y", {"headers": CHROME}),
 ("DC", "https://lims.dccouncil.gov/Legislation/", {"headers": CHROME}),
 ("VA", "https://lis.virginia.gov/bill-details/20261/HB1", {"headers": CHROME}),
 ("WI", "https://docs.legis.wisconsin.gov/2025/proposals/reg/asm/bill", {"headers": CHROME, "timeout": 60}),
]

def describe(code, url, opt):
    try:
        body = http(url, tries=1, timeout=opt.get("timeout", 30), headers=opt.get("headers"))
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
    p = parse_html(text, url)
    bills = [a for a in p.anchors if BILL.match(a["text"])]
    out.append(f"   HTML rows={len(p.rows)} anchors={len(p.anchors)} bill-like anchors={len(bills)}")
    for a in bills[:4]:
        out.append(f"   anchor: {a['text']} -> {a['href'][:100]}")
    for r in [r for r in p.rows if len(r) >= 2][:3]:
        out.append("   row: " + " | ".join(c["text"][:40] for c in r[:5]))
    if not bills:
        dig = [a for a in p.anchors if re.search(r"\d", a["text"] + a["href"])][:10]
        for a in dig:
            out.append(f"   a: {a['text'][:40]} -> {a['href'][:150]}")
        if len(p.anchors) < 5:
            out.append("   raw: " + " ".join(re.sub(r"<[^>]+>", " ", text)[:400].split()))
    m = re.search(r"<title[^>]*>(.*?)</title>", text, re.S | re.I)
    out.append("   title: " + (" ".join(m.group(1).split())[:90] if m else "-"))
    return "\n".join(out)

with ThreadPoolExecutor(max_workers=12) as pool:
    for line in pool.map(lambda x: describe(*x), P):
        print(line, flush=True)

import ftplib
try:
    ftp = ftplib.FTP("ftp.legis.state.tx.us", timeout=30); ftp.login()
    ftp.cwd("/bills/89R/billtext/html/house_bills/0000_0099")
    files = ftp.nlst()
    print(f"TX FTP OK {len(files)} files, e.g. {files[:3]}")
except Exception as exc:
    print("TX FTP ERR", type(exc).__name__, str(exc)[:80])
