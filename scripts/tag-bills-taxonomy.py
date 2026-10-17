#!/usr/bin/env python3
"""Tag bills with the approved two-level taxonomy: sub-topic, direction on that sub-topic's axis, mechanism and funding.

Input: a state's bills.json (title + the Legislative Counsel's digest). Every tag must quote a line from the bill's
own text; a call whose quote is not in the text is downgraded to "unclear". Taxonomy: data-state/taxonomy/taxonomy.json.
Used first as a reviewed sample (--sample N), then at scale.
"""
import argparse, concurrent.futures as cf, json, os, random, re, sys, time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
TAX = json.loads((ROOT / "data-state/taxonomy/taxonomy.json").read_text())
KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = os.getenv("TAG_MODEL", "claude-sonnet-5-5")
SUB = {s["id"]: dict(s, topic=t["name"]) for t in TAX["topics"] for s in t["subtopics"]}
DIRS = TAX["directions_by_axis"]
FUNDING = TAX["funding"]
MECHANISMS = ("tax_incentive", "permitting_streamlining", "ban_or_prohibition", "licensing_or_registration", "disclosure_or_reporting",
              "funding_or_appropriation", "penalty_or_enforcement", "preemption", "study_or_task_force", "standards_or_requirements",
              "repeal_or_exemption", "program_creation", "other")
POLES = {"A": "direction is one of " + "|".join(DIRS["A"]) + " (expands = expands access/rights, restricts = limits them)",
         "R": "direction is one of " + "|".join(DIRS["R"]) + " (tightens = adds rules, oversight or burdens, loosens = removes or relaxes them)",
         "F": "no direction; use not_applicable and set funding", "N": "no direction; use not_applicable"}
KEYWORDS = {"guns": r"firearm|ammunition", "abortion": r"abortion|reproductive", "ai": r"artificial intelligence|automated decision",
            "data_centers": r"data center", "housing": r"zoning|tenant|rental housing|housing element", "schools": r"pupil|school district",
            "immigration": r"immigra", "av": r"autonomous vehicle", "privacy": r"personal information|privacy"}


def system_prompt() -> str:
    lines = [f"- {sid}: {s['topic']} / {s['name']} (axis {s['axis']}: {POLES[s['axis']]})" for sid, s in SUB.items()]
    return ("You tag California bills for a legislative tracker. Choose up to 4 sub-topics from this list, using the exact ids:\n" + "\n".join(lines) +
            "\n\nFor each tag give: direction (the values allowed for that sub-topic's axis, listed above), funding (" + "|".join(FUNDING) +
            "), mechanism (" + "|".join(MECHANISMS) + "), confidence (high|medium|low), and evidence: ONE sentence copied verbatim from the bill text below that supports the direction. "
            "Judge direction from what THIS bill would do (the 'This bill would...' parts), not from existing law it summarizes. "
            "Direction describes the bill's effect, never a viewpoint. Use 'mixed' when it moves both ways, 'neutral' for procedural or no real effect on the sub-topic, 'unclear' when the text does not say. "
            "Rules: (a) a rule that only assigns responsibility, procedure, enforcement mechanics or liability, without limiting or enabling the activity itself, is neutral; "
            "(b) a bill that only requires a study, assessment, report or recommendations is neutral unless it changes a requirement now; "
            "(c) a voluntary program or optional authority adds an option, not an obligation, so it is neutral unless it expressly lifts a ban or limit; "
            "(d) if the digest is thin or purely procedural, choose unclear or neutral, never guess a direction; "
            "(e) give at most 3 tags, and include a tag beyond the first only if your confidence in it is medium or high; omit low-confidence tags. "
            "Also give summary: one plain sentence, 25 words or fewer, saying what the bill does. "
            "Return JSON {summary:string, tags:[{subtopic, direction, funding, mechanism, confidence, evidence}]}. Return {tags:[]} if no sub-topic fits.")


PRICE = {"claude-sonnet-5-5": (2.00, 10.00, 0.20), "claude-haiku-5-5": (0.10, 0.50, 0.01)}  # $ per million tokens: input, output, cache read
USAGE = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "calls": 0}


def call(system: str, user: str) -> dict:
    body = json.dumps({"model": MODEL, "max_tokens": 4000,
                       "system": [{"type": "text", "text": system + "\n\nRespond with a single JSON object and nothing else.", "cache_control": {"type": "ephemeral"}}],
                       "messages": [{"role": "user", "content": user}]}).encode()
    req = Request("https://api.anthropic.com/v1/messages", body, {"Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01"})
    for attempt in range(4):
        try:
            with urlopen(req, timeout=180) as r:
                data = json.load(r)
            u = data.get("usage", {})
            USAGE["calls"] += 1
            USAGE["input"] += u.get("input_tokens", 0)
            USAGE["output"] += u.get("output_tokens", 0)
            USAGE["cache_read"] += u.get("cache_read_input_tokens", 0)
            USAGE["cache_write"] += u.get("cache_creation_input_tokens", 0)
            text = "".join(c.get("text", "") for c in data["content"] if c.get("type") == "text")
            return json.loads(text[text.index("{"):text.rindex("}") + 1])
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))


