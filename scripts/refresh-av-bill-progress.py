#!/usr/bin/env python3
"""Every few days, re-read each active AV bill's official page and record where it stands.

Rotation: bills not checked for --every-days days, oldest first, within a time budget.
Cheap path: a page whose text hash is unchanged only gets a new "checked" date. A changed page is sent to the model,
which must quote the latest action line; the quote has to appear in the fetched page or the result is ignored.
Output: data-state/av_progress.json (latest state per bill) and data-state/av_progress_feed.json (change events).
legislation-supplement.py overlays the progress onto the published index.
"""
import argparse, hashlib, importlib.util, json, re, sys, time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from scan_fetch import scan_fetch  # noqa: E402

TRACKER = ROOT / "public/data/legislation_tracker.json"
PROGRESS = ROOT / "data-state/av_progress.json"
FEED = ROOT / "data-state/av_progress_feed.json"
LEDGERS = ROOT / "data-state/bill_ledger"
TODAY = date.today().isoformat()
STATUSES = ("introduced", "engrossed", "passed", "enacted", "vetoed", "stricken")
STAGES = ("introduced", "committee", "floor", "passed_legislature", "executive", "law")
DONE = {"law", "executive"}  # executive still moves (signed/vetoed), so only "law" is final below
FINAL_STATUS = {"enacted", "vetoed", "stricken"}


def editorial():
    spec = importlib.util.spec_from_file_location("editorial", ROOT / "scripts/ai-policy-editorial.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def norm(number: str):
    m = re.match(r"\s*([A-Za-z]+)[\s._-]*0*(\d+)", number or "")
    return (m.group(1).upper(), int(m.group(2))) if m else None


def official_urls() -> dict:
    """(state, bill number) -> [(session, status-page URL)] from the bill ledgers."""
    out: dict = {}
    for path in LEDGERS.glob("[A-Z][A-Z].json"):
        for row in json.loads(path.read_text())["bills"].values():
            nk = norm(row.get("number", ""))
            if nk and row.get("url"):
                out.setdefault((path.stem, nk), []).append((str(row.get("session", "")).lower(), row["url"]))
    return out


def page_url(bill: dict, urls: dict) -> str:
    cands = urls.get((bill["jurisdiction"], norm(bill["number"])), [])
    session = str(bill.get("session", "")).lower()
    for s, url in cands:
        if s == session:
            return url
    return cands[-1][1] if cands else bill.get("source_url", "")


def flat(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def extract(ed, bill: dict, text: str) -> dict | None:
    text = text if len(text) <= 24000 else text[:12000] + " ... " + text[-12000:]
    reply = ed.invoke([
        {"role": "system", "content": "From the legislature's page for this bill, report where it stands now. "
            "Use only the page text. Return JSON {status:one of " + "|".join(STATUSES) + ", progress_stage:one of " + "|".join(STAGES)
            + ", last_action:string, last_action_date:YYYY-MM-DD or null, evidence:string}. "
            "evidence must be the exact latest action line copied verbatim from the page. If the page does not show the bill's status, return {status:null}."},
        {"role": "user", "content": json.dumps({"bill": bill["number"], "state": bill["jurisdiction"], "text": text})}])
    if reply.get("status") not in STATUSES or reply.get("progress_stage") not in STAGES:
        return None
    if len(flat(reply.get("evidence", ""))) < 12 or flat(reply["evidence"]) not in flat(text):
        return None  # the quote must really be on the page
    return {k: reply.get(k) for k in ("status", "progress_stage", "last_action", "last_action_date")}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every-days", type=int, default=5)
    ap.add_argument("--budget-minutes", type=float, default=10)
    args = ap.parse_args()
    ed = editorial()
    bills = json.loads(TRACKER.read_text())["state_bills"]
    progress = json.loads(PROGRESS.read_text()) if PROGRESS.exists() else {}
    feed = json.loads(FEED.read_text()) if FEED.exists() else []
    urls = official_urls()
    cutoff = date.fromordinal(date.today().toordinal() - args.every_days).isoformat()
    active = [b for b in bills if b.get("progress_stage") != "law" and b.get("status") not in FINAL_STATUS]
    due = sorted((b for b in active if progress.get(b["id"], {}).get("checked", "") <= cutoff),
                 key=lambda b: progress.get(b["id"], {}).get("checked", ""))
    started = time.monotonic()
    done = changed = 0
    for bill in due:
        if time.monotonic() - started > args.budget_minutes * 60:
            break
        url = page_url(bill, urls)
        rec = progress.setdefault(bill["id"], {})
        text, kind = scan_fetch(url) if url else ("", "no_url")
        done += 1
        rec["checked"], rec["url"] = TODAY, url
        if not text:
            rec["error"] = kind
            continue
        rec.pop("error", None)
        digest = hashlib.sha256(text.encode()).hexdigest()
        if rec.get("hash") == digest:
            continue
        rec["hash"] = digest
        try:
            found = extract(ed, bill, text)
        except Exception as exc:
            rec["error"] = f"extract:{type(exc).__name__}"
            continue
        if not found:
            continue
        before = {k: rec.get(k, bill.get(k)) for k in ("status", "progress_stage", "last_action", "last_action_date")}
        rec.update(found)
        if before["status"] != found["status"] or before["progress_stage"] != found["progress_stage"] or before["last_action"] != found["last_action"]:
            changed += 1
            feed.append({"id": bill["id"], "at": TODAY, "from": before, "to": found, "url": url})
    PROGRESS.parent.mkdir(exist_ok=True)
    PROGRESS.write_text(json.dumps(progress, indent=1, sort_keys=True, ensure_ascii=False) + "\n")
    FEED.write_text(json.dumps(feed[-2000:], indent=1, ensure_ascii=False) + "\n")
    print(f"AV bill progress: {len(active)} active, {len(due)} due, {done} checked, {changed} changed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
