#!/usr/bin/env python3
"""Retrieve primary legislative/regulatory text before AI summarization.

Never substitute bill titles or metadata for operative bill provisions.
Fetch state official source pages, govinfo introduced bills, or Federal Register
rulemaking text. Unavailable full text is recorded as a coverage gap.
"""
import html
import base64
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlparse, quote, parse_qs, unquote
from urllib.request import Request,urlopen
from openstates_rate import open_json

class Extract(HTMLParser):
    def __init__(self): super().__init__();self.words=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ("script","style","nav","footer"):self.skip+=1
        if tag in ("p","section","li","tr","br"):self.words.append(" ")
    def handle_endtag(self,tag):
        if tag in ("script","style","nav","footer") and self.skip:self.skip-=1
    def handle_data(self,data):
        if not self.skip:self.words.append(data)

def clean(raw):
    return " ".join(html.unescape(raw).split())

def fetch(url):
    if not url.startswith("https://"):return "","not_https"
    host=(urlparse(url).hostname or "").lower()
    if not (host.endswith(".gov") or host.endswith(".us") or host in ("govinfo.gov","www.govinfo.gov","congress.gov","www.congress.gov")):
        return "","non_government_host"
    try:
        req=Request(url,headers={"User-Agent":"AVObservatory/1.0 (+https://av-observatory.com/)","Accept":"text/html,application/pdf,text/plain"})
        with urlopen(req,timeout=25) as response:
            data=response.read(2_500_000)
            kind=response.headers.get("Content-Type","").lower()
            actual=(response.url or urlparse(url).geturl())
            redirect_host=(urlparse(actual).hostname or "").lower()
            if not actual.startswith("https://") or not (redirect_host.endswith(".gov") or redirect_host.endswith(".us")):
                return "","redirect_outside_government"
        if "pdf" in kind or data.startswith(b"%PDF"):
            with tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp)/"bill.pdf";p.write_bytes(data)
                q=subprocess.run(["pdftotext","-layout",str(p),"-"],capture_output=True,timeout=18)
                return (clean(q.stdout.decode("utf-8","replace"))[:180000],"official_pdf") if q.returncode==0 else ("","pdf_extract_failed")
        source=data.decode("utf-8","replace")
        if "html" in kind or "<html" in source[:2000].lower():
            parser=Extract();parser.feed(source)
            text=clean(" ".join(parser.words))
            # Do not accept a portal page, cookie notice, or navigation as bill text.
            return (text[:180000],"official_html") if len(text)>=650 else ("","insufficient_official_html")
        return (clean(source)[:180000],"official_plaintext") if len(source)>=500 else ("","insufficient_official_text")
    except Exception as e:
        return "",type(e).__name__

def api_json(url,key=None):
    headers={"User-Agent":"AVObservatory/1.0 (+https://av-observatory.com/)"}
    if key:headers["X-API-KEY"]=key
    request=Request(url,headers=headers)
    if (urlparse(url).hostname or "").lower()=="v3.openstates.org":
        return open_json(request,timeout=24)
    with urlopen(request,timeout=24) as response:
        return json.load(response)

def state_bill_version_links(row):
    key=os.getenv("OPENSTATES_API_KEY")
    oid=str(row.get("openstates_id") or "")
    if not key or not oid.startswith("ocd-bill/"):return []
    try:
        from urllib.parse import urlencode
        url="https://v3.openstates.org/bills/"+oid+"?"+urlencode({"include":["versions","documents"]},doseq=True)
        bill=api_json(url,key)
        links=[]
        for category in ("versions","documents"):
            versions=bill.get(category) or []
            for document in reversed(versions):
                for item in document.get("links") or []:
                    link=item.get("url") if isinstance(item,dict) else item
                    if isinstance(link,str) and link.startswith("https://"):
                        links.append(link)
        return links
    except Exception as exc:
        print(f"Open States versions lookup failed for {row.get('id')}: {type(exc).__name__} {getattr(exc, 'code', '')}")
        return []

