#!/usr/bin/env python3
"""Extract Council of the District of Columbia (Council Period 26, 2025-26) legislation from LIMS into the multi-state contract files.

Writes data-state/states/DC/: bills.json, legislators.json, votes.json.gz, history.json.gz, extract_report.md
Source: https://lims.dccouncil.gov/api/Search/* (the public JSON that the LIMS web app itself uses; no token needed):
  POST /api/Search/SearchResult           paged search (council period 26, Bill + Resolution categories) -> legislation numbers
  GET  /api/Search/GetLegislationDetails/<number>   full record: title, summary, sponsors, history, committee marks, council roll calls
  (204 = no such number.)  Sequential probing of B26-nnnn / PR26-nnnn fills any gaps in the search listing.
Only B26-xxxx (bills) and PR26-xxxx (proposed resolutions) are kept; ceremonial (CER), hearings (HN), contracts etc. are skipped.
"""
import argparse, gzip, html, json, re, subprocess, sys, time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data-state/states/DC"
BASE = "https://lims.dccouncil.gov"
PERIOD = "26"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 av-observatory-research",
      "Accept": "application/json, text/plain, */*"}
WORKERS = 5

# LIMS exposes neither party nor ward for members; this table is from public knowledge of the 2025-26 Council.
MEMBER_INFO = {
    ("mendelson", ""): ("Chairman", "DEM"), ("henderson", ""): ("At-Large", "IND"), ("bonds", ""): ("At-Large", "DEM"),
    ("white", "robert"): ("At-Large", "DEM"), ("white", "trayon"): ("Ward 8", "DEM"), ("mcduffie", ""): ("At-Large", "IND"),
    ("silverman", ""): ("At-Large", "IND"), ("nadeau", ""): ("Ward 1", "DEM"), ("pinto", ""): ("Ward 2", "DEM"),
    ("frumin", ""): ("Ward 3", "DEM"), ("lewis george", ""): ("Ward 4", "DEM"), ("parker", ""): ("Ward 5", "DEM"),
    ("allen", ""): ("Ward 6", "DEM"), ("felder", ""): ("Ward 7", "DEM"),
}
STATS = Counter()
T0 = time.time()


def log(msg):
    line = f"[{time.time() - T0:6.0f}s] {msg}"
    print(line, flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "progress.log", "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def fetch(path, data=None, tries=3, max_time=120):
    """GET/POST JSON through curl, which enforces a hard total time limit (urllib only limits idle sockets)."""
    body = json.dumps(data) if data is not None else None
    cmd = ["curl", "-sS", "--compressed", "--max-time", str(max_time), "-A", UA["User-Agent"], "-H", "Accept: application/json",
           "-w", "\n%{http_code}", BASE + path]
    if body is not None:
        cmd[1:1] = ["-X", "POST", "-H", "Content-Type: application/json", "--data-binary", "@-"]
    for attempt in range(tries):
        t0 = time.time()
        try:
            r = subprocess.run(cmd, input=body.encode() if body is not None else None, capture_output=True, timeout=max_time + 20)
            out = r.stdout.decode("utf-8", "replace")
            raw, _, code = out.rpartition("\n")
            code = int(code or 0)
            if code == 204 or code == 404:
                return None
            if code == 200:
                return json.loads(raw) if raw.strip() else None
            if code == 429:
                time.sleep(30)
            log(f"retry {attempt} {path}: HTTP {code} rc={r.returncode} {r.stderr.decode('utf-8', 'replace')[:100]} ({time.time() - t0:.0f}s)")
        except Exception as e:
            log(f"retry {attempt} {path}: {type(e).__name__} {e} ({time.time() - t0:.0f}s)")
        time.sleep(2 ** attempt)
    STATS["fetch_failed"] += 1
    log(f"GAVE UP {path}")
    return None


def clean(s, limit=3500):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s or "")).split())[:limit]


def iso(entry):
    d = (entry.get("sortDate") or "")[:10]
    if d and not d.startswith("0001"):
        return d
    try:
        return time.strftime("%Y-%m-%d", time.strptime(entry.get("date", ""), "%b %d, %Y"))
    except Exception:
        return ""


