#!/usr/bin/env python3
"""Tag every titled bill in the ledgers with up to three topics (model pass over titles).

Writes data-state/bill_topics/<ST>.json = {"<session>:<number>": {"t": [topics], "h": title hash}}.
Resumable: only bills with no tag for their current title are sent. Bills without a title are skipped
(they are tagged later from their page text). Topics are approximate, title-based labels.
"""
import argparse, hashlib, json, os, sys, time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
LEDGERS = ROOT / "data-state/bill_ledger"
OUT = ROOT / "data-state/bill_topics"
MODEL = os.getenv("TOPIC_MODEL", "claude-haiku-5-5")
KEY = os.getenv("ANTHROPIC_API_KEY")
TOPICS = {
    "guns": "firearms, ammunition, gun licensing, concealed carry, background checks",
    "children_families": "children, minors, child welfare, foster care, child care, parental rights, family law",
    "health_care": "health care, insurance, Medicaid, hospitals, drugs, mental health, public health",
    "housing": "housing, zoning, rent, landlords/tenants, homelessness, mortgages, construction",
    "ai_regulation": "artificial intelligence, algorithms, automated decision systems, deepfakes",
    "education": "schools, universities, curriculum, student aid, teachers",
    "taxes_budget": "taxes, appropriations, state budget, bonds, fees",
    "elections_voting": "elections, voting, campaigns, redistricting, ballots",
    "transportation": "roads, vehicles, driving, traffic, transit, autonomous vehicles, aviation",
    "environment_energy": "environment, climate, energy, utilities, water, land use, wildlife",
    "criminal_justice": "crimes, penalties, courts, police, corrections, sentencing",
    "labor_employment": "workers, wages, unions, workplace rules, unemployment",
    "immigration": "immigration, citizenship, immigrants",
    "civil_rights": "discrimination, civil rights, religious liberty, free speech, LGBTQ, abortion/reproductive rights",
    "privacy_technology": "data privacy, social media, cybersecurity, telecom, online safety",
    "consumer_business": "consumer protection, business regulation, licensing, insurance, banking, agriculture",
    "government_administration": "state agencies, public employees, local government, ceremonial/commemorative measures",
}


def title_hash(title: str) -> str:
    return hashlib.sha1(title.strip().lower().encode()).hexdigest()[:10]


def ask(batch):
    """batch: [(index, title)] -> {index: [topics]}"""
    listing = "\n".join(f"- {k}: {v}" for k, v in TOPICS.items())
    system = ("Tag each US state bill with up to three topics chosen ONLY from this list (use the exact ids; use none if nothing fits):\n"
              + listing + "\nTag by what the bill does, judged from its title. Respond with JSON {\"results\": {\"<number>\": [\"topic\", ...]}} covering every number.")
    body = json.dumps({"model": MODEL, "max_tokens": 6000, "system": system,
                       "messages": [{"role": "user", "content": "\n".join(f"{i}. {t[:300]}" for i, t in batch)}]}).encode()
    request = Request("https://api.anthropic.com/v1/messages", body,
                      {"Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01"})
    for attempt in range(4):
        try:
            with urlopen(request, timeout=120) as response:
                text = "".join(c.get("text", "") for c in json.load(response)["content"] if c.get("type") == "text")
            results = json.loads(text[text.index("{"):text.rindex("}") + 1])["results"]
            return {int(k): [t for t in v if t in TOPICS][:3] for k, v in results.items() if isinstance(v, list)}
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget-minutes", type=float, default=40)
    ap.add_argument("--batch", type=int, default=60)
    ap.add_argument("--only", default="", help="comma-separated state codes")
    args = ap.parse_args()
    if not KEY:
        print("::error::ANTHROPIC_API_KEY not configured")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    only = {s for s in args.only.split(",") if s}
    started = time.monotonic()
    sent = tagged = 0
    for path in sorted(LEDGERS.glob("[A-Z][A-Z].json")):
        code = path.stem
        if only and code not in only:
            continue
        bills = json.loads(path.read_text())["bills"]
        out_path = OUT / f"{code}.json"
        tags = json.loads(out_path.read_text()) if out_path.exists() else {}
        todo = [(k, b["title"]) for k, b in bills.items()
                if b.get("title", "").strip() and tags.get(k, {}).get("h") != title_hash(b["title"])]
        for start in range(0, len(todo), args.batch):
            if time.monotonic() - started > args.budget_minutes * 60:
                break
            chunk = todo[start:start + args.batch]
            try:
                result = ask([(i, t) for i, (_, t) in enumerate(chunk)])
            except Exception as exc:
                print(f"{code}: batch failed ({type(exc).__name__}); will retry next run", flush=True)
                continue
            for i, (key, title) in enumerate(chunk):
                if i in result:  # a bill the model skipped stays untagged and is retried next run
                    tags[key] = {"t": result[i], "h": title_hash(title)}
                    tagged += 1
            sent += len(chunk)
            out_path.write_text(json.dumps(tags, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n")
        print(f"{code}: {len(todo)} to tag, {len(tags)} tagged in total", flush=True)
    print(f"Topic pass: sent {sent}, tagged {tagged}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
