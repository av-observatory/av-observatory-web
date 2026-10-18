#!/usr/bin/env python3
"""Florida bills, sponsors, floor roll calls, histories and digests for the 2025-26 period.

Writes data-state/states/FL/ (contract: docs/multi-state-spec.md):
  bills.json  legislators.json  votes.json.gz  history.json.gz  extract_report.md

Sources (florida has no public bulk/API feed reachable from here; all HTML/PDF from www.flsenate.gov):
  * bill lists      https://www.flsenate.gov/Session/Bills/<session>   (one per session, paged 50 rows)
  * bill pages      https://www.flsenate.gov/Session/Bill/<session>/<number>  (title, summary line, sponsors, history, vote links)
  * floor roll calls  PDFs linked from the bill page (parsed with pdftotext -layout; members are printed as Name-District)
  * members         https://www.flsenate.gov/Senators/  and  https://www.flhouse.gov/Sections/Representatives/representatives.aspx
Sessions: 2025 and 2026 regular sessions plus the special sessions 2025A/B/C and 2026D/E/F.
Keys are "<TYPE> <NUMBER> (<session>)" because each session is numbered separately.
Run from a GitHub Actions workflow only (the sandbox cannot reach the state site).
"""
import argparse, gzip, json, re, subprocess, sys, tempfile, threading, time, unicodedata
import urllib.error, urllib.parse, urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data-state/states/FL"
BASE = "https://www.flsenate.gov"
UA = "Mozilla/5.0 (compatible; StateTrack-research/1.0; +https://github.com/av-observatory/av-observatory-web)"
SESSIONS = ["2025", "2025A", "2025B", "2025C", "2026", "2026D", "2026E", "2026F"]
RESOLUTION_TYPES = {"HR", "SR", "HCR", "SCR", "HM", "SM"}
EXTRA_BILL_TYPES = ["5,18", "6,16", "7,19", "8,17"]  # joint resolutions, resolutions, concurrent resolutions, memorials

# ----------------------------------------------------------------------------- http
_lock, _last = threading.Lock(), [0.0]
MIN_GAP = 0.45  # seconds between any two requests across all workers


def fetch(url, binary=False, tries=7):
    wait = 5
    for attempt in range(tries):
        with _lock:
            gap = _last[0] + MIN_GAP - time.time()
            if gap > 0:
                time.sleep(gap)
            _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            return data if binary else data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            ra = e.headers.get("Retry-After") if e.headers else None
            delay = int(ra) if ra and ra.isdigit() else wait
            if e.code not in (429, 500, 502, 503, 504, 403) or attempt == tries - 1:
                print(f"HTTP {e.code} {url}", file=sys.stderr)
                return None
            time.sleep(min(delay, 120))
            wait = min(wait * 2, 120)
        except Exception as e:  # network hiccup
            if attempt == tries - 1:
                print(f"FAIL {url}: {e}", file=sys.stderr)
                return None
            time.sleep(wait)
            wait = min(wait * 2, 120)
    return None


def text_of(h):
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", h or "")).replace("\xa0", " ").split())


def iso(mdy):
    try:
        return datetime.strptime(mdy.strip(), "%m/%d/%Y").strftime("%Y-%m-%d")
    except Exception:
        return ""


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


# ----------------------------------------------------------------------------- members
def party_code(p):
    p = (p or "").strip().lower()
    return {"republican": "REP", "democrat": "DEM", "democratic": "DEM", "independent": "IND"}.get(p, p[:3].upper() if p else "")


def split_name(full):
    last, _, first = full.partition(",")
    last = re.sub(r"[\s,]+(Jr|Sr|II|III|IV)\.?$", "", last.strip())
    return last.strip(), first.strip()