def list_numbers():
    """Legislation numbers for Council Period 26 from the search service."""
    found = set()
    master = fetch("/api/Search/GetSearchMaster")
    if not master:
        return found
    master.pop("masterData", None)
    for cat in ("1", "6"):  # Bill, Resolution
        body = json.loads(json.dumps(master))
        body["councilPeriodId"]["ids"] = [PERIOD]
        body["legislationCategoryId"]["ids"] = [cat]
        size, idx, total = 100, 0, None
        while True:
            body["pagination"] = {"pageSize": size, "pageIndex": idx, "totalCount": 0}
            res = fetch("/api/Search/SearchResult", body)
            if idx == 0:
                log(f"first page cat {cat} size {size}: {bool(res)}")
            if not res:
                break
            results = (res.get("searchResults") or {}).get("results") or []
            total = (res.get("pagination") or {}).get("totalCount", total)
            if idx == 0 and results and total and len(results) < min(size, total):
                size, idx = len(results), 0  # the service caps the page size: restart with its cap
                log(f"page size capped at {size}")
                continue
            before = len(found)
            for r in results:
                found.add(r["legislationNumber"])
            if not results or (total and (idx + 1) * size >= total) or (idx > 3 and len(found) == before):
                break
            idx += 1
            if idx % 20 == 0:
                log(f"  category {cat} page {idx}, {len(found)} numbers")
        log(f"search category {cat}: total={total}, numbers so far {len(found)}")
    return {n for n in found if re.match(rf"^(B|PR){PERIOD}-\d+$", n)}


def probe_missing(have, limit):
    """Sequentially probe B26-n / PR26-n for numbers the search did not list."""
    got = {}
    with ThreadPoolExecutor(WORKERS) as pool:
        for prefix in ("B", "PR"):
            mx = max([int(n.split("-")[1]) for n in have if n.startswith(prefix + PERIOD)] or [0])
            n, misses = 1, 0
            while (misses < 40 or n <= mx + 30) and n < 6000 and (not limit or n <= limit):
                batch = [f"{prefix}{PERIOD}-{i:04d}" for i in range(n, n + 50)]
                todo = [b for b in batch if b not in have]
                for b, d in zip(todo, pool.map(lambda x: fetch(f"/api/Search/GetLegislationDetails/{x}"), todo)):
                    if d:
                        got[b] = d
                        misses = 0
                    else:
                        misses += 1
                n += 50
    log(f"probe found {len(got)} extra numbers not in search")
    return got


def split_name(full):
    full = " ".join((full or "").split())
    m = re.match(r"^(.*?)(?:,\s*(Jr\.?|Sr\.?|II|III))?$", full)
    base, suffix = m.group(1), m.group(2)
    parts = base.split(", ")[0].split()
    last = parts[-1] if parts else base
    if len(parts) >= 3 and " ".join(parts[-2:]).lower() == "lewis george":
        last = "Lewis George"
    first = " ".join(parts[:-len(last.split())]) if parts else ""
    return first, last


class Legs:
    def __init__(self):
        self.d = {}

    def note(self, term_id, name, last_date="", title=""):
        if not term_id:
            return None
        lid = f"DC:{term_id}"
        rec = self.d.setdefault(lid, {"id": lid, "name": "", "first": "", "last": "", "party": "", "house": "Council", "district": "", "active": True, "_last": "", "_title": ""})
        if name:
            name = re.sub(r"[,\s]+(Jr|Sr|II|III)\.?$", "", " ".join(name.split()))
            if "," in name:
                last, first = [x.strip() for x in name.split(",", 1)]
            else:
                first, last = split_name(name)
            if not rec["name"] or not rec["first"]:
                rec.update(name=f"{last}, {first}".strip(", "), first=first, last=last)
        if title:
            rec["_title"] = title
        if last_date and last_date > rec["_last"]:
            rec["_last"] = last_date
        return lid


def map_status(d, hist):
    raw = (d.get("status") or "").strip()
    s = raw.lower()
    types = [h.get("type") for h in hist]
    if "veto" in s:
        return "Vetoed"
    if "deemed approved" in s:
        return "Chaptered"
    if any(k in s for k in ("withdraw", "fail", "disapprov", "expire", "postpone", "reject", "not applicable", "defeat", "lapsed")):
        return "Died"
    if any(k in s for k in ("official law", "enacted", "approved", "adopted", "signed", "law")):
        return "Chaptered"
    if any(k in s for k in ("congressional", "mayor")):
        return "Passed"
    floor = [a for h in hist if h.get("type") == "MeetingVoting" for a in ((h.get("data") or {}).get("meetingActions") or [])]
    if floor:
        return "In Floor Process"
    if "CommitteeReferral" in types or "Committee_ReReferral" in types or "CommitteeMarkup" in types or "PublicHearing" in types:
        return "In Committee Process"
    return "Pending Referral"


