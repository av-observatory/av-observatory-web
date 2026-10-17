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
 ("UT", "https://le.utah.gov/billlist.jsp?session=2026GS", {}),
 ("VT", "https://legislature.vermont.gov/bill/loadAllResolutionsByChamber/2026/both", {}),
 ("ID", "https://legislature.idaho.gov/sessioninfo/2026/legislation/minidata/", {}),
 ("IA", "https://www.legis.iowa.gov/legislation/findLegislation/allbills?ga=91", {}),
 ("WA", "https://wslwebservices.leg.wa.gov/legislationservice.asmx/GetLegislationByYear?year=2026", {}),
 ("TN", "https://wapp.capitol.tn.gov/apps/indexes/BillsByIndex/?year=2025", {}),
 ("MN", "https://www.revisor.mn.gov/bills/status_search.php?body=House&session=0942025&submit=Search", {}),
 ("AK", "https://www.akleg.gov/basis/Bill/Range/34?bill1=HB1&bill2=HB100", {}),
 ("CO", "https://leg.colorado.gov/bill-search", {}),
 ("OR", "https://olis.oregonlegislature.gov/liz/2026R1/Measures/list/", {}),
 ("NM", "https://www.nmlegis.gov/Legislation/Legislation_List?Chamber=H&LegType=B&Year=26", {}),
 ("NE", "https://nebraskalegislature.gov/bills/search_by_date.php?SessionDay=2025", {}),
 ("LA", "https://www.legis.la.gov/legis/BillSearchListQ.aspx?s=26RS&r=HB1", {}),
 ("FL", "https://www.flsenate.gov/Session/Bills/2026", {}),
 ("OH", "https://search-prod.lis.state.oh.us/api/v2/general_assembly_136/legislation/", {"timeout": 90}),
 ("PA", "https://www.legis.state.pa.us/cfdocs/legis/home/bills/", {}),
 ("NJ", "https://www.njleg.state.nj.us/bill-search", {}),
 ("MD", "https://mgaleg.maryland.gov/mgawebsite/Legislation/Index/senate?ys=2026RS", {}),
 ("RI", "https://status.rilegislature.gov/", {}),
 ("SC", "https://www.scstatehouse.gov/billsearch.php", {}),
 ("KS", "https://www.kslegislature.gov/li/b2025_26/measures/", {}),
 ("OK", "https://www.oklegislature.gov/BillInfo.aspx", {}),
 ("NV", "https://www.leg.state.nv.us/App/NELIS/REL/83rd2025/Bills/List", {}),
 ("ME", "https://legislature.maine.gov/LawMakerWeb/doadvancedsearch.asp", {}),
 ("NH", "https://gc.nh.gov/bill_status/billinfo.aspx?id=1&inflect=2", {}),
 ("WV", "https://www.wvlegislature.gov/Bill_Status/Bills_all_bills.cfm?year=2026&sessiontype=RS&btype=bill", {}),
 ("DE", "https://legis.delaware.gov/AllLegislation", {}),
 ("CT", "https://www.cga.ct.gov/asp/cgabillstatus/cgabillstatus.asp", {}),
 ("MA", "https://malegislature.gov/api/GeneralCourts/194/Documents", {"timeout": 90}),
 ("MO", "https://documents.house.mo.gov/xml/261-BillList.xml", {}),
 ("IL", "https://ilga.gov/Legislation/RegularSession/HouseBills?SessionId=114", {}),
 ("KY", "https://apps.legislature.ky.gov/record/26rs/house_bills.html", {"headers": CHROME}),
 ("HI", "https://www.capitol.hawaii.gov/", {"headers": CHROME}),
 ("CA", "https://leginfo.legislature.ca.gov/faces/billSearchClient.xhtml", {"headers": CHROME}),
 ("WI", "https://docs.legis.wisconsin.gov/2025/proposals/reg/asm/bill", {"headers": CHROME, "timeout": 60}),
 ("MI", "https://legislature.mi.gov/Search/ExecuteSearch?chamber=&docTypesList=HB%2CSB&sessions=2025-2026&sponsor=&number=&dateFrom=&dateTo=&contentFullText=", {"headers": CHROME}),
 ("GA", "https://www.legis.ga.gov/legislation/", {"headers": CHROME}),
 ("TX", "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=HB1", {"headers": CHROME}),
 ("AR", "https://www.arkleg.state.ar.us/Bills/FTPDocument?path=%2fSessionInformation%2f", {"headers": CHROME}),
 ("VA", "https://lis.virginia.gov/", {"headers": CHROME}),
 ("NY", "https://www.nysenate.gov/search/legislation", {"headers": CHROME}),
 ("DC", "https://lims.dccouncil.gov/Legislation/B26-0684", {"headers": CHROME}),
 ("AL", "https://alison.legislature.state.al.us/bill-search", {"headers": CHROME}),
 ("IN", "https://iga.in.gov/legislative/2026/bills", {"headers": CHROME}),
 ("MS", "https://billstatus.ls.state.ms.us/2026/pdf/all_measures/allmsrs.xml", {}),
 ("NC", "https://www.ncleg.gov/Legislation/Bills/FiledBillsFeed/2025/H", {}),
 ("SD", "https://sdlegislature.gov/api/Bills/Session/Light/71", {}),
 ("WY", "https://lsoservice.wyoleg.gov/api/BillInformation?$filter=Year%20eq%202026&$orderby=BillNum", {}),
 ("ND", "https://ndlegis.gov/api/assembly/69-2025/data/bills.json", {}),
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
    if s.startswith("<?xml") or re.match(r"<[A-Za-z]+[^>]*xmlns", s[:300]):
        out.append("   XML: " + " ".join(s[:700].split()))
        return "\n".join(out)
    p = parse_html(text, url)
    bills = [a for a in p.anchors if BILL.match(a["text"])]
    out.append(f"   HTML rows={len(p.rows)} anchors={len(p.anchors)} bill-like anchors={len(bills)}")
    for a in bills[:4]:
        out.append(f"   anchor: {a['text']} -> {a['href'][:100]}")
    for r in [r for r in p.rows if len(r) >= 2][:3]:
        out.append("   row: " + " | ".join(c["text"][:40] for c in r[:5]))
    m = re.search(r"<title[^>]*>(.*?)</title>", text, re.S | re.I)
    out.append("   title: " + (" ".join(m.group(1).split())[:90] if m else "-"))
    return "\n".join(out)

with ThreadPoolExecutor(max_workers=12) as pool:
    for line in pool.map(lambda x: describe(*x), P):
        print(line, flush=True)
