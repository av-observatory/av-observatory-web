#!/usr/bin/env python3
"""Massachusetts 194th General Court (2025-26) -> data-state/states/MA/{bills,legislators}.json, {votes,history}.json.gz.

Source: the official malegislature.gov JSON API (https://malegislature.gov/api/...):
  /GeneralCourts/194/Documents                         list of every filed document (bill number, docket, sponsors)
  /GeneralCourts/194/Documents/<N>                     title, pinslip (short summary used as digest), committee actions, roll call refs
  /GeneralCourts/194/Documents/<N>/DocumentHistoryActions   dated actions (status, chapter, floor tallies come from here)
  /GeneralCourts/194/LegislativeMembers[/<code>]       party, district, branch
  /GeneralCourts/194/Branches/Senate/RollCalls/<n>     Senate member-by-member roll calls (House roll calls are PDF only)
Run via .github/workflows/extract-ma.yml (the sandbox cannot reach the site).
"""
import argparse, gzip, json, re, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data-state/states/MA"
API = "https://malegislature.gov/api/GeneralCourts/194"
UA = "AVObservatory/1.0 (+https://av-observatory.com/; public-records research)"
WORKERS = 4


def get_json(url, tries=5, timeout=120):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 404):
                return None  # "no such thing" answers (e.g. no roll calls) are a result, not an error
            wait = float(e.headers.get("Retry-After") or 0) if e.code == 429 else 0
            time.sleep(max(wait, 2 ** i))
        except Exception as e:  # network hiccups, timeouts
            last = e
            time.sleep(2 ** i)
    print(f"GIVE UP {url}: {last!r}", flush=True)
    return None


def clean(s, n=3500):
    s = re.sub(r"<[^>]+>", " ", s or "")
    return " ".join(s.replace("&nbsp;", " ").replace("&amp;", "&").split())[:n]


def iso(d):
    return (d or "")[:10]


# ----------------------------------------------------------------------------- legislators
PARTY = {"democrat": "DEM", "republican": "REP", "unenrolled": "IND", "independent": "IND"}


def split_name(full):
    full = full.strip()
    parts = full.split()
    suffix = ""
    while parts and parts[-1].lower().strip(".,") in ("jr", "sr", "ii", "iii", "iv"):
        suffix = " " + parts.pop()
    if not parts:
        return full, "", full
    last = parts[-1] + suffix
    first = " ".join(parts[:-1])
    return f"{last}, {first}".strip(", "), first, last


def load_legislators():
    members = get_json(f"{API}/LegislativeMembers") or []
    codes = [m["MemberCode"] for m in members]
    print(f"{len(codes)} members listed", flush=True)

    def one(code):
        d = get_json(f"{API}/LegislativeMembers/{urllib.request.quote(code)}", timeout=240)
        if not d:
            return code, None
        name, first, last = split_name(d.get("Name") or code)
        branch = d.get("Branch") or ""
        party = d.get("Party") or ""
        return code, {"id": code, "name": name, "first": first, "last": last, "party": PARTY.get(party.lower(), party.upper()[:3] or "OTHER"),
                      "house": branch, "district": d.get("District") or "", "active": True,
                      "url": f"https://malegislature.gov/People/{code}", "leadership": d.get("LeadershipPosition") or ""}
    legs = {}
    with ThreadPoolExecutor(WORKERS) as ex:
        for code, rec in ex.map(one, codes):
            if rec:
                legs[code] = rec
    return legs


# ----------------------------------------------------------------------------- status from history
FLOOR = re.compile(r"read (second|third)|ordered to a (second|third) reading|passed to be engrossed|engrossed|orders of the day|"
                   r"bill reported favorably by committee and referred to the committee on (house|senate) (steering|rules|ways|bills)|"
                   r"placed in the orders|rules suspended|committee reported that the matter|amendment .* (adopted|rejected)|"
                   r"reported (favorably|from the committee on (house|senate) ways)|new draft|laid aside|passed to be enacted|"
                   r"committee of conference|conference committee", re.I)
COMMITTEE = re.compile(r"referred to the committee|referred to committee|discharged to the committee|hearing (scheduled|rescheduled|cancel)|"
                       r"reporting date extended|accompanied|committee recommended|^referred|sent to the committee|"
                       r"study order|read; and referred|petition", re.I)