def build(num, d, legs):
    hist = d.get("legislationHistory") or []
    hist = sorted(hist, key=lambda h: (iso(h), h.get("sortOrder") or 0))
    prefix = "PR" if num.startswith("PR") else "B"
    number = int(num.split("-")[1])
    key = num
    # sponsors
    authors, sponsor_committee = [], ""
    for blk in (d.get("introducerSummary") or {}).get("summaryDataList") or []:
        label = (blk.get("label") or "").lower()
        content = blk.get("content") or ""
        if label.startswith("introduced by") or label.startswith("co-introduced") or label.startswith("co-sponsored"):
            role = "LEAD_AUTHOR" if label.startswith("introduced by") else "COAUTHOR"
            anchors = re.findall(r'introducerDetail/(\d+)/\d+[^>]*>([^<]+)</a>', content)
            for tid, nm in anchors:
                lid = legs.note(tid, "")
                authors.append({"legislator": lid, "name": nm.strip(), "role": role, "house": "Council", "_tid": tid})
            if not anchors and clean(content):
                authors.append({"legislator": None, "name": clean(content), "role": role, "house": "Council"})
        elif "request" in label or "committee" in label and "referral" not in label:
            sponsor_committee = (sponsor_committee + "; " if sponsor_committee else "") + f"{blk.get('label')}: {clean(content)}"
        else:
            STATS["label:" + (blk.get("label") or "?")] += 1
    # history & votes
    h_out, votes = [], []
    dates = [iso(h) for h in hist if iso(h)]
    for h in hist:
        dt, typ = iso(h), h.get("type")
        data = h.get("data") or {}
        if typ == "Introduction":
            for i in data.get("introducers") or []:
                legs.note(str(i.get("id")), i.get("name"), dt, i.get("title") or "")
        if typ == "MeetingVoting":
            acts = data.get("meetingActions") or []
            texts = []
            for a in acts:
                v = a.get("votes") or {}
                res = v.get("voteResult") or ""
                texts.append(f"{a.get('meetingAction')}: {res}" + (f" ({v.get('voteType')})" if v.get("voteType") else ""))
                members, ay, no, ab = {}, 0, 0, 0
                for vd in ((v.get("votingDetails") or {}).get("voteDetails") or []):
                    ch = (vd.get("voteChoice") or "").strip()
                    if ch.lower() == "vacant":
                        continue
                    lid = legs.note(str(vd.get("councilMemberTermId")), vd.get("councilMember"), dt)
                    vote = "AYE" if ch == "Yes" else "NOE" if ch == "No" else "ABSTAIN"
                    ay += vote == "AYE"
                    no += vote == "NOE"
                    ab += vote == "ABSTAIN"
                    members[" ".join((vd.get("councilMember") or "").split())] = {"legislator": lid, "vote": vote}
                if v:
                    votes.append({"date": dt, "chamber": "Council", "floor": True, "motion": a.get("meetingAction") or "Council vote",
                                  "vote_type": v.get("voteType") or "", "consent_calendar": bool(v.get("onConsentCalendar")),
                                  "ayes": ay, "noes": no, "abstain": ab, "result": res, "members": members})
            text = "; ".join(texts) or h.get("actionText") or "Legislative Meeting"
        elif typ == "CommitteeMarkup":
            vi = {x["voteName"]: x["voteCount"] for x in data.get("votingInformation") or []}
            text = h.get("actionText") or "Committee mark-up"
            votes.append({"date": dt, "chamber": "Council", "floor": False, "motion": text, "ayes": vi.get("Yes", 0), "noes": vi.get("No", 0),
                          "abstain": sum(c for n, c in vi.items() if n not in ("Yes", "No", "Vacant")), "result": "Recorded", "members": {}})
        else:
            text = h.get("actionText") or typ or ""
        h_out.append([dt, h.get("sortOrder") or len(h_out) + 1, clean(text, 500)])
    status = map_status(d, hist)
    law = (d.get("lawNumber") or "").strip()
    act = (d.get("actNumber") or "").strip()
    resn = (d.get("resolutionNumber") or "").strip()
    chapter = ""
    if status == "Chaptered":
        m = re.match(r"L(\d+)-0*(\d+)", law)
        ma = re.match(r"A(\d+)-0*(\d+)", act)
        mr = re.match(r"R(\d+)-0*(\d+)", resn)
        chapter = (f"D.C. Law {m.group(1)}-{m.group(2)}" if m else f"D.C. Act {ma.group(1)}-{ma.group(2)}" if ma else
                   f"Resolution {mr.group(1)}-{mr.group(2)}" if mr else "")
    summary = clean(d.get("additionalInformation") or d.get("shortDescription"))
    title = clean(d.get("title"), 600)
    last = h_out[-1] if h_out else ["", 0, ""]
    bill = {"id": str(d.get("legislationId")), "type": prefix, "number": number, "session": "2025-26", "title": title,
            "digest": summary or title, "digest_source": "DC LIMS bill summary (additionalInformation)" if summary else "DC LIMS title (no summary published)",
            "status": status, "status_raw": d.get("status") or "", "last_action": last[2], "last_action_date": last[0],
            "house": "Council", "location_name": clean(" ".join(c.get("content", "") for c in (d.get("introducerSummary") or {}).get("summaryDataList") or [] if (c.get("label") or "").lower().startswith("committee referral")), 200),
            "chapter": chapter, "chaptered": status == "Chaptered", "url": f"{BASE}/Legislation/{num}",
            "authors": [{k: v for k, v in a.items() if k != "_tid"} for a in authors], "action_count": len(h_out),
            "law_number": law, "act_number": act, "resolution_number": resn}
    if sponsor_committee and not authors:
        bill["sponsor_committee"] = sponsor_committee
    elif sponsor_committee:
        bill["requested_by"] = sponsor_committee
    return key, bill, h_out, votes, authors


