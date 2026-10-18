#!/usr/bin/env python3
"""Washington 2025-26 biennium: bills, sponsors, roll calls, history and bill-report summaries.

Writes data-state/states/WA/ (bills.json, legislators.json, votes.json.gz, history.json.gz, extract_report.md).
Source: Washington Legislature web services (https://wslwebservices.leg.wa.gov, SOAP-over-GET XML) and the
bill reports on https://lawfilesext.leg.wa.gov. Runs only inside GitHub Actions (the sandbox cannot reach the state).
Version records (HB 1210, SHB 1210, 2ESHB 1210 ...) are collapsed into one record per bill number and type.
"""
import argparse, gzip, html, json, re, sys, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data-state/states/WA"
BASE = "https://wslwebservices.leg.wa.gov"
BIENNIUM = "2025-26"
UA = "StateTrack-extract/1.0 (+https://github.com/av-observatory/av-observatory-web)"
TYPES = ("HJR", "SJR", "HJM", "SJM", "HCR", "SCR", "HB", "SB", "HR", "SR")  # 3-letter first
SKIP_TYPES = {"GA", "I"}  # gubernatorial appointments and initiatives are not bills
PARTY = {"D": "DEM", "R": "REP", "I": "IND"}
stats = Counter()
DEBUG = False


def http(url, timeout=90, tries=5):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 404:
                return ""
            wait = int(e.headers.get("Retry-After", "0") or 0) if e.code == 429 else 0
            time.sleep(max(wait, 2 ** i))
        except Exception as e:  # noqa
            last = e
            time.sleep(2 ** i)
    stats["http_fail"] += 1
    print(f"FAILED {url}: {last}", file=sys.stderr)
    return ""


def xml(url):
    text = http(url)
    if not text.strip().startswith("<"):
        return None
    text = re.sub(r'\sxmlns(:\w+)?="[^"]*"', "", text, count=3)
    try:
        return ET.fromstring(text)
    except ET.ParseError:
        stats["xml_parse_fail"] += 1
        return None


def t(el, tag, default=""):
    if el is None:
        return default
    x = el.find(tag)
    return (x.text or "").strip() if x is not None and x.text else default


def base_of(bill_id):
    """'2ESHB 1210' -> ('HB', 1210); None if not a bill we keep."""
    m = re.match(r"^([0-9A-Z]+)\s+(\d+)$", bill_id.strip())
    if not m:
        return None
    letters = re.sub(r"^\d+", "", m.group(1))
    for ty in TYPES + ("HGA", "SGA", "HI", "SI"):
        if letters.endswith(ty):
            return (None, None) if ty in ("HGA", "SGA", "HI", "SI") else (ty, int(m.group(2)))
    return None


def clean_text(s):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


STOP = re.compile(r"^(Votes on Final Passage|Effective Date|Staff Summary|Appropriation|Fiscal Note|Background|Testimony|Persons Testifying|"
                  r"Summary of (?:Amendment|Public)|Public Testimony|House Committee|Senate Committee|Amendments? |Rules Committee|"
                  r"Staff:|Signatures|Brief Description|Committee Activity|Opposed|Other:|OTHER|Signed|-{3,})", re.I)


def report_summary(text):
    t2 = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</h\d>|</tr>|</li>", "\n", text)
    lines = [clean_text(x) for x in t2.split("\n")]
    lines = [x for x in lines if x]
    best = ""
    for pref in (r"^Summary of [^:]{0,100}:?$", r"^Summary:?$", r"^Summary of [^:]{0,100}:\s*\S+"):
        for i, ln in enumerate(lines):
            if re.match(pref, ln, re.I):
                first = re.sub(r"^Summary[^:]*:\s*", "", ln, flags=re.I) if ":" in ln and not ln.endswith(":") else ""
                body = [first] if first else []
                for nxt in lines[i + 1:i + 60]:
                    if STOP.match(nxt) or (nxt.endswith(":") and len(nxt) < 70 and not body == []):
                        break
                    body.append(nxt)
                cand = " ".join(body).strip()
                if len(cand) > len(best):
                    best = cand
                if best:
                    return best[:3500]
    return best[:3500]