def load_members():
    legs = {}
    h = fetch(BASE + "/Senators/") or ""
    for m in re.finditer(r'<tr[^>]*>\s*<th[^>]*>\s*<a class="senatorLink" href="([^"]+)">(.*?)</a>(.*?)</tr>', h, re.S):
        href, inner, rest = m.groups()
        name = text_of(re.sub(r"<img[^>]*>", "", inner))
        tds = re.findall(r"<td[^>]*>(.*?)</td>", rest, re.S)
        dist = text_of(tds[0]) if tds else ""
        party = text_of(tds[1]) if len(tds) > 1 else ""
        if "vacant" in name.lower():
            continue
        last, first = split_name(name)
        lid = f"FL:S{dist}"
        legs[lid] = {"id": lid, "name": name, "first": first, "last": last, "party": party_code(party), "house": "Senate",
                     "district": dist, "active": True, "url": BASE + href}
    h = fetch("https://www.flhouse.gov/Sections/Representatives/representatives.aspx") or ""
    for m in re.finditer(r'<a href="(/Sections/Representatives/details\.aspx\?MemberId=\d+[^"]*)"[^>]*>.*?<h5>(.*?)</h5>\s*<p>(.*?)</p>', h, re.S):
        href, name, line = m.groups()
        name, line = text_of(name), text_of(line)
        if "vacant" in name.lower():
            continue
        pm = re.match(r"(.*?)\s*[—-]+\s*District:\s*(\d+)", line)
        if not pm:
            continue
        last, first = split_name(name)
        lid = f"FL:H{pm.group(2)}"
        legs[lid] = {"id": lid, "name": name, "first": first, "last": last, "party": party_code(pm.group(1)), "house": "House",
                     "district": pm.group(2), "active": True, "url": "https://www.flhouse.gov" + unescape(href)}
    return legs


class Roster:
    def __init__(self, legs):
        self.legs = legs
        self.stub_count = 0
        self._index()

    def _index(self):
        self.by_last = defaultdict(list)
        for lid, l in self.legs.items():
            self.by_last[(l["house"], norm(l["last"]))].append(lid)

    def by_district(self, chamber, district, printed_name):
        """Resolve a roll-call member (Name-District). Adds an inactive stub if a different person held the seat."""
        letter = "S" if chamber == "Senate" else "H"
        lid = f"FL:{letter}{district}"
        want = norm(re.sub(r"^President\s+|^Speaker\s+", "", printed_name.split(",")[0], flags=re.I))
        cur = self.legs.get(lid)
        if cur and (norm(cur["last"]) == want or norm(cur["last"]).startswith(want) or want.startswith(norm(cur["last"]))):
            return lid
        sid = f"{lid}-{want.replace(' ', '')}"
        if sid not in self.legs:
            self.legs[sid] = {"id": sid, "name": printed_name, "first": "", "last": printed_name.split(",")[0], "party": "",
                              "house": chamber, "district": str(district), "active": False}
            self.stub_count += 1
            self._index()
        return sid

    def by_name(self, name, bill_chamber):
        """Match a sponsor name (last name, optionally 'Last, F.') to a legislator id; None if unmatched or ambiguous."""
        last, _, ini = name.partition(",")
        last_n, ini = norm(last), norm(ini)[:1]
        for ch in (bill_chamber, "House" if bill_chamber == "Senate" else "Senate"):
            ids = self.by_last.get((ch, last_n), [])
            if len(ids) > 1 and ini:
                ids = [i for i in ids if norm(self.legs[i]["first"]).startswith(ini)] or ids
            if len(ids) > 1:
                cur = [i for i in ids if self.legs[i]["active"]]
                ids = cur if len(cur) == 1 else ids
            if len(ids) == 1:
                return ids[0]
            if ids:
                return None
        # compound-surname fallbacks (e.g. "Gonzalez Pittman" printed as "Pittman")
        for ch in (bill_chamber,):
            ids = [i for i, l in self.legs.items() if l["house"] == ch and norm(l["last"]).endswith(" " + last_n)]
            if len(ids) == 1:
                return ids[0]
        return None