def write_all(bills, hist, votes, legs, authors_tid, final=False):
    OUT.mkdir(parents=True, exist_ok=True)
    maxd = max([l["_last"] for l in legs.d.values()] or [""])
    cutoff = ""
    if maxd:
        y, m, dd = map(int, maxd.split("-"))
        cutoff = date.fromordinal(date(y, m, dd).toordinal() - 150).isoformat()
    legislators = {}
    for lid, rec in legs.d.items():
        r = dict(rec)
        if not r["name"]:  # sponsor only seen as a link: use the printed surname
            nm = next((a["name"] for k in authors_tid for a in authors_tid[k] if f"DC:{a['_tid']}" == lid), "")
            r.update(name=nm, last=nm)
        low_last, low_first = r["last"].lower().split(",")[0], r["first"].lower()
        info = MEMBER_INFO.get((low_last, "")) or next((v for (l, f), v in MEMBER_INFO.items() if f and l == low_last and low_first.startswith(f)), None)
        if info:
            r["district"], r["party"] = info
        r["active"] = bool(r["_last"] >= cutoff) if cutoff else True
        r.pop("_last", None)
        r["title"] = r.pop("_title", "")
        r["url"] = f"{BASE}/introducerDetail/{lid.split(':')[1]}/{PERIOD}"
        legislators[lid] = r
    # one person can hold several LIMS term ids (e.g. a re-seated member): merge them under the lowest id
    groups = defaultdict(list)
    for lid, r in legislators.items():
        groups[(r["last"].lower(), (r["first"].lower().split() or [""])[0])].append(lid)
    remap = {}
    for lids in groups.values():
        keep = min(lids, key=lambda x: int(x.split(":")[1]))
        for lid in lids:
            if lid != keep:
                remap[lid] = keep
                legislators[keep]["active"] = legislators[keep]["active"] or legislators[lid]["active"]
                legislators.pop(lid)
    for b in bills.values():
        for a in b["authors"]:
            if a["legislator"] in remap:
                a["legislator"] = remap[a["legislator"]]
            if a["legislator"] and a["legislator"] not in legislators:
                a["legislator"] = None
    for vs in votes.values():
        for v in vs:
            for m in v["members"].values():
                if m["legislator"] in remap:
                    m["legislator"] = remap[m["legislator"]]
    dump = lambda o: json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    (OUT / "bills.json").write_text(dump(bills) + "\n", encoding="utf-8")
    (OUT / "legislators.json").write_text(dump(legislators) + "\n", encoding="utf-8")
    for name, data in (("votes", votes), ("history", hist)):
        with gzip.open(OUT / f"{name}.json.gz", "wt", encoding="utf-8") as fh:
            fh.write(dump(data))
    return legislators