def chapter_of(status):
    m = re.match(r"^C\s*(\d+)\s*L\s*(\d+)", status)
    if m:
        return f"Chapter {m.group(1)}, Laws of 20{m.group(2)}"
    m = re.match(r"^PV?\s*C\s*(\d+)\s*L\s*(\d+)", status)
    return f"Chapter {m.group(1)}, Laws of 20{m.group(2)}" if m else ""


def normalize(cs_status, cs_line, veto, partial, hist_lines, resolution):
    st = (cs_status or "").strip()
    ch = chapter_of(st)
    if ch:
        return "Chaptered", ch
    if veto and not partial:
        return "Vetoed", ""
    blob = " | ".join(hist_lines)
    if re.search(r"(?i)governor vetoed|veto", cs_line or "") and not partial and not ch:
        return "Vetoed", ""
    if re.search(r"(?i)delivered to governor|passed legislature|speaker signed|president signed|governor signed", blob):
        return "Passed", ""
    if resolution and any(re.match(r"(?i)^(adopted|resolution adopted|passed legislature)", x) for x in hist_lines):
        return "Passed", ""
    return "Died", ""


def fetch_member_list():
    legs, roster = {}, {}
    for fn in ("GetSponsors", "GetHouseSponsors", "GetSenateSponsors"):
        root = xml(f"{BASE}/SponsorService.asmx/{fn}?biennium={BIENNIUM}")
        if root is None:
            continue
        for m in root.findall("Member"):
            mid = t(m, "Id")
            if not mid or f"WA:{mid}" in legs:
                continue
            agency = t(m, "Agency")
            last, first = t(m, "LastName"), t(m, "FirstName")
            lid = f"WA:{mid}"
            legs[lid] = {"id": lid, "name": f"{last}, {first}".strip(", "), "first": first, "last": last,
                         "party": PARTY.get(t(m, "Party"), t(m, "Party").upper()), "house": agency,
                         "district": t(m, "District"), "active": True,
                         "url": f"https://app.leg.wa.gov/district/default.aspx?Chamber={agency}&District={t(m, 'District')}"}
    return legs


