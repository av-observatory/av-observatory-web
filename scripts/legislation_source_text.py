#!/usr/bin/env python3
"""Retrieve primary legislative/regulatory text before AI summarization.

Never substitute bill titles or metadata for operative bill provisions.
Fetch state official source pages, govinfo introduced bills, or Federal Register
rulemaking text. Unavailable full text is recorded as a coverage gap.
"""
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlparse
from urllib.request import Request,urlopen

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
            if not actual.startswith("https://"):return "","redirect_non_https"
        if "pdf" in kind or data.startswith(b"%PDF"):
            with tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp)/"bill.pdf";p.write_bytes(data)
                q=subprocess.run(["pdftotext","-layout",str(p),"-"],capture_output=True,timeout=18)
                return (clean(q.stdout.decode("utf-8","replace"))[:32000],"official_pdf") if q.returncode==0 else ("","pdf_extract_failed")
        source=data.decode("utf-8","replace")
        if "html" in kind or "<html" in source[:2000].lower():
            parser=Extract();parser.feed(source)
            text=clean(" ".join(parser.words))
            # Do not accept a portal page, cookie notice, or navigation as bill text.
            return (text[:32000],"official_html") if len(text)>=650 else ("","insufficient_official_html")
        return (clean(source)[:32000],"official_plaintext") if len(source)>=500 else ("","insufficient_official_text")
    except Exception as e:
        return "",type(e).__name__

def api_json(url,key=None):
    headers={"User-Agent":"AVObservatory/1.0 (+https://av-observatory.com/)"}
    if key:headers["X-API-KEY"]=key
    with urlopen(Request(url,headers=headers),timeout=24) as response:
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
        print(f"Open States versions lookup failed for {row.get('id')}: {type(exc).__name__}")
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
        yield from state_bill_version_links(row)
        yield url

def primary_text(row,kind):
    for url in sources(row,kind):
        text,provenance=fetch(url)
        if len(text)>=650:
            return text,provenance,url
    return "","official_text_unavailable",""