CHAPTER = re.compile(r"Chapter\s+(\d+)\s+of\s+the\s+Acts\s+of\s+(\d{4})", re.I)
RESOLVE = re.compile(r"Chapter\s+(\d+)\s+of\s+the\s+Resolves\s+of\s+(\d{4})", re.I)
DIED = re.compile(r"accompanied (a|by a) study order|study order|placed on file|no further action|withdrawn|leave to withdraw|"
                  r"discharged .* placed|rejected$|negatived|indefinite|new draft .* see|reported .* see (h|s)\d+|"
                  r"accompanied by|committee on .* (in lieu of|accompanied)", re.I)
ADVERSE = re.compile(r"reported (adversely|unfavorably)|ought not to pass|leave to withdraw|rejected\s*-?\s*$|reported adversely", re.I)


def derive_status(actions):
    """actions: [(date, branch, text)] oldest first -> (status, chapter, last_text)."""
    state, chapter = None, ""
    for _, branch, text in actions:
        t = " ".join(text.split())
        m = CHAPTER.search(t) or RESOLVE.search(t)
        if m and re.search(r"signed|approved|became law|without (the )?(governor|signature)|chapter", t, re.I) and not re.search(r"vetoed|returned.*objections", t, re.I):
            kind = "Resolves" if RESOLVE.search(t) and not CHAPTER.search(t) else "Acts"
            chapter = f"Chapter {m.group(1)} of the {kind} of {m.group(2)}"
            state = "Chaptered"
            continue
        if re.search(r"vetoed|veto(es)?\b|returned .* with (his|her|their) (objections|disapproval)", t, re.I) and state != "Chaptered":
            state = "Vetoed"
            continue
        if state == "Chaptered":
            continue
        if re.search(r"signed by the governor|became law|approved by the governor", t, re.I):
            state, chapter = "Chaptered", chapter or ""
            continue
        if re.search(r"^enacted|enacted\b.*(laid before|senate|house)|laid before the governor|sent to the governor|presented to the governor", t, re.I):
            state = "Passed"
            continue
        if ADVERSE.search(t) and not re.search(r"in part", t, re.I):
            state = "Failed Passage in Committee"
            continue
        if re.search(r"study order|placed on file|no further action|withdrawn|leave to withdraw|negatived|indefinitely", t, re.I):
            state = "Died"
            continue
        if FLOOR.search(t) and not re.search(r"hearing", t, re.I):
            state = "In Floor Process" if state not in ("Passed",) else state
            continue
        if COMMITTEE.search(t):
            if state in (None, "In Committee Process", "In Floor Process", "Died", "Failed Passage in Committee"):
                state = "In Committee Process"
            continue
    return state or "In Committee Process", chapter


TALLY = re.compile(r"(\d+)\s+YEAS?\s+to\s+(\d+)\s+NAYS?(?:.*?YEA\s+and\s+NAY\s+No\.?\s*(\d+))?", re.I | re.S)


def tallies(actions):
    out = []
    for date, branch, text in actions:
        m = TALLY.search(text)
        if m and branch in ("House", "Senate"):
            low = text.lower()
            result = "Pass" if re.search(r"adopted|passed|ordered|enacted|engrossed|accepted|sustained|read|approved", low) and "rejected" not in low else \
                     "Fail" if re.search(r"rejected|negatived|not sustained", low) else ""
            out.append({"date": date, "chamber": branch, "floor": True, "motion": " ".join(text.split())[:300], "ayes": int(m.group(1)),
                        "noes": int(m.group(2)), "abstain": 0, "result": result, "members": {}, "_no": int(m.group(3)) if m.group(3) else None})
    return out


def norm_name(s):
    return re.sub(r"[^a-z]", "", (s or "").lower())