def process(num, types_wanted):
    """Fetch everything for one bill number; returns list of (key, bill, history, votes)."""
    quoted = urllib.parse.quote
    out = []
    root = xml(f"{BASE}/LegislationService.asmx/GetLegislation?biennium={BIENNIUM}&billNumber={num}")
    if root is None:
        stats["no_legislation"] += 1
        return out
    groups = defaultdict(list)
    for lg in root.findall("Legislation"):
        b = base_of(t(lg, "BillId"))
        if b and b[0]:
            groups[b].append(lg)
    if not groups:
        return out
    hroot = xml(f"{BASE}/LegislationService.asmx/GetLegislativeStatusChangesByBillNumber?biennium={BIENNIUM}&billNumber={num}&beginDate=2024-01-01&endDate=2026-12-31")
    hist_by = defaultdict(list)
    if hroot is not None:
        for i, ls in enumerate(hroot.findall("LegislativeStatus")):
            b = base_of(t(ls, "BillId"))
            if b:
                hist_by[b].append((t(ls, "ActionDate")[:10], i, t(ls, "HistoryLine")))
    rroot = xml(f"{BASE}/LegislationService.asmx/GetRollCalls?biennium={BIENNIUM}&billNumber={num}")
    votes_by = defaultdict(list)
    if rroot is not None:
        for rc in rroot.findall("RollCall"):
            b = base_of(t(rc, "BillId"))
            if not b:
                continue
            members, ay, no, ab = {}, 0, 0, 0
            for v in rc.findall("Votes/Vote"):
                name = t(v, "Name")
                val = next((c.text or "" for c in v if c.tag.lower() == "vote"), "").strip().lower()
                vv = "AYE" if val.startswith("yea") else "NOE" if val.startswith("nay") else "ABSTAIN"
                mid = t(v, "MemberId")
                if name in members:
                    name = f"{name} ({mid})"
                members[name] = {"legislator": f"WA:{mid}" if mid else None, "vote": vv}
            if members:
                ay = sum(1 for m in members.values() if m["vote"] == "AYE")
                no = sum(1 for m in members.values() if m["vote"] == "NOE")
                ab = len(members) - ay - no
            else:
                ay, no = int(t(rc.find("YeaVotes"), "Count", "0") or 0), int(t(rc.find("NayVotes"), "Count", "0") or 0)
                ab = int(t(rc.find("AbsentVotes"), "Count", "0") or 0) + int(t(rc.find("ExcusedVotes"), "Count", "0") or 0)
            motion = t(rc, "Motion")
            floor = bool(re.search(r"(?i)passage|concur|adopt|reading|\bpass", motion)) and not re.match(r"(?i)^(floor |committee |striking )?amendment|^motion|^reconsider", motion)
            votes_by[b].append({"date": t(rc, "VoteDate")[:10], "chamber": t(rc, "Agency"), "floor": floor, "motion": motion,
                                "ayes": ay, "noes": no, "abstain": ab, "result": "Passed" if ay > no else "Failed",
                                "members": members, "_seq": int(t(rc, "SequenceNumber", "0") or 0)})
    droot = xml(f"{BASE}/LegislativeDocumentService.asmx/GetDocuments?biennium={BIENNIUM}&namedLike={num}")
    docs_by = defaultdict(list)
    if droot is not None:
        for d in droot.findall("LegislativeDocument"):
            if t(d, "Class") == "Bill Reports":
                b = base_of(t(d, "BillId"))
                if b:
                    docs_by[b].append((t(d, "HtmCreateDate"), t(d, "ShortFriendlyName"), t(d, "HtmUrl")))
    for b, versions in groups.items():
        ty, n = b
        key = f"{ty} {n}"
        latest = next((v for v in versions if t(v, "Active") == "true"), None) or max(
            versions, key=lambda v: (t(v.find("CurrentStatus"), "ActionDate"), int(t(v, "EngrossedVersion", "0") or 0), int(t(v, "SubstituteVersion", "0") or 0)))
        lid = t(latest, "BillId")
        cs = latest.find("CurrentStatus")
        hist = sorted(hist_by.get(b, []))
        hist_lines = [h[2] for h in hist]
        resolution = ty not in ("HB", "SB")
        status, chapter = normalize(t(cs, "Status"), t(cs, "HistoryLine"), t(cs, "Veto") == "true", t(cs, "PartialVeto") == "true", hist_lines, resolution)
        partial = t(cs, "PartialVeto") == "true"
        if partial and status == "Chaptered":
            chapter += " (partial veto)"
        first_intro = min((t(v, "IntroducedDate")[:10] for v in versions if t(v, "IntroducedDate")), default="")
        year = first_intro[:4] if first_intro[:4] in ("2025", "2026") else "2025"
        short = t(latest, "ShortDescription") or t(latest, "LongDescription")
        long_desc = t(latest, "LongDescription")
        # authors
        authors, committee_sp = [], []
        sp = xml(f"{BASE}/LegislationService.asmx/GetSponsors?biennium={BIENNIUM}&billId={quoted(lid)}")
        if sp is not None:
            for s in sp.findall("Sponsor"):
                sid = t(s, "Id")
                if not re.match(r"(?i)^(representative|senator|rep\.|sen\.)", t(s, "LongName")):
                    committee_sp.append(t(s, "Name") or t(s, "LongName"))  # committee listed as sponsor
                    continue
                nm = t(s, "LastName") or t(s, "Name")
                authors.append({"legislator": f"WA:{sid}" if sid else None, "name": nm,
                                "role": "LEAD_AUTHOR" if t(s, "Type") == "Primary" else "COAUTHOR", "house": t(s, "Agency"),
                                "_first": t(s, "FirstName")})
        sponsor_txt = t(latest, "Sponsor")
        committee = ""
        m = re.match(r"^([A-Za-z &/,.-]+?)\s*\(", sponsor_txt)
        if m and m.group(1).strip():
            committee = m.group(1).strip()
        elif sponsor_txt and not sponsor_txt.startswith("("):
            committee = sponsor_txt if "(" not in sponsor_txt else ""
        if committee_sp and not committee:
            committee = ", ".join(dict.fromkeys(committee_sp))
        # digest
        digest, src = "", ""
        for _date, fname, url in sorted(docs_by.get(b, []), reverse=True):
            if "analysis" in fname.lower() and any("report" in x[1].lower() for x in docs_by[b]):
                continue
            txt = http(url.replace("http://", "https://").replace(" ", "%20"), timeout=60, tries=3)
            if not txt:
                continue
            s = report_summary(txt)
            if DEBUG and len(s) <= 40:
                i = txt.lower().find("summary")
                print(f"DEBUG nosummary {key} {fname} {url} len={len(txt)} :: {clean_text(txt[max(0, i - 100):i + 400]) if i >= 0 else clean_text(txt[:300])}", flush=True)
            if len(s) > 40 and not s[0].islower():
                digest, src = s, f"WA {fname} (Summary of Bill)"
                break
        if docs_by.get(b) and not digest:
            stats["has_report_no_summary"] += 1
        if not digest:
            digest = clean_text(long_desc)[:3500]
            src = "WA long description (no bill report summary)"
        stats["digest_long" if src.startswith("WA long") else "digest_report"] += 1
        last_date = hist[-1][0] if hist else t(cs, "ActionDate")[:10]
        last_action = hist[-1][2] if hist else t(cs, "HistoryLine")
        bill = {"id": lid, "type": ty, "number": n, "session": BIENNIUM, "title": short, "digest": digest, "digest_source": src,
                "status": status, "status_raw": t(cs, "Status"), "last_action": last_action, "last_action_date": last_date or (t(cs, "ActionDate")[:10]),
                "house": t(latest, "OriginalAgency"), "location_name": t(cs, "Status"), "chapter": chapter, "chaptered": status == "Chaptered",
                "url": f"https://app.leg.wa.gov/billsummary?BillNumber={n}&Year={year}&Initiative=false",
                "authors": authors, "action_count": len(hist), "introduced": first_intro, "legal_title": t(latest, "LegalTitle"),
                "latest_version": lid, "veto": t(cs, "Veto") == "true", "partial_veto": partial}
        if committee:
            bill["sponsor_committee"] = committee
        history = [[h[0], i + 1, h[2]] for i, h in enumerate(hist)]
        vs = sorted(votes_by.get(b, []), key=lambda v: (v["date"], v["_seq"]))
        for v in vs:
            v.pop("_seq", None)
        out.append((key, bill, history, vs))
    return out


