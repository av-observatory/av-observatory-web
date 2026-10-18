"""Bill-page fetch for the AV text screen."""
import re
import socket
import subprocess
import sys
import tempfile
import threading
import time
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


# Bump when scan_fetch/is_bill_page change in a way that can fix earlier failures: failed rows stamped with an older value are read again.
SCAN_REV = 2
CURL = {"User-Agent": "curl/8.5.0", "Accept": "*/*"}
# Hosts that rate-limit or block by identity: (minimum seconds between requests, first-choice headers, tries).
# nysenate.gov refuses browser identities (403) and answers 429 when hit in parallel, so it gets one request at a time with backoff.
# palegis.us needs the browser identity (curl gets 403) and stalls for minutes when hit by many parallel clients, so it is paced too.
HOST_POLICY = {"www.nysenate.gov": (1.2, CURL, 5), "nysenate.gov": (1.2, CURL, 5), "www.palegis.us": (0.5, CHROME, 3)}
_gap_lock = threading.Lock()
_next_slot: dict = {}
# Circuit breaker: a host that times out repeatedly is skipped for a while instead of burning minutes of timeouts per row.
_TRIP_AFTER, _COOLDOWN = 6, 120
_breaker: dict = {}  # host -> [consecutive timeouts, skip until (monotonic)]
SKIPPED = "host_unreachable_skipped"


def _wait_turn(host: str, gap: float) -> None:
    with _gap_lock:
        now = time.monotonic()
        slot = max(now, _next_slot.get(host, 0.0))
        _next_slot[host] = slot + gap
    if slot > now:
        time.sleep(slot - now)


def _is_timeout(exc: Exception) -> bool:
    reason = getattr(exc, "reason", exc)
    return isinstance(reason, (TimeoutError, socket.timeout, ConnectionError)) or "timed out" in str(reason).lower()


def _note(host: str, timed_out: bool) -> None:
    with _gap_lock:
        state = _breaker.setdefault(host, [0, 0.0])
        if not timed_out:
            state[0] = 0
            return
        state[0] += 1
        if state[0] >= _TRIP_AFTER:
            state[1] = time.monotonic() + _COOLDOWN
            state[0] = _TRIP_AFTER - 1  # half-open: one more timeout after the cooldown trips it again at once


def resolve_indirect(url: str) -> str:
    """Some sources name a bill's text only through an index call; return the URL of the latest text version (or the URL itself)."""
    if url.startswith("https://apps.azleg.gov/api/DocType/"):  # Arizona: [{Documents:[{HtmlPath}, ...]}] listed oldest to newest
        import json
        try:
            groups = json.loads(http(url, tries=2, timeout=40, headers=CHROME).decode("utf-8", "replace"))
        except Exception:
            return url
        paths = [d.get("HtmlPath") for g in groups for d in (g.get("Documents") or []) if d.get("HtmlPath")]
        return paths[-1] if paths else url
    return url


def scan_fetch(url: str):
    """Fetch a bill page for the AV text screen: tidy the URL, upgrade http, retry with a browser UA. Returns (text, kind)."""
    from urllib.parse import quote, urlsplit, urlunsplit
    url = resolve_indirect(url)
    parts = urlsplit(url.replace(" ", "%20"))
    if parts.scheme == "http":
        parts = parts._replace(scheme="https")
    host = parts.hostname or ""
    url = urlunsplit(parts._replace(path=quote(parts.path, safe="/%:~@!$&'()*+,;=-._")))
    if _breaker.get(host, [0, 0.0])[1] > time.monotonic():
        return "", SKIPPED
    gap, first_headers, tries = HOST_POLICY.get(host, (0.0, None, 1))
    kind = "unknown"
    if not first_headers:
        try:
            text, kind = fetch(url)
            if text:
                _note(host, False)
                return text, kind
        except Exception as exc:
            kind = _status(exc)
    data = None
    tried = []
    for headers in ([first_headers] if first_headers else []) + [CHROME, CURL]:  # browser UA, then curl UA (some CDNs only block the first)
        if headers in tried:
            continue
        tried.append(headers)
        if gap:
            _wait_turn(host, gap)
        try:
            data = http(url, tries=tries, timeout=40, headers=headers)
            _note(host, False)
            break
        except Exception as exc:
            kind = f"{kind}/{_status(exc)}"
            if _is_timeout(exc):  # another identity will not help a host that does not answer
                _note(host, True)
                break
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


_KINDS = {"B": "Bill", "R": "Resolution", "JR": "Joint Resolution", "CR": "Concurrent Resolution", "JM": "Joint Memorial",
          "CM": "Concurrent Memorial", "M": "Memorial", "GA": "Gubernatorial Appointment"}


def is_bill_page(text: str, number: str, title: str = "") -> bool:
    """A fetched page only counts as the bill when it carries the bill's number (in any common spelling) or the
    start of its title (guards against JavaScript shells, error pages and the like being read as 'no AV words')."""
    if title and len(_norm(title)) >= 12 and _norm(title)[:30] in _norm(text):
        return True
    number = re.sub(r"^\s*E?\d?(?=S{0,2}[HS][BJCMR])", "", (number or "").upper())  # WA engrossed/substitute prefixes: E2SHB 1170 -> SHB 1170, 2SSB 5001 -> SSB 5001
    m = re.match(r"\s*([A-Z]+)[\s._-]*0*(\d+)", number)
    if not m:
        return False
    letters, digits = m.group(1), m.group(2)
    letters = re.sub(r"^S{1,2}(?=[HS][BJCMR][A-Z]?$)", "", letters)  # substitute prefixes: SHB -> HB, SSB -> SB
    spaced = r"[\s._-]*".join(re.escape(c) for c in letters)
    if re.search(rf"(?<![A-Za-z]){spaced}[\s._-]*(?:No\.?\s*)?0*{digits}(?!\d)", text, re.I):
        return True
    if letters in ("HB", "SB", "AB") and re.search(rf"(?<![A-Za-z]){letters[0]}[\s._-]*0*{digits}(?!\d)", text):  # "H 5017" style headers
        return True
    if letters in ("H", "S", "A"):
        # House/Senate/Assembly Bill, Resolution, Joint/Concurrent Resolution or Memorial (NC and others share one number series)
        return bool(re.search(rf"{_WORDS[letters]}\s+(?:Joint\s+|Concurrent\s+)?(?:Bill|Resolution|Memorial)\s*(?:No\.?\s*)?0*{digits}(?!\d)", text, re.I))
    if len(letters) >= 2 and letters[0] in _WORDS and letters[1:] in _KINDS:
        return bool(re.search(rf"{_WORDS[letters[0]]}\s+{_KINDS[letters[1:]]}\s*(?:No\.?\s*)?0*{digits}(?!\d)", text, re.I))
    return False
