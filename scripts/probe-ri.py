#!/usr/bin/env python3
"""Show the raw text RI's bill-range search returns for two bills."""
import http.cookiejar, re, sys, urllib.parse, urllib.request
from pathlib import Path
sys.path.insert(0, Path(__file__).parent.as_posix())
from bill_enumerators import CHROME

base = "https://status.rilegislature.gov/"
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
opener.addheaders = [("User-Agent", CHROME["User-Agent"])]
html = opener.open(base, timeout=60).read().decode("utf-8", "replace")
form = {n: v for n, v in re.findall(r'<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"', html)}
form.update({"__EVENTTARGET": "", "__EVENTARGUMENT": "", "__LASTFOCUS": "", "ctl00$rilinContent$cbYear": "2025",
             "ctl00$rilinContent$txtBillFrom": "5017", "ctl00$rilinContent$txtBillTo": "5019"})
result = opener.open(base, urllib.parse.urlencode(form).encode(), timeout=120).read().decode("utf-8", "replace")
print("RAW LEN", len(result))
i = result.find("5017")
print("RAW SNIPPET:", re.sub(r"\s+", " ", result[max(0, i - 300):i + 2500]))
print("LINKS:", re.findall(r'href="([^"]*(?:bill|Bill|text|pdf)[^"]*)"', result)[:15])
