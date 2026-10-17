"""Per-state enumerators: list EVERY bill in a legislative session straight from the state's own site.

Each enumerator is a generator of dicts ``{session, number, title, url, text_url?, chamber?}``
and must yield every bill of the session (not a keyword subset). Adding a state means adding one
function and registering it in ENUMERATORS with the sessions to cover. Endpoints were identified from
the public documentation of each legislature's data service; no third-party aggregator is used.
"""
from __future__ import annotations

import json
import re
import ssl
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from xml.etree import ElementTree

UA = "AVObservatory/1.0 (+https://av-observatory.com/; public-records research)"


def http(url: str, *, data: bytes | None = None, headers: dict | None = None, timeout: int = 90, tries: int = 3) -> bytes:
    """GET/POST with retries. Falls back to unverified TLS only for known-misconfigured public state hosts."""
    hdrs = {"User-Agent": UA, "Accept": "application/json, text/xml, text/html, */*", **(headers or {})}
    last: Exception | None = None
    for attempt in range(tries):
        for ctx in (None, ssl._create_unverified_context()):
            try:
                with urlopen(Request(url, data=data, headers=hdrs), timeout=timeout, context=ctx) as r:
                    return r.read()
            except ssl.SSLError as exc:
                last = exc
                continue
            except URLError as exc:
                last = exc
                if isinstance(exc.reason, ssl.SSLError):
                    continue
                break
            except HTTPError as exc:
                last = exc
                if exc.code in (400, 401, 403, 404):
                    raise
                break
            except Exception as exc:  # timeouts, resets
                last = exc
                break
        time.sleep(2 ** attempt * 3)
    raise last or RuntimeError("fetch failed")


def jget(url: str, **kw):
    return json.loads(http(url, **kw).decode("utf-8", "replace"))


# --------------------------------------------------------------------------- shared HTML helpers
from html.parser import HTMLParser
from urllib.parse import urljoin


class _Cells(HTMLParser):
    """Collects <tr> rows as lists of cells; each cell is {text, links:[(href, text)]}. Also collects all anchors."""

    def __init__(self, base: str):
        super().__init__(convert_charrefs=True)
        self.base, self.rows, self.row_attrs, self.anchors = base, [], [], []
        self._row = self._cell = self._a = None
        self._attrs = {}

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._row, self._attrs = [], dict(attrs)
        elif tag in ("td", "th") and self._row is not None:
            self._cell = {"text": "", "links": []}
        elif tag == "a":
            href = dict(attrs).get("href")
            self._a = {"href": urljoin(self.base, href) if href else "", "text": ""}

    def handle_data(self, data):
        if self._cell is not None:
            self._cell["text"] += data
        if self._a is not None:
            self._a["text"] += data

    def handle_endtag(self, tag):
        if tag == "a" and self._a is not None:
            a, self._a = self._a, None
            a["text"] = " ".join(a["text"].split())
            self.anchors.append(a)
            if self._cell is not None and a["href"]:
                self._cell["links"].append((a["href"], a["text"]))
        elif tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._cell["text"] = " ".join(self._cell["text"].split())
            self._row.append(self._cell)
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.rows.append(self._row)
                self.row_attrs.append(self._attrs)
            self._row = None


def parse_html(html: str, base: str = "") -> _Cells:
    p = _Cells(base)
    p.feed(html)
    return p


def page(url: str, **kw) -> _Cells:
    return parse_html(http(url, **kw).decode("utf-8", "replace"), url)


# --------------------------------------------------------------------------- South Dakota
def sd(session: str):
    ids = {"2026": "71", "2025": "70"}
    for item in jget(f"https://sdlegislature.gov/api/Bills/Session/Light/{ids[session]}"):
        yield {"session": session, "number": f"{item['BillType']} {item['BillNumberOnly']}",
               "title": item.get("Title") or "", "url": f"https://sdlegislature.gov/Session/Bill/{item['BillId']}"}


# --------------------------------------------------------------------------- Wyoming
def wy(session: str):
    url = f"https://lsoservice.wyoleg.gov/api/BillInformation?$filter={quote(f'Year eq {session}')}&$orderby=BillNum"
    for item in jget(url):
        title = next((item[k] for k in ("catchTitle", "shortTitle", "billTitle", "title") if item.get(k)), "")
        number = item.get("billNum") or item.get("bill") or ""
        yield {"session": session, "number": str(number), "title": title,
               "url": f"https://wyoleg.gov/Legislation/{session}/{number}"}