def cost_estimate() -> float:
    pin, pout, pread = PRICE.get(MODEL, (2.0, 10.0, 0.2))
    return (USAGE["input"] * pin + USAGE["cache_write"] * pin * 1.25 + USAGE["cache_read"] * pread + USAGE["output"] * pout) / 1e6


def flat(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def tag_bill(system: str, key: str, bill: dict) -> dict:
    text = f"{bill.get('title', '')}\n\n{bill.get('digest', '')}".strip()
    reply = call(system, json.dumps({"bill": key, "text": text[:9000]}))
    tags = []
    for t in reply.get("tags", []):
        sid = t.get("subtopic")
        if sid not in SUB:
            continue
        axis = SUB[sid]["axis"]
        allowed = DIRS[axis]
        direction = allowed[0] if axis in ("F", "N") else (t.get("direction") if t.get("direction") in allowed else "unclear")
        evidence = str(t.get("evidence") or "")
        supported = len(flat(evidence)) >= 12 and flat(evidence) in flat(text)
        if not supported and direction not in ("unclear", "not_applicable", "neutral"):
            direction = "unclear"  # no verifiable quote, no direction
        tags.append({"subtopic": sid, "topic": SUB[sid]["topic"], "direction": direction,
                     "funding": t.get("funding") if t.get("funding") in FUNDING else "unclear",
                     "mechanism": t.get("mechanism") if t.get("mechanism") in MECHANISMS else "other",
                     "confidence": t.get("confidence") if t.get("confidence") in ("high", "medium", "low") else "low",
                     "evidence": evidence[:400] if supported else "", "evidence_verified": supported})
    rank = {"high": 0, "medium": 1, "low": 2}
    tags = sorted(tags, key=lambda t: rank[t["confidence"]])
    kept = [t for i, t in enumerate(tags) if t["confidence"] != "low"][:3]
    return {"summary": str(reply.get("summary") or "")[:300], "has_digest": bool(bill.get("digest")), "tags": kept, "dropped_low_confidence": len(tags) - len(kept)}


def pick_sample(bills: dict, n: int, seed: int) -> list:
    rng = random.Random(seed)
    keys = sorted(k for k, b in bills.items() if b.get("digest"))
    chosen = []
    for _, pattern in KEYWORDS.items():
        hits = [k for k in keys if re.search(pattern, bills[k]["digest"], re.I) and k not in chosen]
        chosen += rng.sample(hits, min(3, len(hits)))
    rest = [k for k in keys if k not in chosen]
    chosen += rng.sample(rest, max(0, n - len(chosen)))
    return chosen[:n]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bills", default="data-state/states/CA/bills.json")
    ap.add_argument("--out", default="data-state/states/CA/tags_sample.json")
    ap.add_argument("--sample", type=int, default=50)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    if not KEY:
        print("::error::ANTHROPIC_API_KEY not configured")
        return 1
    bills = json.loads((ROOT / args.bills).read_text())
    keys = pick_sample(bills, args.sample, args.seed)
    system = system_prompt()
    results = {}
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(tag_bill, system, k, bills[k]): k for k in keys}
        for fut in cf.as_completed(futures):
            k = futures[fut]
            try:
                results[k] = fut.result()
            except Exception as exc:
                results[k] = {"error": f"{type(exc).__name__}"}
    out = ROOT / args.out
    out.write_text(json.dumps({"model": MODEL, "taxonomy": TAX["version"], "bills": results}, indent=1, sort_keys=True, ensure_ascii=False) + "\n")
    tags = [t for r in results.values() for t in r.get("tags", [])]
    verified = sum(t["evidence_verified"] for t in tags)
    n = max(1, len(results))
    print(f"Usage ({MODEL}): {USAGE['calls']} calls; input {USAGE['input']:,} + cache write {USAGE['cache_write']:,} + cache read {USAGE['cache_read']:,}; "
          f"output {USAGE['output']:,} (includes any hidden thinking); about ${cost_estimate():.2f} for {len(results)} bills "
          f"= ${cost_estimate() / n:.4f} per bill, so roughly ${cost_estimate() / n * 5041:.0f} for all 5,041 California bills")
    print(f"Tagged {len(results)} bills, {len(tags)} tags, {verified} with a verified quote, {sum('error' in r for r in results.values())} errors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