# ----------------------------------------------------------------------------- bill list
def list_session(session, extra_type=None, base_first=None):
    seen, out, n = set(), [], 1
    while n < 300:
        if n % 10 == 1:
            print(f"  list {session} type={extra_type} page {n} ({len(out)} so far)", flush=True)
        url = (f"{BASE}/Session/Bills/{session}?Chamber=both&SearchOnlyCurrentVersion=True&LegislativeSessionTitle={session}"
               f"&IsIncludeAmendments=False&IsFirstReference=True&pageNumber={n}")
        if extra_type:
            url += "&BillType=" + urllib.parse.quote(extra_type)
        h = fetch(url)
        if not h:
            break
        fresh = 0
        for m in re.finditer(r'<th scope="row"><a href="(/Session/Bill/[^"]+)">([^<]+)</a></th>', h):
            href, label = m.group(1), unescape(m.group(2)).strip()
            if label in seen:
                continue
            seen.add(label)
            fresh += 1
            out.append((label, href))
        if not fresh:
            break
        if n == 1 and base_first and {l for l, _ in out} == base_first:
            print("  type filter ignored by the site; skipping", flush=True)
            return []
        n += 1
    return out


# ----------------------------------------------------------------------------- bill page
COMMITTEE_WORDS = re.compile(r"committee|subcommittee|council|commission|rules|calendar|select|conference|delegation|caucus|office|department", re.I)


def parse_bill_page(h):
    r = {}
    m = re.search(r"<h2>\s*(.*?)\s*</h2>", h, re.S)
    if not m:
        return None
    head = text_of(m.group(1))
    hm = re.match(r"((?:CS/)*)([A-Z]+)\s+(\S+?):\s*(.*)", head)
    r["title"] = hm.group(4) if hm else head
    # sponsor paragraph
    sp = re.search(r"</h2>\s*<p>\s*(.*?)<span>by</span>(.*?)</p>", h, re.S)
    r["kind"] = text_of(sp.group(1)) if sp else ""
    primary, co = [], []
    if sp:
        body = text_of(sp.group(2))
        a, _, b = body.partition("(CO-INTRODUCERS)")
        primary = [x.strip() for x in a.split(";") if x.strip()]
        co = [x.strip() for x in b.split(";") if x.strip()]
    r["primary"], r["co"] = primary, co
    sm = re.search(r'<p class="width80">(.*?)</p>', h, re.S)
    r["summary"] = text_of(sm.group(1)) if sm else ""
    # history
    hist = []
    sec = re.search(r'id="tabBodyBillHistory".*?<tbody>(.*?)</tbody>', h, re.S)
    if sec:
        for row in re.findall(r"<tr>(.*?)</tr>", sec.group(1), re.S):
            tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
            if len(tds) < 3:
                continue
            d = iso(text_of(tds[0]))
            for b in tds[2].split("&bull;"):
                t = text_of(b)
                if t:
                    hist.append((d, t))
    r["history"] = hist
    # floor votes
    votes = []
    vs = re.search(r'id="Votes">Vote History - Floor</h4>(.*?)</table>', h, re.S)
    if vs:
        for row in re.findall(r"<tr>(.*?)</tr>", vs.group(1), re.S):
            tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
            lk = re.search(r'href="([^"]+\.PDF)"', row, re.I)
            if len(tds) >= 4 and lk:
                votes.append({"stamp": text_of(tds[1]), "chamber": text_of(tds[2]), "href": unescape(lk.group(1))})
    r["votes"] = votes
    return r


CHAPTER = re.compile(r"^Chapter No\.\s*(\d{4}-\d+)", re.I)
DIED = re.compile(r"^(Died\b|Indefinitely postponed|Withdrawn from consideration|Laid on Table|Failed\b|Temporarily postponed.*?Died)", re.I)
ENROLLED = re.compile(r"(Ordered enrolled|^Enrolled|Signed by Officers and presented to Governor|Presented to Governor|Filed with Secretary of State)", re.I)