# ----------------------------------------------------------------------------- per-bill fetch
def fetch_bill(num, legs, rc_cache):
    d = get_json(f"{API}/Documents/{urllib.request.quote(num)}", timeout=240)
    if not d:
        return num, None
    h = get_json(f"{API}/Documents/{urllib.request.quote(num)}/DocumentHistoryActions", timeout=240) or []
    actions = []
    for a in h:
        if a.get("IsStricken"):
            continue
        actions.append((iso(a.get("Date")), a.get("Branch") or "", a.get("Action") or ""))
    actions.sort(key=lambda x: x[0])  # stable: same-day order kept
    votes = tallies(actions)
    # Senate roll calls with members
    for rc in d.get("RollCalls") or []:
        branch, n = rc.get("Branch"), rc.get("RollCallNumber")
        if branch != "Senate" or n is None:
            continue
        with rc_cache["lock"]:
            detail = rc_cache.get(n, "missing")
        if detail == "missing":
            detail = get_json(f"{API}/Branches/Senate/RollCalls/{n}", timeout=120)
            with rc_cache["lock"]:
                rc_cache[n] = detail
        if not detail:
            continue
        members, ay, no, ab = {}, 0, 0, 0
        for key, lst in detail.items():
            if not isinstance(lst, list) or not lst or not isinstance(lst[0], dict) or "MemberCode" not in lst[0]:
                continue
            kind = "AYE" if key.lower().startswith("yea") else "NOE" if key.lower().startswith("nay") else "ABSTAIN"
            for m in lst:
                code = m["MemberCode"]
                nm = legs[code]["name"] if code in legs else code
                members[nm] = {"legislator": code if code in legs else None, "vote": kind}
                ay += kind == "AYE"; no += kind == "NOE"; ab += kind == "ABSTAIN"
        target = next((v for v in votes if v["_no"] == n and v["chamber"] == "Senate"), None)
        if target is None:
            date = next((iso(detail[k]) for k in detail if "date" in k.lower() and isinstance(detail.get(k), str)), "") or (actions[-1][0] if actions else "")
            target = {"date": date, "chamber": "Senate", "floor": True, "motion": clean(detail.get("QuestionMotion") or f"Senate roll call {n}"),
                      "ayes": 0, "noes": 0, "abstain": 0, "result": "", "members": {}, "_no": n}
            votes.append(target)
        if members:
            target.update(members=members, ayes=ay, noes=no, abstain=ab)
            if not target["result"]:
                target["result"] = "Pass" if ay > no else "Fail"
    for v in votes:
        v.pop("_no", None)
    return num, {"detail": d, "actions": actions, "votes": votes}


def build_bill(row, rec, legs):
    d, actions = rec["detail"], rec["actions"]
    num = row["BillNumber"]
    typ = re.match(r"[A-Z]+", num).group(0)
    number = int(num[len(typ):]) if num[len(typ):].isdigit() else num[len(typ):]
    status, chapter = derive_status(actions)
    last = actions[-1] if actions else ("", "", "")
    pin = clean(d.get("Pinslip"))
    title = clean(d.get("Title") or row.get("Title"), 1000)
    if pin:
        digest, src = pin, "MA bill pinslip (official summary)"
    else:
        digest, src = title, "MA bill title (no pinslip published)"
    bill = {"id": f"194:{num}", "type": typ, "number": number, "session": "194", "title": title, "digest": digest, "digest_source": src,
            "status": status, "status_raw": " ".join(last[2].split())[:300], "last_action": " ".join(last[2].split())[:500], "last_action_date": last[0],
            "house": "House" if typ.startswith("H") else "Senate", "location_name": "", "chapter": chapter, "chaptered": status == "Chaptered",
            "url": f"https://malegislature.gov/Bills/194/{num}", "authors": [], "action_count": len(actions),
            "docket_number": d.get("DocketNumber") or row.get("DocketNumber") or "", "sponsor_committee": ""}
    cr = d.get("CommitteeRecommendations") or []
    if cr:
        bill["location_name"] = (cr[-1].get("Committee") or {}).get("CommitteeCode", "")
    ps = d.get("PrimarySponsor") or {}
    seen = set()

    def add(sp, role):
        sid = sp.get("Id")
        if sp.get("Type") == 2:
            if role == "LEAD_AUTHOR":
                bill["sponsor_committee"] = sp.get("Name") or ""
            return
        key = sid or sp.get("Name")
        if key in seen:
            return
        seen.add(key)
        house = (legs.get(sid) or {}).get("house") or ""
        bill["authors"].append({"legislator": sid if sid in legs else None, "name": sp.get("Name") or "", "role": role, "house": house})
    if ps:
        add(ps, "LEAD_AUTHOR")
    for c in d.get("Cosponsors") or []:
        add(c, "COAUTHOR")
    if d.get("JointSponsor"):
        add(d["JointSponsor"], "COAUTHOR")
    return bill


def write_outputs(bills, legs, votes, hist):
    OUT.mkdir(parents=True, exist_ok=True)
    dump = lambda o: json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    (OUT / "bills.json").write_text(dump(bills) + "\n", encoding="utf-8")
    (OUT / "legislators.json").write_text(dump(legs) + "\n", encoding="utf-8")
    with gzip.open(OUT / "votes.json.gz", "wt", encoding="utf-8") as fh:
        fh.write(dump(votes))
    with gzip.open(OUT / "history.json.gz", "wt", encoding="utf-8") as fh:
        fh.write(dump(hist))


