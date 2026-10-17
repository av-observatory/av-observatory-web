"""Bill-page fetch for the AV text screen."""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bill_enumerators import CHROME, http  # noqa: E402
from legislation_source_text import fetch  # noqa: E402


def _pdf_text(data: bytes) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "bill.pdf"
        path.write_bytes(data)
        out = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, timeout=60)
    return " ".join(out.stdout.decode("utf-8", "replace").split())[:180000]


def _status(exc: Exception) -> str:
    return f"{type(exc).__name__}{getattr(exc, 'code', '')}"


def scan_fetch(url: str):
    """Fetch a bill page for the AV text screen: tidy the URL, upgrade http, retry with a browser UA. Returns (text, kind)."""
    from urllib.parse import quote, urlsplit, urlunsplit
    parts = urlsplit(url.replace(" ", "%20"))
    if parts.scheme == "http":
        parts = parts._replace(scheme="https")
    url = urlunsplit(parts._replace(path=quote(parts.path, safe="/%:~@!$&'()*+,;=-._")))
    kind = "unknown"
    try:
        text, kind = fetch(url)
        if text:
            return text, kind
    except Exception as exc:
        kind = _status(exc)
    data = None
    for headers in (CHROME, {"User-Agent": "curl/8.5.0", "Accept": "*/*"}):  # second chance: browser UA, then curl UA (some CDNs only block the first)
        try:
            data = http(url, tries=1, timeout=40, headers=headers)
            break
        except Exception as exc:
            kind = f"{kind}/{_status(exc)}"
    if data is None:
        return "", kind
    if data[:5] == b"%PDF-":
        try:
            text = _pdf_text(data)
        except Exception as exc:
            return "", f"{kind}/pdf_{type(exc).__name__}"
        return (text, "browser_pdf") if text else ("", f"{kind}/pdf_empty")
    body = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", data.decode("utf-8", "replace"))
    text = " ".join(re.sub(r"<[^>]+>", " ", body).split())
    return (text, "browser_html") if len(text) >= 200 else ("", f"{kind}/short_page")


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


_WORDS = {"H": "House", "S": "Senate", "A": "Assembly"}


def is_bill_page(text: str, number: str, title: str = "") -> bool:
    """A fetched page only counts as the bill when it carries the bill's number (in any common spelling) or the
    start of its title (guards against JavaScript shells, error pages and the like being read as 'no AV words')."""
    if title and len(_norm(title)) >= 12 and _norm(title)[:30] in _norm(text):
        return True
    m = re.match(r"\s*\d*([A-Za-z]+)[\s._-]*0*(\d+)", number or "")
    if not m:
        return False
    letters, digits = m.group(1).upper(), m.group(2)
    letters = re.sub(r"^(?:E?S{1,2}|E)(?=[HS][BJCM][A-Z]?$)", "", letters)  # WA substitute/engrossed prefixes: ESHB -> HB, 2SSB -> SB
    spaced = r"[\s._-]*".join(re.escape(c) for c in letters)
    if re.search(rf"(?<![A-Za-z]){spaced}[\s._-]*(?:No\.?\s*)?0*{digits}(?!\d)", text, re.I):
        return True
    if letters in ("HB", "SB", "AB") and re.search(rf"(?<![A-Za-z]){letters[0]}[\s._-]*0*{digits}(?!\d)", text):  # "H 5017" style headers
        return True
    if letters in ("H", "S", "A"):
        return bool(re.search(rf"{_WORDS[letters]}\s+Bill\s*(?:No\.?\s*)?0*{digits}(?!\d)", text, re.I))
    kind = {"B": "Bill", "R": "Resolution"}.get(letters[-1], "")
    if len(letters) >= 2 and kind and letters[0] in _WORDS:
        mid = {"CR": "Concurrent Resolution", "JR": "Joint Resolution", "R": "Resolution", "B": "Bill"}
        tail = mid.get(letters[1:], mid.get(letters[-2:], kind))
        return bool(re.search(rf"{_WORDS[letters[0]]}\s+{tail}\s*(?:No\.?\s*)?0*{digits}(?!\d)", text, re.I))
    return False
