"""Shared editorial quality gate for NHTSA investigation and recall feeds.

Always produce a brief independently of the data source. Preserve full official
language separately and retain only a verified short summary for display.
"""
import re

ACRONYMS = {
    "ODI": "NHTSA",
    "ADS": "automated driving system",
    "ADAS": "driver-assistance system",
    "AV": "automated vehicle",
    "AVs": "automated vehicles",
    "FSD": "Full Self-Driving",
    "FMVSS": "federal vehicle safety standards",
    "SGO": "NHTSA crash-reporting",
}
BOILERPLATE = (
    "report id", "listed below", "refer to", "office of defects investigation has received",
    "this opening resume", "in order to determine", "for the purpose of",
    "this will include an assessment", "if additional evidence",
)
MAX_WORDS = 58
MAX_CHARS = 380
def plain(value):
    value = re.sub(r"https?://\\S+", "", value or "")
    value = re.sub(r"\\b\\d{5}-\\d{4,}(?:-\\d+)*\\b", "", value)
    for acronym, expansion in ACRONYMS.items():
        value = re.sub(r"\\b"+re.escape(acronym)+r"\\b", expansion, value)
    value = re.sub(r"\\s+", " ", value).strip(" ,;:-")
    return value

def sentences(text):
    text = plain(text)
    return [s.strip() for s in re.split(r"(?<=[.!?])\\s+(?=[A-Z])", text) if s.strip()]

def editorial_brief(kind, subject, source_text, company):
    """Source-limited and deterministic, never a full regulatory-text dump."""
    subject = plain(subject).rstrip(".")
    source = sentences(source_text)
    candidates = []
    for sentence in source:
        low = sentence.lower()
        if any(phrase in low for phrase in BOILERPLATE):
            continue
        if len(sentence.split()) < 5 or len(sentence) > 380:
            continue
        if re.search(r"\\b(?:NHTSA|investigat|recall|crash|collis|brak|struck|risk|fail|defect|injur|pedestrian|lane|vehicle|driver|software)\\b",low):
            candidates.append(sentence)
    prefix = "NHTSA is investigating reports involving " if kind=="investigation" else "The recall concerns "
    summary = candidates[0] if candidates else prefix+subject[:145].lower()+"."
    if len(summary.split()) > MAX_WORDS or len(summary)>MAX_CHARS:
        # Do not clip sentences into distorted or incomplete safety claims.
        summary = prefix+subject[:145].lower().rstrip(" ,;:")+"."
    if not summary.endswith((".", "!", "?")): summary += "."
    return summary

def validate_summary(summary):
    words=summary.split()
    if not 8 <= len(words) <= MAX_WORDS or len(summary)>MAX_CHARS:
        return False
    if any(x in summary.lower() for x in BOILERPLATE):
        return False
    if re.search(r"\\b(ADS|ODI|FMVSS|SGO)\\b",summary):
        return False
    if re.search(r"(?:\\d{5}-\\d{4,}){2,}",summary):
        return False
    return True