def report(bills, legs, votes, hist, notes):
    from collections import Counter
    n = len(bills)
    st = Counter(b["status"] for b in bills.values())
    lines = ["# Massachusetts (194th General Court, 2025-26) extract report", "",
             f"- bills: {n} ({sum(1 for b in bills.values() if b['type'].startswith('H'))} House, {sum(1 for b in bills.values() if b['type'].startswith('S'))} Senate)",
             f"- with pinslip digest: {sum(1 for b in bills.values() if b['digest_source'].startswith('MA bill pinslip'))}; title-only digest: {sum(1 for b in bills.values() if 'title' in b['digest_source'])}",
             f"- with authors: {sum(1 for b in bills.values() if b['authors'])}; committee-sponsored (sponsor_committee): {sum(1 for b in bills.values() if b.get('sponsor_committee'))}",
             f"- legislators: {len(legs)}",
             f"- bills with votes: {len(votes)} ({sum(len(v) for v in votes.values())} votes; {sum(1 for vs in votes.values() for v in vs if v['members'])} with member-level rolls)",
             f"- bills with history: {len(hist)}", "- status: " + ", ".join(f"{k} {v}" for k, v in sorted(st.items())), "",
             "## Sources", "- malegislature.gov JSON API (Documents, DocumentHistoryActions, LegislativeMembers, Branches/Senate/RollCalls).", "",
             "## Known gaps"] + [f"- {x}" for x in notes]
    (OUT / "extract_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--resume", action="store_true", help="skip bills already present in the committed history file")
    args = ap.parse_args()
    legs = load_legislators()
    print(f"{len(legs)} legislators loaded", flush=True)
    docs = get_json(f"{API}/Documents", timeout=300) or []
    rows = {}
    skipped_docket = 0
    for r in docs:
        num = (r.get("BillNumber") or "").strip()
        if num:
            rows[num] = r
        else:
            skipped_docket += 1
    nums = sorted(rows, key=lambda x: (x[0], int(re.sub(r"\D", "", x) or 0)))
    if args.limit:
        nums = nums[:args.limit]
    print(f"{len(docs)} documents, {len(nums)} numbered bills, {skipped_docket} docket-only skipped", flush=True)
    bills, votes, hist = {}, {}, {}
    if args.resume and (OUT / "bills.json").exists():
        bills = json.loads((OUT / "bills.json").read_text(encoding="utf-8"))
        votes = json.load(gzip.open(OUT / "votes.json.gz", "rt", encoding="utf-8"))
        hist = json.load(gzip.open(OUT / "history.json.gz", "rt", encoding="utf-8"))
        print(f"resuming with {len(bills)} bills", flush=True)
    import threading
    rc_cache = {"lock": threading.Lock()}
    todo = [n for n in nums if f"{re.match(r'[A-Z]+', n).group(0)} {int(re.sub(r'[^0-9]', '', n))}" not in bills]
    done = failed = 0
    with ThreadPoolExecutor(WORKERS) as ex:
        for num, rec in ex.map(lambda n: fetch_bill(n, legs, rc_cache), todo):
            if not rec:
                failed += 1
                continue
            b = build_bill(rows[num], rec, legs)
            key = f"{b['type']} {b['number']}"
            bills[key] = b
            hist[key] = [[a[0], i + 1, " ".join(a[2].split())] for i, a in enumerate(rec["actions"])]
            if rec["votes"]:
                votes[key] = rec["votes"]
            done += 1
            if done % 1500 == 0:
                write_outputs(bills, legs, votes, hist)
                print(f"progress {done}/{len(todo)} (failed {failed})", flush=True)
    notes = [f"{skipped_docket} docket-only filings without a bill number are not included (they receive numbers after the filing deadline).",
             "House roll calls are published only as PDFs (\"YEA and NAY No. N\"); House votes carry the tally parsed from the history action text and empty `members`. Senate roll calls linked to a bill have member-level votes.",
             "Committee votes are not included. Digest is the official Pinslip where one exists; otherwise the title.",
             "Status is derived from history action text; most filings die quietly in committee and stay 'In Committee Process' while the 194th session runs to January 2027.",
             f"{failed} bills failed to fetch after retries." if failed else "No fetch failures."]
    write_outputs(bills, legs, votes, hist)
    report(bills, legs, votes, hist, notes)
    print(f"MA: {len(bills)} bills, {len(legs)} legislators, {sum(len(v) for v in votes.values())} votes, failed {failed}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