def classify(btype, hist, session_over):
    acts = [t for _, t in hist]
    last = acts[-1] if acts else ""
    chapter = ""
    for t in acts:
        m = CHAPTER.match(t)
        if m:
            chapter = m.group(1)
    approved = any(re.match(r"(Approved by Governor|Became law without Governor)", t, re.I) for t in acts)
    if chapter or approved:
        return "Chaptered", chapter
    if any(re.match(r"Vetoed by Governor", t, re.I) for t in acts):
        return "Vetoed", ""
    died_last = bool(DIED.match(last))
    if any(ENROLLED.search(t) for t in acts) and not died_last:
        return "Passed", ""
    if btype in RESOLUTION_TYPES and any(re.match(r"Adopted\b|CS adopted|Adopted, as amended", t, re.I) for t in acts) and not died_last:
        return "Passed", ""
    if died_last or session_over:
        return "Died", ""
    low = last.lower()
    if re.search(r"placed on calendar|read 2nd|read 3rd|special order|third reading|second reading|on 3rd|on 2nd|in messages|received", low):
        return "In Floor Process", ""
    if re.search(r"referred to|now in|committee|subcommittee|agenda", low):
        return "In Committee Process", ""
    return "Pending Referral", ""


# ----------------------------------------------------------------------------- roll-call PDFs
CODE = r"(?:(Y|N|EX|AV)\s+)?"
ENTRY = re.compile(r"(?:^|\s{2,})" + CODE + r"(\S.*?)-(\d{1,3})(?=\s{2,}|\s*$)")


def parse_vote_pdf(pdf_bytes, roster):
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(pdf_bytes)
        f.flush()
        try:
            txt = subprocess.run(["pdftotext", "-layout", f.name, "-"], capture_output=True, text=True, timeout=60).stdout
        except Exception:
            return None
    if "Yeas -" not in txt:
        return None
    chamber = "Senate" if "The Florida Senate" in txt.split("\n", 3)[0] + txt[:300] else "House"
    lines = txt.splitlines()
    dm = re.search(r"Date:\s*(\d\d)/(\d\d)/(\d{4})", txt)
    d = f"{dm.group(3)}-{dm.group(1)}-{dm.group(2)}" if dm else ""
    tm = re.search(r"Yeas\s*-\s*(\d+)\s+Nays\s*-\s*(\d+)(?:\s+Not Voting\s*-\s*(\d+))?", txt)
    ayes, noes, nv = int(tm.group(1)), int(tm.group(2)), int(tm.group(3) or 0)
    # motion = last non-empty line between the "Calendar Page" line and the Yeas line
    motion = ""
    start = next((i for i, l in enumerate(lines) if l.startswith("Calendar Page")), 0)
    ypos = next(i for i, l in enumerate(lines) if "Yeas -" in l)
    block = [l.strip() for l in lines[start + 1:ypos] if l.strip()]
    if block:
        motion = block[-1]
    members, started = {}, False
    for l in lines[ypos + 1:]:
        if l.strip().startswith("Presiding"):
            started = True
            continue
        if not started or re.search(r"Y=Yea|N=Nay", l):
            continue
        for m in ENTRY.finditer(l):
            code, name, dist = m.group(1), m.group(2).strip(), m.group(3)
            v = "AYE" if code == "Y" else "NOE" if code == "N" else "ABSTAIN"
            members[name] = {"legislator": roster.by_district(chamber, dist, name), "vote": v}
    cnt = Counter(v["vote"] for v in members.values())
    ok = cnt["AYE"] == ayes and cnt["NOE"] == noes
    return {"date": d, "chamber": chamber, "floor": True, "motion": motion, "ayes": ayes, "noes": noes, "abstain": nv,
            "result": "Passed" if ayes > noes else "Failed", "members": members if ok else {}, "_parsed_ok": ok}


