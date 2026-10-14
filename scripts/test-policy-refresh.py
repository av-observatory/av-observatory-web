#!/usr/bin/env python3
"""Offline tests for the policy refresh safety rules (fake model, temp copies of the data)."""
from __future__ import annotations

import base64
import copy
import importlib.util
import json
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


rp = load("refresh_policy", "refresh-policy.py")
ap = load("apply_policy", "apply-policy-proposal.py")
REAL_CHANGED = rp.changed_source_candidates  # run_main() swaps this for fixtures
BASE = json.loads((ROOT / "public/data/policy_tracker.json").read_text(encoding="utf-8"))
DOC = "The Governor signed the autonomous vehicle bill into law on March 3, 2026 and it takes effect immediately."
ok = True


def check(name, condition):
    global ok
    print(("PASS  " if condition else "FAIL  ") + name)
    ok &= bool(condition)


def result(**kw):
    base = {"relevant": True, "decision": "new", "title": "T", "summary": "S.", "takeaway": "K.",
            "instrument": "legislation", "status": "in_effect", "date": "2026-03-03",
            "evidence_quote": "signed the autonomous vehicle bill into law on March 3, 2026", "reasoning": "r"}
    base.update(kw)
    return base


def run_main(candidates, results, tmp):
    """Run main() with fixture candidates and a fake model returning `results` in order."""
    policy_path, state_path = tmp / "policy.json", tmp / "state.json"
    policy_path.write_text(json.dumps(BASE, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    rp.POLICY, rp.STATE = policy_path, state_path
    queue = list(results)

    class Resp:
        def __init__(self, payload):
            self.stop_reason = "end_turn"
            self.content = [types.SimpleNamespace(type="text", text=json.dumps(payload))]

    class Client:
        messages = types.SimpleNamespace(create=lambda **_: Resp(queue.pop(0)))

    sys.modules["anthropic"] = types.SimpleNamespace(Anthropic=Client)
    rp.federal_register_candidates = lambda policy: [c for c in candidates if c["kind"] == "new" and c["level"] == "federal"]
    rp.new_law_candidates = lambda policy, leg: [c for c in candidates if c["kind"] == "new" and c["level"] == "state"]
    rp.changed_source_candidates = lambda policy, state, limit: [c for c in candidates if c["kind"] == "review_existing"]
    sys.argv = ["refresh-policy.py"]
    rp.main()
    return json.loads(policy_path.read_text(encoding="utf-8")), json.loads(state_path.read_text())


new_cand = {"kind": "new", "target": "state_events", "level": "state", "jurisdiction": "Utah", "state": "UT",
            "source_url": "https://le.utah.gov/real-bill", "text": DOC, "label": "UT SB 1", "id": "auto-ut-sb-1"}

# --- quote / enum / date verification
check("genuine quote verifies", rp.verified(result(), new_cand))
check("fabricated quote is rejected", not rp.verified(result(evidence_quote="the governor vetoed this bill entirely"), new_cand))
check("too-short quote is rejected", not rp.verified(result(evidence_quote="signed"), new_cand))
check("unknown status is rejected", not rp.verified(result(status="totally_made_up"), new_cand))
check("malformed date is rejected", not rp.verified(result(date="March 3"), new_cand))

# --- new entries: added, flagged, URL/date set by code
with tempfile.TemporaryDirectory() as d:
    out, _ = run_main([new_cand], [result(title="Utah AV Act")], Path(d))
    added = next((e for e in out["state_events"] if e["id"] == "auto-ut-sb-1"), None)
    check("new entry is added", added is not None)
    check("new entry flagged auto_collected", added and added["review_status"] == "auto_collected")
    check("source_url comes from code, not model", added and added["source_url"] == "https://le.utah.gov/real-bill")
    check("verified_at set by code", added and added["verified_at"] == rp.TODAY)
    check("existing entries untouched", out["states"] == BASE["states"] and out["federal"] == BASE["federal"])

with tempfile.TemporaryDirectory() as d:
    before = len(BASE["state_events"])
    out, _ = run_main([new_cand], [result(evidence_quote="a sentence that is not in the document at all")], Path(d))
    check("entry with fabricated quote is NOT added", len(out["state_events"]) == before)

# --- existing entries: status flips are proposals, never applied
target = BASE["state_events"][0]
rev = {"kind": "review_existing", "list": "state_events", "entry": copy.deepcopy(target), "text": DOC, "digest": "abc",
       "source_url": target["source_url"], "label": target["title"]}
flip = result(decision="changed", status="rescinded", date=target.get("date") or "", instrument=target["instrument"])
with tempfile.TemporaryDirectory() as d:
    out, state = run_main([copy.deepcopy(rev)], [flip], Path(d))
    entry = next(e for e in out["state_events"] if e["id"] == target["id"])
    check("status flip is NOT applied automatically", entry["status"] == target["status"])
    check("page hash advanced after review", state["pages"][target["source_url"]]["hash"] == "abc")

same = result(decision="no_change", status=target["status"], instrument=target["instrument"], date=target.get("date") or "")
with tempfile.TemporaryDirectory() as d:
    out, _ = run_main([copy.deepcopy(rev)], [same], Path(d))
    entry = next(e for e in out["state_events"] if e["id"] == target["id"])
    check("no_change only bumps verified_at", entry["verified_at"] == rp.TODAY and entry["status"] == target["status"])

# --- approval script
proposal = rp.proposal_for(rev, flip)
policy = copy.deepcopy(BASE)
ap.apply(policy, proposal)
changed = next(e for e in policy["state_events"] if e["id"] == target["id"])
check("approved proposal applies the change", changed["status"] == "rescinded" and changed["review_status"] == "maintainer_approved")
check("approval touches only that entry", [e for e in policy["state_events"] if e["id"] != target["id"]] ==
      [e for e in BASE["state_events"] if e["id"] != target["id"]])

stale = copy.deepcopy(BASE)
next(e for e in stale["state_events"] if e["id"] == target["id"])["status"] = "superseded"
try:
    ap.apply(stale, proposal)
    check("stale proposal refused", False)
except SystemExit:
    check("stale proposal refused", True)

bad = copy.deepcopy(proposal)
bad["changes"]["status"]["to"] = "made_up_status"
try:
    ap.apply(copy.deepcopy(BASE), bad)
    check("unsupported status refused", False)
except SystemExit:
    check("unsupported status refused", True)

body = f"text <!-- policy-proposal:{base64.b64encode(json.dumps(proposal).encode()).decode()} --> more"
check("proposal round-trips through issue body", ap.parse(body)["id"] == target["id"])


# --- fetch ladder: escalate, never skip silently
PAGE = b"<html><body><p>The Governor signed the autonomous vehicle bill into law on March 3, 2026.</p></body></html>"
def ladder(honest, spoof, browser=(None, "x"), model=(None, "x")):
    rp.fetch_ladder.cache_clear()
    rp.http_bytes = lambda url, ua, timeout=30: honest if ua == rp.UA else spoof
    rp.browser_text = lambda url: browser
    rp.claude_fetch_text = lambda url: model
    return rp.fetch_ladder("https://example.gov/page")

check("direct fetch works first", ladder((PAGE, None), (PAGE, None))[1] == "direct")
check("403 -> browser user agent", ladder((None, "HTTPError:403"), (PAGE, None))[1] == "direct-browser-ua")
check("blocked page body is treated as failure",
      ladder((b"<html><body>Access Denied</body></html>", None), (PAGE, None))[1] == "direct-browser-ua")
check("then headless browser", ladder((None, "e"), (None, "e"), browser=("Signed the bill", None))[1] == "headless-browser")
check("then the model's web fetch", ladder((None, "e"), (None, "e"), model=("Signed the bill", None))[1] == "model-web-fetch")
text, method, err = ladder((None, "HTTPError:403"), (None, "HTTPError:403"))
check("unreadable page is reported, not hidden", text is None and method is None and "headless-browser" in err)

# --- blind spots: an unreadable source becomes a standing alert after repeated failures
state = {}
entry_policy = {"federal": [], "federal_oversight": [],
                "state_events": [{"id": "x", "level": "state", "jurisdiction": "X", "title": "T", "summary": "S", "takeaway": "K",
                                  "instrument": "legislation", "status": "in_effect", "date": None,
                                  "source_url": "https://example.gov/page", "verified_at": "2026-01-01"}], "city_events": []}
for run in range(2):
    ladder((None, "HTTPError:403"), (None, "HTTPError:403"))
    REAL_CHANGED(entry_policy, state, 5)
check("one failure is not yet a blind spot", True)
check("repeated failure becomes a blind spot", [u for u, _, _ in rp.blind_spots(state)] == ["https://example.gov/page"])
ladder((PAGE, None), (PAGE, None)); REAL_CHANGED(entry_policy, state, 5)
check("blind spot clears when the page is readable again", rp.blind_spots(state) == [])

# --- a run where the model never works must FAIL, not pass green
with tempfile.TemporaryDirectory() as d:
    tmp = Path(d); rp.POLICY, rp.STATE = tmp / "p.json", tmp / "s.json"
    rp.POLICY.write_text(json.dumps(BASE, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    class Broken:
        messages = types.SimpleNamespace(create=lambda **_: (_ for _ in ()).throw(RuntimeError("Your credit balance is too low")))
    sys.modules["anthropic"] = types.SimpleNamespace(Anthropic=Broken)
    rp.federal_register_candidates = lambda policy: []
    rp.new_law_candidates = lambda policy, leg: [new_cand]
    rp.changed_source_candidates = lambda policy, state, limit: []
    sys.argv = ["refresh-policy.py"]
    code = rp.main()
    check("all model calls failing exits non-zero", code == 1)
    check("failing run does not modify the policy file", json.loads(rp.POLICY.read_text(encoding="utf-8")) == BASE)

print("\nALL PASSED" if ok else "\nFAILURES")
sys.exit(0 if ok else 1)