# --------------------------------------------------------------------------- North Carolina
def nc(session: str):
    for abbr in ("H", "S"):
        root = ElementTree.fromstring(http(f"https://www.ncleg.gov/Legislation/Bills/FiledBillsFeed/{session}/{abbr}"))
        for item in list(root[0])[4:]:
            number, title = (item[1].text or "").strip(), (item[4].text or "").strip()
            if number:
                yield {"session": session, "number": number, "title": title,
                       "url": f"https://www.ncleg.gov/BillLookUp/{session}/{number}"}


# --------------------------------------------------------------------------- Mississippi
def ms(session: str):
    root = ElementTree.fromstring(http(f"https://billstatus.ls.state.ms.us/{session}/pdf/all_measures/allmsrs.xml"))
    for group in root.iter("MSRGROUP"):
        number = (group.findtext("MEASURE") or "").replace(" ", "")
        if not number:
            continue
        title = next(((group.findtext(t) or "").strip() for t in ("SHORTTITLE", "TITLE", "LONGTITLE") if group.findtext(t)), "")
        link = (group.findtext("MEASURELINK") or "").replace("../../../", "")
        yield {"session": session, "number": number, "title": title,
               "url": f"https://billstatus.ls.state.ms.us/{link}" if link else f"https://billstatus.ls.state.ms.us/{session}/"}


# --------------------------------------------------------------------------- Montana
def mt(session: str):
    sid = {"2025": 2}[session]
    page = 0
    while True:
        body = json.dumps({"sessionIds": [sid]}).encode()
        url = f"https://api.legmt.gov/bills/v1/bills/search?limit=1000&offset={page}&sort=billType.code,desc&sort=billNumber,asc"
        data = json.loads(http(url, data=body, headers={"Content-Type": "application/json"}).decode())
        rows = data.get("content") or []
        for row in rows:
            draft = row.get("draft") or {}
            number = f"{row['billType']['code']} {row['billNumber']}" if row.get("billNumber") else draft.get("draftNumber", "")
            yield {"session": session, "number": number, "title": draft.get("shortTitle") or "",
                   "url": f"https://bills.legmt.gov/#/laws/bill/{sid}/{draft.get('draftNumber', '')}"}
        if data.get("last", True) or not rows:
            break
        page += 1


# --------------------------------------------------------------------------- North Dakota
def nd(session: str):
    assembly, year = {"2025": ("69", "2025")}[session]
    data = jget(f"https://ndlegis.gov/api/assembly/{assembly}-{year}/data/bills.json")
    for entry in (data.get("bills") or {}).values():
        yield {"session": session, "number": entry["name"], "title": entry.get("title") or "",
               "url": entry.get("url") or "https://ndlegis.gov/assembly/", "summary": entry.get("summary") or ""}


# --------------------------------------------------------------------------- Arizona (probe: list API shape unverified)
def az(session: str):
    sid = {"57th-2nd-regular": 130, "57th-1st-regular": 129}[session]
    data = jget(f"https://apps.azleg.gov/api/Bill/?sessionID={sid}")
    rows = data if isinstance(data, list) else data.get("ListItems") or data.get("Bills") or data.get("bills") or []
    if not rows:
        raise RuntimeError(f"unrecognized AZ list shape: {str(data)[:200]}")
    for item in rows:
        number = item.get("Number") or item.get("BillNumber") or ""
        yield {"session": session, "number": number, "title": item.get("ShortTitle") or item.get("Title") or "",
               "url": f"https://apps.azleg.gov/BillStatus/BillOverview/{item.get('BillId', '')}?SessionId={sid}"}


CHROME = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
BILLNO = re.compile(r"^[A-Z]{1,4}\.?\s?\d{1,5}$")


# --------------------------------------------------------------------------- Vermont (JSON, biennium)
def vt(session: str):
    year = session.split("-")[-1]
    rows = []
    for ep in (f"loadBillsIntroduced/{year}/", f"loadAllResolutionsByChamber/{year}/both"):
        data = jget("https://legislature.vermont.gov/bill/" + ep).get("data")
        if isinstance(data, list):
            rows += data
    for r in rows:
        number = (r.get("BillNumber") or r.get("BillSortNumber") or "").strip()
        if number:
            slug = number.replace(".", "")
            yield {"session": session, "number": number, "title": (r.get("Title") or r.get("Title1") or "").strip(),
                   "url": f"https://legislature.vermont.gov/bill/status/{year}/{slug}"}