# ----------------------------------------------------------------------------- per bill
def process(session, label, href, roster, session_over, want_votes=True):
    m = re.match(r"([A-Z]+)\s+(\S+)$", label)
    if not m:
        return None
    btype, num = m.groups()
    h = fetch(BASE + href)
    if not h:
        return None
    p = parse_bill_page(h)
    if not p:
        return None
    number = int(num) if num.isdigit() else num
    key = f"{btype} {num} ({session})"
    chamber = "House" if btype.startswith("H") else "Senate"
    hist = p["history"]
    if not session_over and hist:
        session_over = (date.today() - date.fromisoformat(hist[-1][0])).days > 45
    status, chapter = classify(btype, hist, session_over)
    authors, committee = [], ""
    for i, nm in enumerate(p["primary"] + p["co"]):
        is_primary = i < len(p["primary"])
        if COMMITTEE_WORDS.search(nm) and is_primary:
            committee = nm
            continue
        authors.append({"legislator": roster.by_name(nm, chamber), "name": nm, "role": "LEAD_AUTHOR" if is_primary else "COAUTHOR",
                        "house": chamber})
    last_action = hist[-1][1] if hist else ""
    bill = {
        "id": f"FL-{session}-{btype}{num}", "type": btype, "number": number, "session": session,
        "title": p["title"], "digest": p["summary"][:3500], "digest_source": "FL bill summary (Senate bill page)",
        "status": status, "status_raw": last_action, "last_action": last_action,
        "last_action_date": hist[-1][0] if hist else "", "house": chamber, "location_name": "",
        "chapter": f"Chapter {chapter}, Laws of Florida" if chapter else "", "chaptered": status == "Chaptered",
        "url": BASE + href, "authors": authors, "action_count": len(hist),
    }
    if committee:
        bill["sponsor_committee"] = committee
    votes = []
    if want_votes:
        for v in p["votes"]:
            pdf = fetch(BASE + urllib.parse.quote(v["href"], safe="/%:~"), binary=True)
            if not pdf:
                continue
            pv = parse_vote_pdf(pdf, roster)
            if pv:
                votes.append(pv)
    votes.sort(key=lambda v: v["date"])
    history = [[d, i + 1, t] for i, (d, t) in enumerate(hist)]
    return key, bill, votes, history


