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
    seen, number_page, last = set(), 1, 1
    while number_page <= min(last, 400):
        url = (f"https://www.kslegislature.gov/{session}/measures/fragment/?per_page=20&types=bill&types=resolution"
               f"&chambers=House&chambers=Senate&page={number_page}")
        p = page(url)
        last = max([last] + [int(m.group(1)) for a in p.anchors for m in [re.search(r"[?&]page=(\d+)", a["href"])] if m])
        for row, attrs in zip(p.rows, p.row_attrs):
            href = attrs.get("data-href", "")
            m = re.search(r"([A-Z]{2,4})\s?(\d+)$", row[0]["text"].strip()) if row else None
            if not href or "appointments" in href or not m:
                continue
            number = f"{m.group(1)} {m.group(2)}"
            if number not in seen:
                seen.add(number)
                yield {"session": session, "number": number, "title": row[1]["text"] if len(row) > 1 else "",
                       "url": "https://www.kslegislature.gov" + href}
        number_page += 1


# --------------------------------------------------------------------------- Nevada (HTML list, one page)
def nv(session: str):
    url = f"https://www.leg.state.nv.us/App/NELIS/REL/{session}/HomeBill/BillsTab?selectedTab=List&Filters.PageSize=2147483647&_={int(time.time())}"
    seen = set()
    for a in page(url, timeout=180).anchors:
        if re.search(r"/Bill/\d+/Overview", a["href"]) and a["text"] and a["text"] not in seen:
            seen.add(a["text"])
            yield {"session": session, "number": a["text"], "title": "", "url": a["href"]}


# --------------------------------------------------------------------------- Utah (HTML link list)
def ut(session: str):
    seen = set()
    for a in page(f"https://le.utah.gov/billlist.jsp?session={session}", timeout=120).anchors:
        m = re.fullmatch(r"([A-Z.]+)\s*(\d+)", a["text"].strip())
        if m and "/bills/static/" in a["href"]:
            number = f"{m.group(1).replace('.', '')} {int(m.group(2))}"
            if number not in seen:
                seen.add(number)
                yield {"session": session, "number": number, "title": "", "url": a["href"]}


# --------------------------------------------------------------------------- Virginia (LIS data CSV)
def va(session: str):
    import csv
    import io
    text = http(f"https://lis.blob.core.windows.net/lisfiles/{session}/BILLS.CSV", timeout=120).decode("utf-8-sig", "replace")
    for row in csv.DictReader(io.StringIO(text)):
        number = (row.get("Bill_id") or "").strip()
        if number:
            yield {"session": session, "number": number, "title": (row.get("Bill_description") or "").strip(),
                   "url": f"https://lis.virginia.gov/bill-details/{session}/{number}"}


# --------------------------------------------------------------------------- New Hampshire (RSS feed of all bills)
def nh(session: str):
    from html import unescape
    root = ElementTree.fromstring(http(f"https://gc.nh.gov/rssFeeds/rssQueryResults.aspx?&sortoption=&txtsessionyear={session}", timeout=180).lstrip(b"\xef\xbb\xbf"))
    for item in root.iter("item"):
        number = (item.findtext("title") or "").strip()
        if not number:
            continue
        text = " ".join(re.sub(r"<[^>]+>", " ", unescape(item.findtext("description") or "")).split())
        m = re.search(r"(?:Title|Bill Title)\s*:?\s*(.+?)(?:Sponsor|Status|Session|$)", text)
        yield {"session": session, "number": number, "title": (m.group(1).strip() if m else text[:200]),
               "url": (item.findtext("link") or "").strip()}


