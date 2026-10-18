#!/usr/bin/env python3
"""State-neutral direction for the Compare sub-topics.

The main tagger scores a bill against its own state's current law. For cross-state comparison, this pass scores what the
bill's own provisions say, with no reference to any state's existing law, so the same content gets the same score in every state.
Only bills already tagged on a featured sub-topic (data-state/taxonomy/compare_featured.json) are scored, on those sub-topics.
Output: {bill: {"hash", "scores": {sub-topic: {"direction", "confidence"}}}}
"""
import argparse, concurrent.futures as cf, hashlib, importlib.util, json, os, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("tagger", ROOT / "scripts/tag-bills-taxonomy.py")
T = importlib.util.module_from_spec(spec)
spec.loader.exec_module(T)
REV = "n1"
FEATURED = json.loads((ROOT / "data-state/taxonomy/compare_featured.json").read_text())
ALLOWED = {"A": ["strongly_restricts", "restricts", "mixed", "neutral", "expands", "strongly_expands"],
           "R": ["strongly_loosens", "loosens", "mixed", "neutral", "tightens", "strongly_tightens"]}


def system_prompt() -> str:
    lines = []
    for sid in FEATURED:
        s = T.SUB[sid]
        lines.append(f"- {sid}: {s['topic']} / {s['name']} (axis {s['axis']}: direction is one of {'|'.join(ALLOWED[s['axis']])})")
    return ("You rate legislative bills for a cross-state comparison. For each listed sub-topic you are asked about, rate the policy position "
            "the bill's own provisions take on that sub-topic, judged ONLY from the bill text, as if no other law existed. "
            "Do NOT consider what any state's law currently says, or whether the bill changes the status quo. A bill that writes an existing "
            "right or rule into law takes the same position as a bill that creates it; a bill that repeals a rule takes the opposite position.\n"
            "Axis A (access/rights): expands = gives more access, rights or protections; restricts = limits them. "
            "Axis R (regulation): tightens = adds rules, oversight, penalties or burdens on the regulated activity; loosens = removes or relaxes them. "
            "strongly_* only for sweeping provisions (a ban, a mandate, a full repeal). Use neutral for studies, funding without rule changes or technical fixes; "
            "mixed when provisions clearly pull in opposite directions.\n"
            "Sub-topics:\n" + "\n".join(lines) + "\n\n"
            'Return {"scores": [{"subtopic": id, "direction": one of the allowed values, "confidence": "high"|"medium"|"low"}]} with one entry per sub-topic asked about.')


def bhash(b: dict) -> str:
    return hashlib.sha1(f"{REV}|{T.MODEL}|{b.get('title', '')}|{b.get('digest', '')}".encode()).hexdigest()[:12]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", required=True)
    ap.add_argument("--out", default="")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--budget-minutes", type=float, default=0)
    a = ap.parse_args()
    if not T.KEY:
        print("::error::ANTHROPIC_API_KEY not configured")
        return 1
    d = ROOT / f"data-state/states/{a.state.upper()}"
    bills = json.loads((d / "bills.json").read_text())
    tags = json.loads((d / "tags.json").read_text())["bills"]
    out = Path(a.out) if a.out else d / "tags_neutral.json"
    results = json.loads(out.read_text())["bills"] if out.exists() else {}
    want = {k: [t["subtopic"] for t in v.get("tags", []) if t["subtopic"] in FEATURED] for k, v in tags.items() if k in bills}
    want = {k: sorted(set(v)) for k, v in want.items() if v}
    todo = [k for k in sorted(want) if results.get(k, {}).get("hash") != bhash(bills[k])]
    print(f"{len(want)} bills on featured sub-topics, {len(todo)} to score with {T.MODEL}", flush=True)
    system = system_prompt()
    started = time.monotonic()

    def save():
        out.write_text(json.dumps({"model": T.MODEL, "rev": REV, "bills": results}, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n")

    def work(k):
        if a.budget_minutes and time.monotonic() - started > a.budget_minutes * 60:
            return k, None
        b = bills[k]
        try:
            r = T.call(system, json.dumps({"bill": k, "sub_topics": want[k], "text": f"{b.get('title', '')}\n\n{b.get('digest', '')}".strip()[:9000]}))
        except Exception as exc:
            return k, {"error": type(exc).__name__}
        sc = {}
        for x in r.get("scores", []):
            sid = x.get("subtopic")
            if sid in want[k] and x.get("direction") in ALLOWED[T.SUB[sid]["axis"]]:
                sc[sid] = {"direction": x["direction"], "confidence": x.get("confidence") if x.get("confidence") in ("high", "medium", "low") else "low"}
        return k, {"hash": bhash(b), "scores": sc}

    done = errors = 0
    with cf.ThreadPoolExecutor(max_workers=a.workers) as pool:
        for k, r in pool.map(work, todo):
            if r is None:
                continue
            if "error" in r:
                errors += 1
                continue
            results[k] = r
            done += 1
            if done % 100 == 0:
                save()
                print(f"  scored {done}/{len(todo)} (${T.cost_estimate():.2f})", flush=True)
    save()
    print(f"Scored {done} bills, {errors} errors; about ${T.cost_estimate():.2f}")
    return 1 if errors and not done else 0


if __name__ == "__main__":
    sys.exit(main())