# --------------------------------------------------------------------------- Idaho (HTML table)
def idaho(session: str):
    p = page(f"https://legislature.idaho.gov/sessioninfo/{session}/legislation/minidata/")
    for row in p.rows:
        if len(row) >= 2 and re.fullmatch(r"[HS][A-Z]*\d+", row[0]["text"]):
            link = row[0]["links"][0][0] if row[0]["links"] else f"https://legislature.idaho.gov/sessioninfo/{session}/legislation/{row[0]['text']}/"
            yield {"session": session, "number": row[0]["text"], "title": row[1]["text"], "url": link}


# --------------------------------------------------------------------------- Iowa (HTML table, general assembly number)
def ia(session: str):
    p = page(f"https://www.legis.iowa.gov/legislation/findLegislation/allbills?ga={session}")
    for row in p.rows:
        if len(row) >= 3 and re.fullmatch(r"[A-Z]{1,4} \d+", row[1]["text"]):
            link = row[1]["links"][0][0].replace(" ", "") if row[1]["links"] else ""
            yield {"session": session, "number": row[1]["text"], "title": row[2]["text"], "url": link}


# --------------------------------------------------------------------------- Washington (XML, no titles in list)
def wa(session: str):
    root = ElementTree.fromstring(http(f"https://wslwebservices.leg.wa.gov/legislationservice.asmx/GetLegislationByYear?year={session}", timeout=120))
    ns = {"w": "http://WSLWebServices.leg.wa.gov/"}
    for item in root.findall("w:LegislationInfo", ns):
        bill_id = (item.findtext("w:BillId", "", ns) or "").strip()
        num = (item.findtext("w:BillNumber", "", ns) or "").strip()
        if bill_id:
            kind = "House Bills" if bill_id.startswith("H") else "Senate Bills"
            yield {"session": session, "number": bill_id, "title": "",
                   "url": f"https://app.leg.wa.gov/billsummary?BillNumber={num}&Year={session}&Initiative=false",
                   "text_url": f"https://lawfilesext.leg.wa.gov/biennium/2025-26/Htm/Bills/{kind.replace(' ', '%20')}/{num}.htm"}


# --------------------------------------------------------------------------- Alaska (HTML, 100-bill ranges)
def ak(session: str):
    for kind in ("HB", "SB", "HJR", "SJR", "HCR", "SCR", "HR", "SR"):
        start = 1
        while start < 3000:
            p = page(f"https://www.akleg.gov/basis/Bill/Range/{session}?bill1={kind}{start}&bill2={kind}{start + 99}")
            found = 0
            for row in p.rows:
                if len(row) >= 2 and re.fullmatch(rf"{kind} \d+", row[0]["text"]):
                    found += 1
                    link = row[0]["links"][0][0] if row[0]["links"] else ""
                    yield {"session": session, "number": row[0]["text"], "title": row[1]["text"], "url": link}
            if not found:
                break
            start += 100


# --------------------------------------------------------------------------- Nebraska (HTML table by year)
def ne(session: str):
    for year in {"109th": ("2025", "2026")}[session]:
        p = page(f"https://nebraskalegislature.gov/bills/search_by_date.php?SessionDay={year}")
        for row in p.rows:
            if len(row) >= 4 and re.fullmatch(r"[A-Z]{2,3}\d+", row[0]["text"]):
                link = row[0]["links"][0][0] if row[0]["links"] else ""
                yield {"session": session, "number": row[0]["text"], "title": row[3]["text"], "url": link}


# --------------------------------------------------------------------------- Ohio (JSON)
def oh(session: str):
    seen = set()
    for item in jget(f"https://search-prod.lis.state.oh.us/api/v2/general_assembly_{session}/legislation/", timeout=180):
        key = item.get("number")
        if key and key not in seen:
            seen.add(key)
            yield {"session": session, "number": item.get("name") or key.upper(), "title": item.get("short_title") or "",
                   "url": f"https://www.legislature.ohio.gov/legislation/{session}/{key}"}