def federal_register_text_url(row):
    url=row.get("source_url") or ""
    m=re.search(r"([12][0-9]{3}-[0-9]{4,6})",url)
    if not m:return ""
    try:
        doc=api_json("https://www.federalregister.gov/api/v1/documents/"+m.group(1)+".json")
        return doc.get("raw_text_url") or doc.get("full_text_xml_url") or doc.get("html_url") or ""
    except Exception as exc:
        print(f"Federal Register text lookup failed for {row.get('id')}: {type(exc).__name__}")
        return ""

def california_bill_url(row):
    if row.get("jurisdiction")!="CA":return ""
    session=str(row.get("session") or "")
    identifier=str(row.get("number") or "")
    m=re.fullmatch(r"(AB|SB)\s*(\d{1,4})",identifier,re.I)
    if not re.fullmatch(r"\d{8}",session) or not m:return ""
    bill_id=session+"0"+m.group(1).upper()+m.group(2).zfill(4)
    return "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id="+bill_id

def sources(row,kind):
    url=row.get("source_url") or ""
    repository=row.get("repository_url") or ""
    if kind=="federal_bill":
        m=re.search(r"/details/(BILLS-[A-Za-z0-9-]+)$",repository)
        if m:
            pkg=m.group(1)
            yield f"https://www.govinfo.gov/content/pkg/{pkg}/html/{pkg}.htm"
        yield url
    elif kind=="fmvss":
        full=federal_register_text_url(row)
        if full:yield full
        yield url
    else:
        california=california_bill_url(row)
        if california:yield california
        yield from state_bill_version_links(row)
        yield url

def looks_like_bill_text(row,text):
    """Reject state search portals and unrelated legislation as source evidence."""
    identifier=str(row.get("number") or "")
    numbers=re.findall(r"\d+",identifier)
    if not numbers:return False
    n=numbers[-1]
    # Identifier plus bill language and AV subject indicates bill-specific text;
    # bill text with 'Assembly Bill No. 2193' and 'HB 222' both qualify.
    has_number=bool(re.search(r"(?<!\d)"+re.escape(n)+r"(?!\d)",text))
    has_bill=bool(re.search(r"\b(?:senate|house|assembly|bill|act|legislature)\b",text,re.I))
    has_topic=bool(re.search(r"\b(?:autonomous|automated driving|driverless|self-driving|robotaxi)\b",text,re.I))
    return has_number and has_bill and has_topic


def discover_official_bill_links(row):
    """Recovery search by jurisdiction, session, identifier and title.

    Search results are *candidates*, never evidence: fetch() enforces a government
    host, and looks_like_bill_text() checks the identifier and AV relevance.
    """
    from xml.etree import ElementTree
    from urllib.parse import urlencode
    jurisdiction=str(row.get("jurisdiction") or "")
    identifier=str(row.get("number") or "")
    session=str(row.get("session") or "")
    title=" ".join(str(row.get("title") or "").split())[:110]
    if not identifier or not jurisdiction:
        return []
    queries=[
        f'{jurisdiction} legislature "{identifier}" "{session}" autonomous vehicle bill text',
        f'{jurisdiction} "{identifier}" "{title}" legislation',
    ]
    candidates=[]
    seen=set()
    for query in queries:
        url="https://www.bing.com/search?"+urlencode({"q":query,"format":"rss"})
        try:
            req=Request(url,headers={"User-Agent":"Mozilla/5.0 AVObservatoryResearch/1.0"})
            with urlopen(req,timeout=14) as response:
                xml=response.read(180000)
            root=ElementTree.fromstring(xml)
            for link in root.findall(".//item/link"):
                href=(link.text or "").strip()
                host=(urlparse(href).hostname or "").lower()
                if href.startswith("https://") and (host.endswith(".gov") or host.endswith(".us")) and href not in seen:
                    seen.add(href)
                    candidates.append(href)
        except Exception as exc:
            print(f"Official-record search failed for {row.get('id')}: {type(exc).__name__}")
    return candidates[:10]

