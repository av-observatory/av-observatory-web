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
    try:  # second chance: browser-like request
        data = http(url, tries=1, timeout=40, headers=CHROME)
    except Exception as exc:
        return "", f"{kind}/{_status(exc)}"
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


def is_bill_page(text: str, number: str, title: str = "") -> bool:
    """A fetched page only counts as the bill when it carries the bill's number or the start of its title
    (guards against JavaScript shells, error pages and the like being read as 'no AV words')."""
    flat = _norm(text)
    digits = re.sub(r"\D", "", number)
    if title and len(_norm(title)) >= 12 and _norm(title)[:30] in flat:
        return True
    num = _norm(number)
    return bool(num) and num in flat and bool(digits)