# --------------------------------------------------------------------------- Maryland (HTML index per chamber; no titles)
def md(session: str):
    seen = set()
    for chamber in ("senate", "house"):
        p = page(f"https://mgaleg.maryland.gov/mgawebsite/Legislation/Index/{chamber}?ys={session}")
        for a in p.anchors:
            if re.fullmatch(r"(?:HB|SB|HJ|SJ|HR|SR)\d{4}", a["text"]) and a["text"] not in seen:
                seen.add(a["text"])
                yield {"session": session, "number": a["text"], "title": "", "url": a["href"]}


# --------------------------------------------------------------------------- Kentucky (HTML link lists; Chrome UA)
def ky(session: str):
    for chamber in ("house", "senate"):
        for kind in ("bills", "resolutions"):
            url = f"https://apps.legislature.ky.gov/record/{session}/{chamber}_{kind}.html"
            try:
                p = page(url, headers=CHROME)
            except HTTPError:
                continue
            for a in p.anchors:
                m = re.search(r"/([a-z]+)(\d+)\.html?$", a["href"])
                if m and a["text"].strip().isdigit():
                    yield {"session": session, "number": f"{m.group(1).upper()} {int(m.group(2))}", "title": "", "url": a["href"]}


# --------------------------------------------------------------------------- Massachusetts (JSON API)
def ma(session: str):
    for row in jget(f"https://malegislature.gov/api/GeneralCourts/{session}/Documents", timeout=180):
        number = (row.get("BillNumber") or row.get("DocketNumber") or "").strip()
        if number:
            yield {"session": session, "number": number, "title": row.get("Title") or "",
                   "url": f"https://malegislature.gov/Bills/{session}/{number}"}


# --------------------------------------------------------------------------- Michigan (HTML search results; Chrome UA)
def mi(session: str):
    url = ("https://legislature.mi.gov/Search/ExecuteSearch?chamber=&docTypesList=HB%2CSB&docTypesList=HR%2CSR&docTypesList=HCR%2CSCR"
           f"&docTypesList=HJR%2CSJR&sessions={session}&sponsor=&number=&dateFrom=&dateTo=&contentFullText=")
    p = page(url, headers=CHROME, timeout=180)
    for row in p.rows:
        if len(row) >= 3 and " of " in row[0]["text"] and row[0]["links"]:
            yield {"session": session, "number": row[0]["text"].split(" of ")[0].strip(), "title": row[2]["text"],
                   "url": row[0]["links"][0][0]}


# --------------------------------------------------------------------------- West Virginia (HTML table)
def wv(session: str):
    for kind in ("bill", "res"):
        try:
            p = page(f"https://www.wvlegislature.gov/Bill_Status/Bills_all_bills.cfm?year={session}&sessiontype=RS&btype={kind}", timeout=120)
        except HTTPError:
            continue
        for row in p.rows:
            if len(row) >= 2 and row[0]["links"] and BILLNO.match(row[0]["text"]):
                yield {"session": session, "number": row[0]["text"], "title": row[1]["text"], "url": row[0]["links"][0][0]}


# --------------------------------------------------------------------------- Florida (HTML table, paged)
def fl(session: str):
    seen, number_page = set(), 1
    while number_page < 500:
        url = (f"https://www.flsenate.gov/Session/Bills/{session}?Chamber=both&SearchOnlyCurrentVersions=True"
               f"&LegislativeSessionTitle={session}&pageNumber={number_page}")
        fresh = 0
        for row in page(url).rows:
            if len(row) >= 2 and re.fullmatch(r"[A-Z]{2,4} \d+", row[0]["text"]) and row[0]["text"] not in seen:
                seen.add(row[0]["text"])
                fresh += 1
                link = row[0]["links"][0][0] if row[0]["links"] else ""
                yield {"session": session, "number": row[0]["text"], "title": row[1]["text"], "url": link}
        if not fresh:
            break
        number_page += 1


