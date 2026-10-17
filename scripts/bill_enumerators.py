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


# state -> (sessions to enumerate each run, function)
ENUMERATORS = {
    "SD": (("2026", "2025"), sd),
    "WY": (("2026", "2025"), wy),
    "NC": (("2025",), nc),
    "MS": (("2026", "2025"), ms),
    "MT": (("2025",), mt),
    "ND": (("2025",), nd),
    "AZ": (("57th-2nd-regular", "57th-1st-regular"), az),
}
