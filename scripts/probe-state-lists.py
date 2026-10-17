#!/usr/bin/env python3
"""Probe candidate bill-list endpoints for states without an enumerator; print each response's shape."""
import sys
sys.path.insert(0, __import__("pathlib").Path(__file__).parent.as_posix())
from bill_enumerators import http

PROBES = {
 "UT": ["https://le.utah.gov/billlist.jsp?session=2026GS"],
 "VT": ["https://legislature.vermont.gov/bill/loadBillsIntroduced/2026/", "https://legislature.vermont.gov/bill/loadBillsReleased/2026/"],
 "ID": ["https://legislature.idaho.gov/sessioninfo/2026/legislation/minidata/"],
 "IA": ["https://www.legis.iowa.gov/legislation/findLegislation/allbills?ga=91"],
 "WA": ["https://wslwebservices.leg.wa.gov/legislationservice.asmx/GetLegislationByYear?year=2026"],
 "KY": ["https://apps.legislature.ky.gov/record/26rs/"],
 "TN": ["https://wapp.capitol.tn.gov/apps/indexes/BillsByIndex/?year=2025"],
 "WI": ["https://docs.legis.wisconsin.gov/2025/proposals/reg/asm/bill", "https://docs.legis.wisconsin.gov/2025/proposals"],
 "MN": ["https://www.revisor.mn.gov/bills/status_search.php?body=House&session=0942025&submit=Search"],
 "AK": ["https://www.akleg.gov/basis/Bill/Range/34?bill1=HB1&bill2=HB100"],
 "CO": ["https://leg.colorado.gov/bill-search"],
 "OR": ["https://olis.oregonlegislature.gov/liz/2026R1/Measures/list/"],
 "NM": ["https://www.nmlegis.gov/Legislation/Legislation_List?Chamber=H&LegType=B&Year=26"],
 "NE": ["https://nebraskalegislature.gov/bills/search_by_date.php?SessionDay=2026-01-08"],
 "LA": ["https://www.legis.la.gov/legis/BillSearchListQ.aspx?s=26RS&r=HB1"],
 "FL": ["https://www.flsenate.gov/Session/Bills/2026"],
 "OH": ["https://www.legislature.ohio.gov/legislation/search?generalAssemblies=136&pageSize=10"],
 "PA": ["https://www.legis.state.pa.us/cfdocs/legis/home/bills/"],
 "MI": ["https://legislature.mi.gov/Search/ExecuteSearch?sessions=2025-2026"],
 "NJ": ["https://www.njleg.state.nj.us/bill-search"],
 "MA": ["https://malegislature.gov/Bills/194/Senate"],
 "MD": ["https://mgaleg.maryland.gov/mgawebsite/Legislation/Index/senate?ys=2026RS"],
 "IL": ["https://www.ilga.gov/Legislation/BillStatus?GA=104&DocTypeID=HB&LegID=&SessionID=114"],
 "TX": ["https://capitol.texas.gov/Reports/Report.aspx?ReportType=BillsAuthored"],
 "RI": ["https://status.rilegislature.gov/"],
 "SC": ["https://www.scstatehouse.gov/billsearch.php"],
 "KS": ["https://www.kslegislature.gov/li/b2025_26/measures/"],
 "OK": ["https://www.oklegislature.gov/BillInfo.aspx"],
 "GA": ["https://www.legis.ga.gov/api/Legislation/Search/250/1"],
 "AR": ["https://www.arkleg.state.ar.us/Bills/FTPDocument"],
 "VA": ["https://lis.virginia.gov/bill-details/20261/HB1"],
 "NY": ["https://legislation.nysenate.gov/api/3/bills/2025"],
 "NV": ["https://www.leg.state.nv.us/App/NELIS/REL/83rd2025/Bills/List"],
 "HI": ["https://www.capitol.hawaii.gov/session/measure_indiv.aspx?billtype=HB&billnumber=1&year=2026"],
 "ME": ["https://legislature.maine.gov/LawMakerWeb/doadvancedsearch.asp"],
 "NH": ["https://gc.nh.gov/bill_status/billinfo.aspx?id=1&inflect=2"],
 "WV": ["https://www.wvlegislature.gov/Bill_Status/Bills_all_bills.cfm?year=2026&sessiontype=RS&btype=bill"],
 "DE": ["https://legis.delaware.gov/AllLegislation"],
 "CT": ["https://www.cga.ct.gov/asp/cgabillstatus/cgabillstatus.asp"],
 "MO": ["https://documents.house.mo.gov/xml/261-HB1.xml"],
 "CA": ["https://leginfo.legislature.ca.gov/faces/billSearchClient.xhtml"],
 "DC": ["https://lims.dccouncil.gov/api/v2/PublicData/LegislationCategories"],
}
for code, urls in PROBES.items():
    for u in urls:
        try:
            body = http(u, tries=1, timeout=25)
            head = " ".join(body[:260].decode("utf-8", "replace").split())
            print(f"{code} OK  {len(body):>8}B {u}\n     {head}", flush=True)
        except Exception as exc:
            print(f"{code} ERR {type(exc).__name__} {str(exc)[:80]} {u}", flush=True)