def write_all(bills, legs, votes, hist, final=False):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "bills.json").write_text(json.dumps(bills, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "legislators.json").write_text(json.dumps(legs, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    for name, data in (("votes", votes), ("history", hist)):
        with gzip.open(OUT / f"{name}.json.gz", "wt", encoding="utf-8") as fh:
            json.dump(data, fh, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--numbers", default="", help="comma list of bill numbers (debug)")
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--workers", type=int, default=5)
    args = ap.parse_args()
    global DEBUG, OUT
    DEBUG = args.debug
    if args.numbers:
        OUT = Path("/tmp/wa-debug")  # debug runs never touch the committed outputs

    legs = fetch_member_list()
    print(f"members: {len(legs)}", flush=True)
    numbers = set()
    for year in (2025, 2026):
        root = xml(f"{BASE}/LegislationService.asmx/GetLegislationByYear?year={year}")
        if root is None:
            print(f"year {year} list failed", file=sys.stderr)
            continue
        for li in root.findall("LegislationInfo"):
            b = base_of(t(li, "BillId"))
            if b and b[0]:
                numbers.add(b[1])
    numbers = sorted(numbers)
    if args.numbers:
        numbers = [int(x) for x in args.numbers.split(",")]
    elif args.limit:
        step = max(1, len(numbers) // args.limit)
        numbers = numbers[::step][:args.limit]
    print(f"bill numbers: {len(numbers)}", flush=True)

    bills, votes, hist = {}, {}, {}
    CH = 250
    for i in range(0, len(numbers), CH):
        chunk = numbers[i:i + CH]
        with ThreadPoolExecutor(args.workers) as ex:
            for res in ex.map(lambda n: process(n, None), chunk):
                for key, bill, h, vs in res:
                    bills[key] = bill
                    hist[key] = h
                    if vs:
                        votes[key] = vs
        # legislators seen in sponsors/votes but missing from the roster
        for key, b in bills.items():
            for a in b["authors"]:
                lid = a["legislator"]
                if lid and lid not in legs:
                    legs[lid] = {"id": lid, "name": f"{a['name']}, {a.get('_first', '')}".strip(", "), "first": a.get("_first", ""),
                                 "last": a["name"], "party": "", "house": a["house"], "district": "", "active": False}
        for key, vs in votes.items():
            for v in vs:
                for nm, m in v["members"].items():
                    lid = m["legislator"]
                    if lid and lid not in legs:
                        last = re.sub(r"\s*\(\d+\)$", "", nm)
                        legs[lid] = {"id": lid, "name": last, "first": "", "last": last, "party": "", "house": v["chamber"], "district": "", "active": False}
        for b in bills.values():
            for a in b["authors"]:
                a.pop("_first", None)
        write_all(bills, legs, votes, hist)
        print(f"progress {min(i + CH, len(numbers))}/{len(numbers)}: {len(bills)} bills", flush=True)

    report(bills, legs, votes, hist)
    print(f"WA: {len(bills)} bills, {len(legs)} legislators, votes for {len(votes)} bills; stats {dict(stats)}")
    return 0


def report(bills, legs, votes, hist):
    n = len(bills)
    by_status = Counter(b["status"] for b in bills.values())
    by_raw = Counter(re.sub(r"\d+", "#", b["status_raw"]) for b in bills.values())
    by_type = Counter(b["type"] for b in bills.values())
    nd = sum(1 for b in bills.values() if b["digest"] and not b["digest_source"].startswith("WA long"))
    na = sum(1 for b in bills.values() if b["authors"])
    nvotes = sum(len(v) for v in votes.values())
    nfloor = sum(1 for v in votes.values() for x in v if x["floor"])
    unmatched = sum(1 for b in bills.values() for a in b["authors"] if not a["legislator"])
    stubs = sum(1 for l in legs.values() if not l["active"])
    lines = [f"# Washington extract report (biennium {BIENNIUM})", "",
             f"- Bills and resolutions: {n} (one record per type and number; version records collapsed)",
             f"- By type: {dict(by_type)}",
             f"- By status: {dict(by_status)}",
             f"- Digest from bill report 'Summary of Bill': {nd}/{n}; remainder use the WA long description (digest_source says which)",
             f"- Bills with authors: {na}/{n} ({unmatched} author rows without a legislator id); committee-sponsored bills keep sponsor_committee",
             f"- Bills with roll calls: {len(votes)}; vote records: {nvotes} ({nfloor} flagged floor)",
             f"- History: {len(hist)} bills, {sum(len(h) for h in hist.values())} actions",
             f"- Legislators: {len(legs)} ({stubs} added from sponsor/vote records, not in the member roster: active=false, no party/district)",
             "", "## Sources",
             "- LegislationService.asmx: GetLegislationByYear (2025, 2026), GetLegislation, GetLegislativeStatusChangesByBillNumber, GetRollCalls, GetSponsors",
             "- SponsorService.asmx: GetSponsors / GetHouseSponsors / GetSenateSponsors (party, district)",
             "- LegislativeDocumentService.asmx GetDocuments, then House/Senate Bill Report HTML on lawfilesext.leg.wa.gov (Summary of Bill)",
             "", "## Notes and known gaps",
             "- Status: Chaptered = 'C n L yy' current status (partial vetoes stay Chaptered and the chapter text says so); whole veto = Vetoed; delivered to governor / passed legislature = Passed; everything else is Died because the 2025 and 2026 sessions are over.",
             "- Roll calls: only floor roll calls published by the web service; committee votes are not included. Member names are last names as printed by WA; legislator ids come from the service MemberId.",
             "- Gubernatorial appointments (GA) and initiatives are excluded.",
             "", "## Raw current-status values (counts)"]
    lines += [f"- {k or '(blank)'}: {v}" for k, v in by_raw.most_common(60)]
    (OUT / "extract_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