# ----------------------------------------------------------------------------- output
def write_all(bills, legs, votes, history, extra=None):
    OUT.mkdir(parents=True, exist_ok=True)
    dump = lambda o: json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n"
    (OUT / "bills.json").write_text(dump(bills), encoding="utf-8")
    (OUT / "legislators.json").write_text(dump(legs), encoding="utf-8")
    for name, data in (("votes", votes), ("history", history)):
        with gzip.open(OUT / f"{name}.json.gz", "wt", encoding="utf-8") as fh:
            json.dump(data, fh, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def load_existing():
    try:
        bills = json.loads((OUT / "bills.json").read_text(encoding="utf-8"))
        votes = json.load(gzip.open(OUT / "votes.json.gz", "rt", encoding="utf-8"))
        hist = json.load(gzip.open(OUT / "history.json.gz", "rt", encoding="utf-8"))
        return bills, votes, hist
    except Exception:
        return {}, {}, {}


def report(bills, legs, votes, history, notes):
    n = len(bills)
    c = Counter(b["status"] for b in bills.values())
    per = Counter(b["session"] for b in bills.values())
    vb = [k for k, v in votes.items() if v]
    nvotes = sum(len(v) for v in votes.values())
    auth_total = sum(len(b["authors"]) for b in bills.values())
    auth_m = sum(1 for b in bills.values() for a in b["authors"] if a["legislator"])
    lines = [
        "# Florida extract report", "",
        f"Generated {date.today().isoformat()} by scripts/extract-fl-legislature.py (workflow extract-fl.yml).", "",
        "## Counts",
        f"- bills/resolutions: {n}  (by session: {dict(sorted(per.items()))})",
        f"- with digest: {sum(1 for b in bills.values() if b['digest'])}",
        f"- with authors (members): {sum(1 for b in bills.values() if b['authors'])}; committee-sponsored: {sum(1 for b in bills.values() if b.get('sponsor_committee'))}",
        f"- author rows matched to a legislator id: {auth_m} of {auth_total}",
        f"- bills with floor roll calls: {len(vb)} ({nvotes} votes)",
        f"- legislators: {len(legs)} ({sum(1 for l in legs.values() if not l['active'])} inactive/stub from roll calls)",
        f"- history rows: {sum(len(v) for v in history.values())}",
        f"- status: {dict(c)}", "",
        "## Sources",
        "- Florida Senate site (www.flsenate.gov): session bill lists, bill pages (summary line, sponsors, history, vote links), floor roll-call PDFs (pdftotext).",
        "- Members: flsenate.gov/Senators and flhouse.gov representatives list (2024-2026 term).", "",
        "## Known gaps / notes",
    ] + [f"- {x}" for x in notes]
    (OUT / "extract_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", default=",".join(SESSIONS))
    ap.add_argument("--limit", type=int, default=0, help="debug: only the first N bills per session")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--no-votes", action="store_true")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--checkpoint", type=int, default=250)
    args = ap.parse_args()
    sessions = [s for s in args.sessions.split(",") if s]

    legs = load_members()
    print(f"members: {sum(1 for l in legs.values() if l['house']=='Senate')} senators, {sum(1 for l in legs.values() if l['house']=='House')} reps")
    roster = Roster(legs)
    bills, votes, history = load_existing() if args.resume else ({}, {}, {})
    today = date.today()
    notes = []
    for session in sessions:
        items = list_session(session)
        have = {a for a, _ in items}
        extra_new = 0
        for t in EXTRA_BILL_TYPES:
            for label, href in list_session(session, t, base_first={l for l, _ in items[:50]}):
                if label not in have:
                    have.add(label)
                    items.append((label, href))
                    extra_new += 1
        print(f"{session}: {len(items)} listed ({extra_new} from resolution/memorial/JR type filters)", flush=True)
        if args.limit:
            items = items[:args.limit]
        # a session is over when its latest-dated action is old; judged after we have bills, so use the regular-session calendar
        session_over = session not in ("2026D", "2026E", "2026F")  # later special sessions: judged per bill by activity age
        todo = [(l, h) for l, h in items if f"{l} ({session})" not in bills]
        done = 0
        with ThreadPoolExecutor(max_workers=min(args.workers, 4)) as ex:
            futs = [ex.submit(process, session, l, h, roster, session_over, not args.no_votes) for l, h in todo]
            for f in futs:
                try:
                    res = f.result()
                except Exception as e:
                    print("error", e, file=sys.stderr)
                    continue
                if not res:
                    continue
                key, bill, vs, hist = res
                bills[key] = bill
                if vs:
                    votes[key] = [{k: v for k, v in x.items() if k != "_parsed_ok"} for x in vs]
                    for x in vs:
                        if not x["_parsed_ok"]:
                            notes.append(f"{key} {x['date']} {x['chamber']}: member list did not reconcile with tally; members omitted")
                history[key] = hist
                done += 1
                if done % args.checkpoint == 0:
                    write_all(bills, roster.legs, votes, history)
                    print(f"{session}: {done}/{len(todo)} done", flush=True)
    write_all(bills, roster.legs, votes, history)
    stubs = roster.stub_count
    notes.insert(0, "Digest is the one-sentence bill summary printed on the Senate bill page (subject; summary of the filed/current version). Florida does not publish a longer plain-language digest in a machine-readable feed; staff analysis PDFs exist for some bills but are not ingested.")
    notes.insert(1, "Only floor roll calls are included (committee vote records are PDFs and were not parsed). House voice votes and unrecorded votes have no roll call.")
    notes.insert(2, f"Roll-call members are resolved by chamber+district; {stubs} inactive stub legislators were created where the district's current member differs from the name printed in the vote (members who left office).")
    notes.insert(3, "Keys use the session code as suffix: (2025), (2026) regular sessions and (2025A)/(2025B)/(2025C)/(2026D)/(2026E)/(2026F) special sessions.")
    report(bills, roster.legs, votes, history, notes)
    print(f"FL: {len(bills)} bills, {len(roster.legs)} legislators, {sum(len(v) for v in votes.values())} votes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
