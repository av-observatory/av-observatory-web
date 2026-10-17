"""Bill-page fetch for the AV text screen."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bill_enumerators import CHROME, http  # noqa: E402
from legislation_source_text import fetch  # noqa: E402


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
        kind = type(exc).__name__
    try:  # second chance: browser-like request, plain-text the HTML
        body = http(url, tries=1, timeout=25, headers=CHROME).decode("utf-8", "replace")
        body = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", body)
        text = " ".join(re.sub(r"<[^>]+>", " ", body).split())
    except Exception as exc:
        return "", f"{kind}/{type(exc).__name__}"
    return (text, "browser_html") if len(text) >= 200 else ("", f"{kind}/short_page")