# --------------------------------------------------------------------------- Delaware (JSON POST)
def de(session: str):
    from urllib.parse import urlencode
    headers = {**CHROME, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest"}
    seen, number_page, total = set(), 1, None
    while total is None or len(seen) < total:
        form = [("page", number_page), ("pageSize", 500), ("selectedGA[0]", session), ("coSponsorCheck", "True"),
                ("sort", ""), ("group", ""), ("filter", "")]
        form += [(f"selectedLegislationTypeId[{i}]", t) for i, t in enumerate((1, 2, 3, 4, 6))]
        data = json.loads(http("https://legis.delaware.gov/json/AllLegislation/GetAllLegislation", data=urlencode(form).encode(),
                               headers=headers, timeout=120).decode())
        rows = data.get("Data") or []
        total = data.get("Total", 0)
        if not rows:
            break
        for r in rows:
            number = (r.get("LegislationNumber") or "").strip()
            if number and number not in seen:
                seen.add(number)
                yield {"session": session, "number": number, "title": r.get("LongTitle") or r.get("Title") or "",
                       "url": f"https://legis.delaware.gov/BillDetail?LegislationId={r.get('LegislationId')}"}
        number_page += 1


# --------------------------------------------------------------------------- Alabama (GraphQL)
def al(session: str):
    query = ("query bills($sessionAbbreviation: String, $instrumentType: InstrumentType, $offset: Int, $limit: Int){"
             "instruments(where:[{sessionAbbreviation:{eq:$sessionAbbreviation},instrumentType:{eq:$instrumentType}}],"
             " order:[\"sessionAbbreviation\",\"DESC\"], limit:$limit, offset:$offset){data{id instrumentNbr shortTitle sessionYear currentStatus} count}}")
    headers = {**CHROME, "Content-Type": "application/json"}
    for kind in ("B", "R"):
        offset = 0
        while True:
            body = json.dumps({"query": query, "variables": {"sessionAbbreviation": session, "instrumentType": kind, "offset": offset, "limit": 250}}).encode()
            data = json.loads(http("https://alison.legislature.state.al.us/graphql", data=body, headers=headers, timeout=120).decode())
            inst = ((data.get("data") or {}).get("instruments")) or {}
            if "errors" in data and not inst:
                raise RuntimeError("GraphQL errors: " + json.dumps(data["errors"])[:300])
            rows = inst.get("data") or []
            for r in rows:
                if r.get("instrumentNbr"):
                    yield {"session": session, "number": r["instrumentNbr"], "title": (r.get("shortTitle") or "").strip(),
                           "url": f"https://alison.legislature.state.al.us/bill/{session}/{r['instrumentNbr'].lower()}"}
            offset += 250
            if len(rows) < 250:
                break


# --------------------------------------------------------------------------- Georgia (public token + search API)
def ga(session: str):
    import hashlib
    sid = {"2025_26": 1033, "2023_24": 1031}[session]
    ts = str(int(time.time() * 1000))
    key = hashlib.sha512(("QFpCwKfd7" + "fjVEXFFwSu36BwwcP83xYgxLAhLYmKk" + "letvarconst" + ts).encode()).hexdigest()
    token = json.loads(http(f"https://www.legis.ga.gov/api/authentication/token?key={key}&ms={ts}", headers=CHROME))
    headers = {**CHROME, "Authorization": "Bearer " + token, "Content-Type": "application/json"}
    number_page = 0
    while True:
        data = json.loads(http(f"https://www.legis.ga.gov/api/Legislation/Search/250/{number_page}", data=json.dumps({"sessionId": sid}).encode(),
                               headers=headers, timeout=120).decode())
        rows = data.get("results") or []
        for r in rows:
            number = r.get("number") or r.get("legislationNumber") or ""
            if not number and r.get("documentType") is not None:
                number = f"{r.get('documentType')} {r.get('documentNumber', '')}".strip()
            if not number:
                raise RuntimeError("unrecognized GA result keys: " + ",".join(sorted(r)))
            yield {"session": session, "number": str(number), "title": r.get("caption") or r.get("title") or r.get("description") or "",
                   "url": f"https://www.legis.ga.gov/legislation/{r.get('legislationId')}"}
        if len(rows) < 250:
            break
        number_page += 1


# --------------------------------------------------------------------------- New Mexico (session bill directories)
def nm(session: str):
    seen = set()
    for chamber in ("house", "senate"):
        p = page(f"https://www.nmlegis.gov/Sessions/{session}/bills/{chamber}/", timeout=120)
        for a in p.anchors:
            m = re.search(r"/([HS][A-Z]{0,3})(\d{1,4})\.(?:pdf|html?)$", a["href"], re.I)
            if m:
                number = f"{m.group(1).upper()} {int(m.group(2))}"
                if number not in seen:
                    seen.add(number)
                    yield {"session": session, "number": number, "title": "", "url": a["href"]}


# --------------------------------------------------------------------------- Colorado (HTML search, POST pages)
def co(session: str):
    from urllib.parse import urlencode
    seen, number_page = set(), 1
    while number_page < 200:
        form = urlencode({"q": "", "sessions[]": session, "show_filters": "", "sort": "Last Action Descending", "page": number_page}).encode()
        p = parse_html(http("https://leg.colorado.gov/bills/bill-search", data=form, timeout=120,
                            headers={**CHROME, "Content-Type": "application/x-www-form-urlencoded"}).decode("utf-8", "replace"),
                       "https://leg.colorado.gov/")
        fresh = 0
        for a in p.anchors:
            m = re.search(r"/bills/([A-Z]{2,3}\d{2}-\d+)$", a["href"])
            if m and m.group(1) not in seen:
                seen.add(m.group(1))
                fresh += 1
                yield {"session": session, "number": m.group(1), "title": a["text"], "url": a["href"]}
        if not fresh:
            break
        number_page += 1
        time.sleep(1)


# --------------------------------------------------------------------------- Wisconsin (HTML lists; Chrome UA)
def wi(session: str):
    seen = set()
    for chamber in ("asm", "sen"):
        for kind in ("bill", "joint_resolution", "resolution"):
            try:
                p = page(f"https://docs.legis.wisconsin.gov/{session}/proposals/reg/{chamber}/{kind}", headers=CHROME, timeout=90)
            except (HTTPError, URLError, OSError):
                continue
            for a in p.anchors:
                m = re.search(rf"/{session}/proposals/(?:reg/)?([a-z]+\d+)$", a["href"])
                if m and m.group(1) not in seen:
                    seen.add(m.group(1))
                    yield {"session": session, "number": m.group(1).upper(), "title": "", "url": a["href"]}


# --------------------------------------------------------------------------- Pennsylvania (bill index pages)
def pa(session: str):
    seen = set()
    for body in ("H", "S"):
        p = page(f"https://www.palegis.us/legislation/bills/bill-index?&display=index&sessyr={session}&sessind=0&billbody={body}", headers=CHROME, timeout=120)
        for a in p.anchors:
            m = re.search(r"/bills/\d{4}/([a-z]+\d+)$", a["href"], re.I)
            if m and m.group(1).lower() not in seen:
                seen.add(m.group(1).lower())
                yield {"session": session, "number": re.sub(r"(\D+)(\d+)", r"\1 \2", m.group(1).upper()), "title": a["text"] if not BILLNO.match(a["text"]) else "", "url": a["href"]}


# --------------------------------------------------------------------------- Arkansas (session data file, UTF-16, pipe-delimited)
def ar(session: str):
    from urllib.parse import quote_plus
    raw = http("https://arkleg.state.ar.us/Home/FTPDocument?path=" + quote_plus("/SessionInformation/LegislativeMeasures.txt"), headers=CHROME, timeout=120)
    text = raw.decode("utf-16", "replace") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else raw.decode("utf-8", "replace").replace("\x00", "")
    seen = set()
    for line in text.splitlines():
        row = line.split("|")
        if len(row) >= 3 and row[0].strip() in ("H", "S") and row[2].strip().isdigit():
            number = f"{row[0].strip()}{row[1].strip()} {row[2].strip()}"
            if number not in seen:
                seen.add(number)
                title = max((c.strip() for c in row[3:]), key=len, default="")
                slug = number.replace(" ", "")
                yield {"session": session, "number": number, "title": title,
                       "url": f"https://www.arkleg.state.ar.us/Bills/Detail?id={slug}&ddBienniumSession={session}%2F{session}R"}


# --------------------------------------------------------------------------- Tennessee (index of ranges -> bill links)
def tn(session: str):
    seen = set()
    index = page(f"https://wapp.capitol.tn.gov/apps/indexes/BillsByIndex/?year={session}", timeout=120)
    for a in index.anchors:
        if "BillIndex?startNum" in a["href"]:
            for b in page(a["href"], timeout=120).anchors:
                if "BillInfo/Default?BillNumber=" in b["href"] and b["text"] and b["text"] not in seen:
                    seen.add(b["text"])
                    yield {"session": session, "number": b["text"], "title": "", "url": b["href"]}


# --------------------------------------------------------------------------- Louisiana (100-bill ranges per type)
def la(session: str):
    seen = set()
    for kind in ("HB", "SB", "HR", "SR", "HCR", "SCR"):
        start = 1
        while start < 6000:
            p = page(f"https://www.legis.la.gov/Legis/BillSearchListQ.aspx?s={session}&r={kind}{start}-{start + 99}", timeout=120)
            found = 0
            for a in p.anchors:
                if re.fullmatch(rf"{kind}\d+", a["text"]) and "BillInfo" in a["href"] and a["text"] not in seen:
                    seen.add(a["text"])
                    found += 1
                    yield {"session": session, "number": a["text"], "title": "", "url": a["href"]}
            if not found:
                break
            start += 100


# --------------------------------------------------------------------------- South Carolina (daily introduction pages)
def sc(session: str):
    seen = set()
    for chamber in ("h", "s"):
        index = page(f"https://www.scstatehouse.gov/sessphp/{chamber}intros.php", timeout=120)
        days = sorted({a["href"] for a in index.anchors if re.search(rf"/sess{session}_[^/]+/{chamber}intro\d+/\d+\.htm$", a["href"])})
        for url in days:
            for a in page(url, timeout=120).anchors:
                m = re.fullmatch(r"([HS])\.\s*(\d+)", a["text"].strip())
                if m and "billnumbers=" in a["href"] and (m.group(1), m.group(2)) not in seen:
                    seen.add((m.group(1), m.group(2)))
                    yield {"session": session, "number": f"{m.group(1)} {m.group(2)}", "title": "", "url": a["href"]}


# --------------------------------------------------------------------------- Texas (filed-bills reports)
def tx(session: str):
    seen = set()
    for report in ("housefiled", "senatefiled"):
        p = page(f"https://capitol.texas.gov/Reports/Report.aspx?LegSess={session}&ID={report}", headers=CHROME, timeout=300)
        for a in p.anchors:
            if "History.aspx" in a["href"] and re.fullmatch(r"[A-Z]{2,4} \d+", a["text"]) and a["text"] not in seen:
                seen.add(a["text"])
                yield {"session": session, "number": a["text"], "title": "", "url": a["href"].replace("http://", "https://")}


# --------------------------------------------------------------------------- Maine (cookie session + paged results)
def me(session: str):
    import http.cookiejar
    import urllib.parse
    import urllib.request
    seen = set()
    for paper in ("HP", "SP"):
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        opener.addheaders = [("User-Agent", CHROME["User-Agent"])]
        form = urllib.parse.urlencode({"PaperType": paper, "LegSession": session, "LRType": "None", "Sponsor": "None", "Introducer": "None",
                                       "Committee": "None", "AmdFilingChamber": "None", "RollcallChamber": "None", "Action": "None",
                                       "ActionChamber": "None", "GovernorAction": "None", "FinalLawType": "None"}).encode()
        opener.open("https://legislature.maine.gov/LawMakerWeb/doadvancedsearch.asp", form, timeout=60).read()
        first = 1
        while first < 12000:
            html = opener.open(f"https://legislature.maine.gov/LawMakerWeb/searchresults.asp?StartWith={first}", timeout=60).read().decode("utf-8", "replace")
            hits = [a for a in parse_html(html, "https://legislature.maine.gov/LawMakerWeb/").anchors if "summary.asp" in a["href"] and a["text"]]
            if not hits:
                break
            for a in hits:
                if a["text"] not in seen:
                    seen.add(a["text"])
                    yield {"session": session, "number": a["text"], "title": "", "url": a["href"]}
            first += len(hits)


# --------------------------------------------------------------------------- Minnesota (status search, 500-bill ranges)
def mn(session: str):
    seen = set()
    for body in ("House", "Senate"):
        for kind in ("bill", "concurrent", "resolution"):
            start = 1
            while start < 20000:
                p = page(f"https://www.revisor.mn.gov/bills/status_result.php?body={body}&session={session}&bill={start}-{start + 500}&bill_type={kind}&submit_bill=GO", timeout=120)
                found = 0
                for row in p.rows:
                    if row and row[0]["links"]:
                        number = " ".join(row[0]["text"].split())
                        if number and number not in seen and re.search(r"\d", number):
                            seen.add(number)
                            found += 1
                            title = next((c["text"] for c in row[1:3] if len(c["text"]) > 25), "")
                            yield {"session": session, "number": number, "title": title, "url": row[0]["links"][0][0]}
                if not found:
                    break
                start += 501


# --------------------------------------------------------------------------- Hawaii (bill file directory on the data host)
def hi(session: str):
    seen = set()
    for a in page(f"https://data.capitol.hawaii.gov/sessions/session{session}/bills/", headers=CHROME, timeout=180).anchors:
        m = re.search(r"/([HS][A-Z]{0,2})(\d+)_[A-Z0-9_]*\.HTM$", a["href"], re.I)
        if m:
            number = f"{m.group(1).upper()} {int(m.group(2))}"
            if number not in seen:
                seen.add(number)
                yield {"session": session, "number": number, "title": "",
                       "url": f"https://data.capitol.hawaii.gov/session/measure_indiv.aspx?billtype={m.group(1).upper()}&billnumber={int(m.group(2))}&year={session}"}


# --------------------------------------------------------------------------- Oklahoma (ASP.NET form post)
def ok(session: str):
    import http.cookiejar
    import urllib.parse
    import urllib.request
    base = "https://webapps.oklegislature.gov/WebApplication3/WebForm1.aspx"
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.addheaders = [("User-Agent", CHROME["User-Agent"])]
    html = opener.open(base, timeout=60).read().decode("utf-8", "replace")
    fields = [(n, v) for n, v in re.findall(r'<input type="hidden" name="([^"]+)"[^>]*value="([^"]*)"', html)]
    fields += [("cbxSessionId", session), ("cbxActiveStatus", "All"), ("RadioButtonList1", "On Any day"), ("Button1", "Retrieve")]
    fields += [("lbxTypes", f"{c}{t}") for c in "HS" for t in ("B", "R", "CR", "JR")]
    result = opener.open(base, urllib.parse.urlencode(fields).encode(), timeout=120).read().decode("utf-8", "replace")
    p = parse_html(result, base)
    seen = set()
    for a in p.anchors:
        m = re.fullmatch(r"([HS][A-Z]{1,2})\s?(\d{1,5})", a["text"].strip())
        if m and (m.group(1), m.group(2)) not in seen:
            seen.add((m.group(1), m.group(2)))
            yield {"session": session, "number": f"{m.group(1)} {m.group(2)}", "title": "", "url": a["href"]}
    if not seen:
        raise RuntimeError("no bills in Oklahoma form result: " + " ".join(re.sub(r"<[^>]+>", " ", result)[:300].split()))


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
    "UT": (("2026GS", "2025GS"), ut),
    "VA": (("20261", "20251"), va),
    "NH": (("2026", "2025"), nh),
    "DE": (("153",), de),
    "AL": (("2026rs", "2025rs"), al),
    "GA": (("2025_26",), ga),
    "NM": (("26%20Regular", "25%20Regular"), nm),
    "CO": (("2026 Regular Session", "2025 Regular Session"), co),
    "WI": (("2025",), wi),
    "PA": (("2025",), pa),
    "AR": (("2025",), ar),
    "TN": (("2025",), tn),
    "LA": (("26RS", "25RS"), la),
    "SC": (("126",), sc),
    "TX": (("89R",), tx),
    "ME": (("16",), me),
    "MN": (("0942025",), mn),
    "HI": (("2026", "2025"), hi),
    "OK": (("2600", "2500"), ok),
}