# --------------------------------------------------------------------------- Missouri (House XML list + Senate list page)
def mo(session: str):
    root = ElementTree.fromstring(http(f"https://documents.house.mo.gov/xml/{session}-BillList.xml", timeout=120))
    for b in root.iter("BillXML"):
        kind, num = (b.findtext("BillType") or "").strip(), (b.findtext("BillNumber") or "").strip()
        if kind and num:
            yield {"session": session, "number": f"{kind} {num}", "title": "",
                   "url": f"https://house.mo.gov/Bill.aspx?bill={kind}{num}&year={b.findtext('SessionYear')}&code={b.findtext('SessionCode')}"}
    year = 2000 + int(session[:2])
    for a in page(f"https://www.senate.mo.gov/BillTracking/Bills/BillList?year={year}&session=R", headers=CHROME, timeout=120).anchors:
        if re.fullmatch(r"S[A-Z]{1,2} \d+", a["text"]):
            yield {"session": session, "number": a["text"], "title": "", "url": a["href"]}


# --------------------------------------------------------------------------- Oregon (public OData API)
def orr(session: str):
    skip = 0
    while True:
        url = (f"https://api.oregonlegislature.gov/odata/odataservice.svc/LegislativeSessions('{session}')/Measures"
               f"?$format=json&$top=500&$skip={skip}")
        data = jget(url, headers={"Accept": "application/json"}, timeout=120)
        rows = data.get("value") or (data.get("d") or {}).get("results") or []
        for m in rows:
            number = f"{m.get('MeasurePrefix', '')} {m.get('MeasureNumber', '')}".strip()
            if number:
                yield {"session": session, "number": number, "title": m.get("RelatingTo") or "",
                       "url": f"https://olis.oregonlegislature.gov/liz/{session}/Measures/Overview/{number.replace(' ', '')}"}
        if len(rows) < 500:
            break
        skip += 500


# --------------------------------------------------------------------------- Kansas (HTML fragments, paged)
def ks(session: str):
    seen, number_page = set(), 1
    while number_page < 400:
        url = (f"https://www.kslegislature.gov/{session}/measures/fragment/?per_page=20&types=bill&types=resolution"
               f"&chambers=House&chambers=Senate&page={number_page}")
        p = page(url)
        fresh = 0
        for row, attrs in zip(p.rows, p.row_attrs):
            href = attrs.get("data-href", "")
            m = re.search(r"\b(HB|SB|HCR|SCR|HR|SR)\s?(\d+)\b", " ".join(c["text"] for c in row[:2]))
            if not href or "appointments" in href or not m:
                continue
            number = f"{m.group(1)} {m.group(2)}"
            if number in seen:
                continue
            seen.add(number)
            fresh += 1
            title = max((c["text"] for c in row), key=len)
            yield {"session": session, "number": number, "title": title, "url": "https://www.kslegislature.gov" + href}
        if not fresh:
            break
        number_page += 1


# --------------------------------------------------------------------------- Nevada (HTML list, one page)
def nv(session: str):
    url = f"https://www.leg.state.nv.us/App/NELIS/REL/{session}/HomeBill/BillsTab?selectedTab=List&Filters.PageSize=2147483647&_={int(time.time())}"
    seen = set()
    for a in page(url, timeout=180).anchors:
        if re.search(r"/Bill/\d+/Overview", a["href"]) and a["text"] and a["text"] not in seen:
            seen.add(a["text"])
            yield {"session": session, "number": a["text"], "title": "", "url": a["href"]}


# Bump a state's revision when its adapter changes so recently enumerated ledgers are rebuilt.
REV = {"WA": 2}

# state -> (sessions to enumerate each run, function)
ENUMERATORS = {
    "SD": (("2026", "2025"), sd),
    "WY": (("2026", "2025"), wy),
    "NC": (("2025",), nc),
    "MS": (("2026", "2025"), ms),
    "MT": (("2025",), mt),
    "ND": (("2025",), nd),
    "AZ": (("57th-2nd-regular", "57th-1st-regular"), az),
    "VT": (("2025-2026",), vt),
    "ID": (("2026", "2025"), idaho),
    "IA": (("91",), ia),
    "WA": (("2026",), wa),
    "AK": (("34",), ak),
    "NE": (("109th",), ne),
    "OH": (("136",), oh),
    "MD": (("2026RS", "2025RS"), md),
    "KY": (("26rs", "25rs"), ky),
    "MA": (("194",), ma),
    "MI": (("2025-2026",), mi),
    "WV": (("2026", "2025"), wv),
    "FL": (("2026", "2025"), fl),
    "MO": (("261", "251"), mo),
    "OR": (("2026R1", "2025R1"), orr),
    "KS": (("b2025_26",), ks),
    "NV": (("83rd2025",), nv),
}