def search_public_sources(row,kind):
    """Search for an exact record using a public web index, without vendor API keys.

    Search results are leads only. Every candidate is fetched and screened
    before it may be used as AI evidence.
    """
    from xml.etree import ElementTree
    from urllib.parse import urlencode
    ident=str(row.get("number") or row.get("id") or row.get("code") or "").strip()
    if kind.startswith("nhtsa_"):
        ident=str(row.get("id") or "")
        queries=[f'site:static.nhtsa.gov/odi/inv/ "{ident}"',
                 f'site:nhtsa.gov "{ident}" investigation recall']
    elif kind=="state_bill":
        state=str(row.get("jurisdiction") or "")
        session=str(row.get("session") or "")
        number=str(row.get("number") or "")
        title=str(row.get("title") or "")
        queries=[f'{state} "{number}" "{session}" bill text autonomous vehicles',
                 f'{state} "{number}" "{title}"']
    else:
        title=str(row.get("title") or row.get("name") or ident)
        jurisdiction=str(row.get("jurisdiction") or "")
        queries=[f'"{title}" autonomous vehicle regulation official',
                 f'"{ident}" "{jurisdiction}" automated vehicles order']
    seen=set()
    for query in queries:
        try:
            url="https://www.bing.com/search?"+urlencode({"q":query,"format":"rss"})
            req=Request(url,headers={"User-Agent":"Mozilla/5.0"})
            with urlopen(req,timeout=12) as response:
                root=ElementTree.fromstring(response.read(180000))
            for node in root.findall(".//item/link"):
                candidate=(node.text or "").strip()
                host=(urlparse(candidate).hostname or "").lower()
                if (candidate.startswith("https://") and candidate not in seen
                        and (host.endswith(".gov") or host.endswith(".us")
                             or host=="calmatters.digitaldemocracy.org")):
                    seen.add(candidate)
                    yield candidate
                    if len(seen)>=12:return
        except Exception as exc:
            print(f"Web discovery failed for {ident}: {type(exc).__name__}",flush=True)


def evidence_matches(row,kind,text):
    """Prevent a search hit for another session, record, or agency being accepted."""
    if len(text)<450:return False
    if kind=="state_bill":
        if not looks_like_bill_text(row,text):return False
        session=str(row.get("session") or "")
        years=re.findall(r"20\\d{2}",session)
        if years and not any(year in text for year in years):return False
        return True
    if kind.startswith("nhtsa_"):
        ident=str(row.get("id") or "")
        return bool(ident and re.search(r"(?<![A-Z0-9])"+re.escape(ident)+r"(?![A-Z0-9])",text,re.I))
    title=str(row.get("title") or row.get("name") or "")
    terms=set(re.findall(r"[a-z]{5,}",title.lower()))-{"state","vehicle","vehicles","autonomous","regulations"}
    matched=sum(bool(re.search(r"\b"+re.escape(term)+r"\b",text,re.I)) for term in terms)
    return matched>=min(2,len(terms)) if terms else False


def primary_text(row,kind):
    for url in sources(row,kind):
        text,provenance=fetch(url)
        if len(text)>=650 and (kind!="state_bill" or looks_like_bill_text(row,text)):
            return text,provenance,url
    if kind=="state_bill":
        for url in discover_official_bill_links(row):
            text,provenance=fetch(url)
            if len(text)>=650 and looks_like_bill_text(row,text):
                return text,provenance,url
    for url in search_public_sources(row,kind):
        # CalMatters pages are secondary evidence, never labeled official.
        if (urlparse(url).hostname or "").lower()=="calmatters.digitaldemocracy.org":
            try:
                req=Request(url,headers={"User-Agent":"Mozilla/5.0"})
                with urlopen(req,timeout=20) as response:raw=response.read(2_500_000).decode("utf-8","replace")
                parser=Extract();parser.feed(raw)
                text=clean(" ".join(parser.words))
                provenance="public_secondary_bill_page"
            except Exception:continue
        else:
            text,provenance=fetch(url)
        if evidence_matches(row,kind,text):
            return text,provenance,url
    return "","automated_search_exhausted",""
