#!/usr/bin/env python3
"""Directional read of a bill on one issue: does it enable or restrict the issue, and does it add or cut funding?

For each bill the official text is fetched and the model must answer from that text only, quoting the line that
supports the call. The quote has to appear in the fetched text or the answer is discarded as "unclear".
Output: data-state/bill_direction/<issue>.json = {bill id: {direction, funding, evidence, checked, hash}}.
Issues: "av" reads the published AV bills in the index; other issues read bills tagged with that topic in
data-state/bill_topics (use --max to bound the work, the text fetch is the slow part).
"""
import argparse, hashlib, importlib.util, json, re, sys, time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from scan_fetch import scan_fetch  # noqa: E402

ISSUES = {
    "av": "the development, testing and deployment of autonomous (self-driving) vehicles",
    "guns": "access to, ownership and carrying of firearms",
    "children_families": "protections, services and rights for children and families",
    "health_care": "access to and funding of health care",
    "housing": "housing supply and affordability",
    "ai_regulation": "the development and use of artificial intelligence",
}
DIRECTIONS = ("enables", "restricts", "mixed", "neutral", "unclear")
FUNDING = ("increases", "decreases", "none", "unclear")


def editorial():
    spec = importlib.util.spec_from_file_location("editorial", ROOT / "scripts/ai-policy-editorial.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def flat(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def judge(ed, issue: str, bill: dict, text: str) -> dict:
    excerpt = text if len(text) <= 30000 else text[:15000] + " ... " + text[-15000:]
    reply = ed.invoke([
        {"role": "system", "content": f"Read this bill's text and judge its direction on the issue: {ISSUES[issue]}. "
            "direction: enables = permits, expands, promotes or protects the issue; restricts = prohibits, limits, adds burdens or penalties, or undermines it; "
            "mixed = does both; neutral = procedural, study, naming or no real effect on the issue; unclear = the text does not say. "
            "funding: increases = appropriates or authorizes new money for the issue; decreases = cuts, repeals or withholds money; none = no money provisions on the issue; unclear. "
            "Use only the text. Return JSON {direction:" + "|".join(DIRECTIONS) + ", funding:" + "|".join(FUNDING)
            + ", evidence:string}. evidence must be one sentence copied verbatim from the text that most supports the direction."},
        {"role": "user", "content": json.dumps({"bill": bill["number"], "state": bill["jurisdiction"], "text": excerpt})}])
    direction, funding = reply.get("direction"), reply.get("funding")
    evidence = str(reply.get("evidence") or "")
    if direction not in DIRECTIONS or funding not in FUNDING or len(flat(evidence)) < 12 or flat(evidence) not in flat(text):
        return {"direction": "unclear", "funding": "unclear", "evidence": ""}  # unsupported answers are not kept
    return {"direction": direction, "funding": funding, "evidence": evidence[:400]}


def targets(issue: str, limit: int):
    if issue == "av":
        for bill in json.loads((ROOT / "public/data/legislation_tracker.json").read_text())["state_bills"]:
            url = bill.get("editorial_source_url") or bill.get("source_url")
            if url:
                yield bill["id"], {"number": bill["number"], "jurisdiction": bill["jurisdiction"]}, url
        return
    count = 0
    for tags_path in sorted((ROOT / "data-state/bill_topics").glob("[A-Z][A-Z].json")):
        code = tags_path.stem
        tags = json.loads(tags_path.read_text())
        bills = json.loads((ROOT / f"data-state/bill_ledger/{code}.json").read_text())["bills"]
        for key, tag in tags.items():
            row = bills.get(key)
            if row and issue in tag["t"] and (row.get("text_url") or row.get("url")):
                yield f"{code}:{key}", {"number": row["number"], "jurisdiction": code}, row.get("text_url") or row["url"]
                count += 1
                if count >= limit:
                    return


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("issue", choices=sorted(ISSUES))
    ap.add_argument("--max", type=int, default=300)
    ap.add_argument("--budget-minutes", type=float, default=30)
    args = ap.parse_args()
    ed = editorial()
    out = ROOT / "data-state/bill_direction" / f"{args.issue}.json"
    out.parent.mkdir(exist_ok=True)
    done = json.loads(out.read_text()) if out.exists() else {}
    started = time.monotonic()
    judged = 0
    for ident, bill, url in targets(args.issue, args.max):
        if time.monotonic() - started > args.budget_minutes * 60:
            break
        text, kind = scan_fetch(url)
        if not text:
            done.setdefault(ident, {}).update({"direction": "unclear", "funding": "unclear", "evidence": "", "error": kind, "checked": date.today().isoformat()})
            continue
        digest = hashlib.sha1(text.encode()).hexdigest()[:12]
        if done.get(ident, {}).get("hash") == digest:
            continue  # same text as last time
        try:
            verdict = judge(ed, args.issue, bill, text)
        except Exception as exc:
            done.setdefault(ident, {})["error"] = f"judge:{type(exc).__name__}"
            continue
        done[ident] = dict(verdict, hash=digest, checked=date.today().isoformat())
        judged += 1
        if judged % 10 == 0:
            out.write_text(json.dumps(done, indent=1, sort_keys=True, ensure_ascii=False) + "\n")
    out.write_text(json.dumps(done, indent=1, sort_keys=True, ensure_ascii=False) + "\n")
    tally = {}
    for v in done.values():
        tally[v["direction"]] = tally.get(v["direction"], 0) + 1
    print(f"Direction ({args.issue}): {len(done)} bills, judged {judged} this run; {tally}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