def report(bills, votes, legislators, extra):
    n = len(bills)
    by = Counter(b["status"] for b in bills.values())
    raw = Counter(b["status_raw"] for b in bills.values())
    fl = sum(1 for vs in votes.values() for v in vs if v["floor"])
    lines = [
        "# DC Council extract report (Council Period 26, 2025-26)", "",
        f"- Bills + proposed resolutions: {n} ({sum(1 for b in bills.values() if b['type'] == 'B')} bills B26-, {sum(1 for b in bills.values() if b['type'] == 'PR')} resolutions PR26-)",
        f"- With a published LIMS summary (digest): {sum(1 for b in bills.values() if b['digest_source'].startswith('DC LIMS bill summary'))}/{n}; remaining digests fall back to the title",
        f"- With authors: {sum(1 for b in bills.values() if b['authors'])}/{n}; with sponsor_committee/requestor only: {sum(1 for b in bills.values() if not b['authors'] and b.get('sponsor_committee'))}",
        f"- Bills with recorded votes: {len(votes)} ({sum(len(v) for v in votes.values())} votes, {fl} floor roll calls)",
        f"- Legislators: {len(legislators)} (active {sum(1 for l in legislators.values() if l['active'])})",
        "", "## Status (normalized)", ""] + [f"- {k}: {v}" for k, v in by.most_common()] + ["", "## Status (LIMS raw)", ""] + [f"- {k}: {v}" for k, v in raw.most_common()] + [
        "", "## Sources", "",
        "- LIMS public JSON used by the LIMS web app: POST /api/Search/SearchResult (list), GET /api/Search/GetLegislationDetails/<number> (record, history, sponsors, council roll calls, committee mark-up tallies).",
        "- The documented /api/v2/PublicData/* API requires an access token and was not used.",
        "", "## Mapping notes", "",
        "- Introduced by -> LEAD_AUTHOR; Co-Introduced by -> COAUTHOR. Executive-requested measures carry no introducer; the requestor text is kept in sponsor_committee/requested_by.",
        "- Adopted/approved/deemed-approved resolutions are mapped to status 'Chaptered' (chapter 'Resolution NN-N'); Acts/Laws use 'D.C. Act NN-N' / 'D.C. Law NN-N'.",
        "- 'Under Council Review' is refined from history: council first/final reading -> In Floor Process; referral/hearing/mark-up -> In Committee Process; else Pending Referral.",
        "- Votes: each council meeting action (first/final reading, etc.) with a vote is a floor vote; voice votes list every member as recorded (Yes). Committee mark-ups carry tallies only (no member list).",
        "- Member party and ward come from a hardcoded table (LIMS exposes neither); unknown members are left blank.",
        "- DC has no state legislative districts; district is Ward N / At-Large / Chairman.", "", "## Known gaps", ""] + [f"- {x}" for x in extra]
    (OUT / "extract_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", default="0", help="cap on bill numbers per prefix for testing (0 = all)")
    args = ap.parse_args()
    limit = int(args.limit or 0)
    listed = list_numbers()
    log(f"search listed {len(listed)} B/PR numbers")
    todo = sorted(listed, key=lambda x: (x.startswith("PR"), int(x.split("-")[1])))
    if limit:
        todo = [t for t in todo if int(t.split("-")[1]) <= limit]
    details = {}
    legs, bills, hist, votes, auth = Legs(), {}, {}, {}, {}

    def ingest(num, d):
        key, bill, h, v, a = build(num, d, legs)
        bills[key], hist[key], auth[key] = bill, h, a
        if v:
            votes[key] = v

    done = 0
    with ThreadPoolExecutor(WORKERS) as pool:
        def one(x):
            return x, fetch(f"/api/Search/GetLegislationDetails/{x}")
        for num, d in pool.map(one, todo):
            if d:
                ingest(num, d)
            else:
                STATS["listed_but_no_details"] += 1
            done += 1
            if done % 100 == 0:
                log(f"{done}/{len(todo)} details")
                write_all(bills, hist, votes, legs, auth)
    for num, d in probe_missing(set(todo), limit).items():
        ingest(num, d)
    legislators = write_all(bills, hist, votes, legs, auth, final=True)
    extra = [f"counter {k}: {v}" for k, v in sorted(STATS.items()) if not k.startswith("label:")] or ["no fetch failures"]
    extra.append("Digest = LIMS 'BILL SUMMARY' text where the Council published one; many bills (and most resolutions) have none, so the title is used.")
    extra.append("Committee reports/abstracts are PDFs and not read.")
    report(bills, votes, legislators, extra)
    (OUT / "progress.log").unlink(missing_ok=True)
    print(f"DC: {len(bills)} bills, {len(legislators)} legislators, votes for {len(votes)} bills", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
