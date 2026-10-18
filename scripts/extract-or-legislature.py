#!/usr/bin/env python3
"""Oregon (2025 regular, 2025 1st special, 2026 regular) bills/legislators/votes/history from the OLIS OData API.

Writes data-state/states/OR/: bills.json, legislators.json, votes.json.gz, history.json.gz, extract_report.md
Source: https://api.oregonlegislature.gov/odata/odataservice.svc/ (Measures, MeasureSponsors, MeasureHistoryActions,
MeasureVotes, Legislators, Committees). Schema contract: docs/multi-state-spec.md.
"""
import argparse, gzip, json, re, sys, time, urllib.error, urllib.parse, urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data-state/states/OR"
BASE = "https://api.oregonlegislature.gov/odata/odataservice.svc/"
SESSIONS = ["2025R1", "2025S1", "2026R1"]
UA = "av-observatory-research/1.0 (+https://github.com/av-observatory/av-observatory-web)"
CHAMBER = {"H": "House", "S": "Senate", "J": "Joint"}
PARTY = {"democrat": "DEM", "republican": "REP", "independent": "IND", "nonaffiliated": "IND"}


def log(msg):
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    with open(OUT / "progress.log", "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def get(entity, params, tries=6):
    url = BASE + entity + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            wait = int(e.headers.get("Retry-After", 0) or 0) if e.code in (429, 503) else 0
            if e.code in (400, 404):
                raise
            time.sleep(max(wait, 2 ** i))
        except Exception as e:  # network / timeout / json
            log(f"  retry {i + 1} {entity}: {e!r}")
            time.sleep(2 ** i)
    raise RuntimeError(f"giving up on {url}")


def fetch_skip(entity, flt, order, page=1000, workers=4):
    first = get(entity, {"$format": "json", "$filter": flt, "$orderby": order, "$top": page, "$inlinecount": "allpages"})
    total = int(first.get("odata.count") or 0)
    rows = list(first["value"])
    step = len(rows)
    if step and total > step:
        offsets = list(range(step, total, step))
        def one(off):
            return get(entity, {"$format": "json", "$filter": flt, "$orderby": order, "$top": step, "$skip": off})["value"]
        with ThreadPoolExecutor(workers) as ex:
            for part in ex.map(one, offsets):
                rows.extend(part)
    log(f"  {entity} [{flt}]: {len(rows)} rows (server count {total})")
    return rows


def fetch_keyset_parallel(entity, flt, idf, prefixes, workers=4):
    def one(p):
        return fetch_keyset(entity, f"{flt} and MeasurePrefix eq '{p}'", idf)
    out = []
    with ThreadPoolExecutor(workers) as ex:
        for part in ex.map(one, prefixes):
            out.extend(part)
    return out


def fetch_keyset(entity, flt, idf, page=1000):
    rows, last = [], 0
    while True:
        d = get(entity, {"$format": "json", "$filter": f"{flt} and {idf} gt {last}", "$orderby": idf, "$top": page})["value"]
        if not d:
            break
        rows.extend(d)
        last = d[-1][idf]
        if len(rows) % 10000 < len(d):
            log(f"  {entity} [{flt}]: {len(rows)} rows so far")
    log(f"  {entity} [{flt}]: {len(rows)} rows")
    return rows


def clean(s):
    return " ".join((s or "").split())


def digest_of(m):
    s = clean(m.get("MeasureSummary"))
    if s:
        s = re.sub(r"^Digest:\s*", "", s)
        s = re.sub(r"\s*\(Flesch Readability Score:\s*[\d.]+\)\.?", ".", s)
        s = re.sub(r"\.\.", ".", s)
        return s[:3500], "OR measure summary (OLIS plain-language digest + catchline)"
    if clean(m.get("CatchLine")):
        return clean(m["CatchLine"])[:3500], "OR measure catchline (no summary)"
    if clean(m.get("RelatingTo")):
        return clean(m["RelatingTo"])[:3500], "OR 'Relating to' title (no summary)"
    return "", "none"


def status_of(m, last_action):
    loc = clean(m.get("CurrentLocation"))
    low = loc.lower()
    if m.get("Vetoed"):
        return "Vetoed"
    if m.get("ChapterNumber") or "chapter" in low or "signed" in low or "effective" in low:
        return "Chaptered"
    if "governor" in low or "secretary of state" in low:
        return "Passed"
    if re.search(r"vetoed", low):
        return "Vetoed"
    la = last_action.lower()
    if re.search(r"^(signed|chapter|effective)", la):
        return "Chaptered"
    # all sessions in scope are over: anything not enacted/adopted did not pass
    return "Died"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", default=",".join(SESSIONS))
    ap.add_argument("--no-votes", action="store_true")
    args = ap.parse_args()
    sessions = args.sessions.split(",")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "progress.log").write_text("")

    # legislators (later sessions override earlier ones)
    legs, code2id, seen_in = {}, {}, defaultdict(set)
    for s in sessions:
        for r in fetch_skip("Legislators", f"SessionKey eq '{s}'", "LegislatorCode", workers=1):
            code = r["LegislatorCode"]
            lid = "OR:" + code
            seen_in[lid].add(r["SessionKey"])
            party = (r.get("Party") or "").strip()
            legs[lid] = {"id": lid, "name": f"{r['LastName']}, {r['FirstName']}", "first": r["FirstName"], "last": r["LastName"],
                         "party": PARTY.get(party.lower(), party.upper()[:3] or "UNK"), "house": CHAMBER.get(r.get("Chamber"), r.get("Chamber") or ""),
                         "district": str(r.get("DistrictNumber") or ""), "active": False,
                         "url": r.get("WebSiteUrl") or ""}
            code2id[code] = lid
    latest = sessions[-1]
    for lid in legs:
        legs[lid]["active"] = latest in seen_in[lid]

    committees = {}
    for s in sessions:
        for r in fetch_skip("Committees", f"SessionKey eq '{s}'", "CommitteeCode", workers=1):
            committees[r["CommitteeCode"]] = r["CommitteeName"]

    bills, bykey = {}, {}
    locations = Counter()
    for s in sessions:
        rows = fetch_skip("Measures", f"SessionKey eq '{s}'", "MeasurePrefix,MeasureNumber", page=500)
        year = s[:4]
        for m in rows:
            pre, num = m["MeasurePrefix"], m["MeasureNumber"]
            key = f"{pre} {num} ({s})"
            dg, src = digest_of(m)
            ch = m.get("ChapterNumber")
            locations[clean(m.get("CurrentLocation"))] += 1
            bills[key] = {
                "id": f"{s}:{pre}{num}", "type": pre, "number": num, "session": s,
                "title": clean(m.get("RelatingTo")) or clean(m.get("CatchLine")), "digest": dg, "digest_source": src,
                "status": "", "status_raw": clean(m.get("CurrentLocation")), "last_action": "", "last_action_date": "",
                "house": "House" if pre.startswith("H") else "Senate" if pre.startswith("S") else "",
                "location_name": committees.get(m.get("CurrentCommitteeCode") or "", clean(m.get("CurrentLocation"))),
                "chapter": f"Chapter {ch}, Oregon Laws {year}" if ch else "", "chaptered": bool(ch),
                "url": f"https://olis.oregonlegislature.gov/liz/{s}/Measures/Overview/{pre}{num}",
                "authors": [], "action_count": 0, "prefix_meaning": m.get("PrefixMeaning") or "",
                "at_the_request_of": clean(m.get("AtTheRequestOf")), "emergency_clause": bool(m.get("EmergencyClause")),
                "_m": m,
            }
            bykey[(s, pre, num)] = key

    log(f"measures done: {len(bills)}")
    # sponsors
    for s in sessions:
        for r in fetch_skip("MeasureSponsors", f"SessionKey eq '{s}'", "MeasureSponsorId", workers=2):
            key = bykey.get((s, r["MeasurePrefix"], r["MeasureNumber"]))
            if not key:
                continue
            b = bills[key]
            if r.get("SponsorType") == "Committee" or (r.get("CommitteeCode") and not r.get("LegislatoreCode")):
                cc = r.get("CommitteeCode") or ""
                b["sponsor_committee"] = committees.get(cc, cc)
                continue
            code = r.get("LegislatoreCode")
            if not code:
                continue
            lid = code2id.get(code)
            b["authors"].append({"legislator": lid, "name": code.split(" ", 1)[-1], "role": "LEAD_AUTHOR" if r.get("SponsorLevel") == "Chief" else "COAUTHOR",
                                 "house": CHAMBER.get(code[:3] == "Rep" and "H" or "S", ""), "_order": int(r.get("PrintOrder") or 99)})
    for b in bills.values():
        b["authors"].sort(key=lambda a: (a["role"] != "LEAD_AUTHOR", a["_order"]))
        for a in b["authors"]:
            a.pop("_order")

    # history
    history = defaultdict(list)
    hist_by_id = {}
    for s in sessions:
        prefs = sorted({p for (ss, p, _) in bykey if ss == s})
        for r in fetch_keyset_parallel("MeasureHistoryActions", f"SessionKey eq '{s}'", "MeasureHistoryId", prefs):
            key = bykey.get((s, r["MeasurePrefix"], r["MeasureNumber"]))
            if not key:
                continue
            hist_by_id[r["MeasureHistoryId"]] = (key, r)
            text = clean(r.get("ActionText"))
            if r.get("VoteText"):
                text += " (" + clean(r["VoteText"]) + ")"
            history[key].append((r["ActionDate"], r["MeasureHistoryId"], text))
    hist_out = {}
    for key, items in history.items():
        items.sort()
        hist_out[key] = [[d[:10], i + 1, t] for i, (d, _, t) in enumerate(items)]
        b = bills[key]
        b["last_action_date"], b["last_action"] = items[-1][0][:10], items[-1][2]
        b["action_count"] = len(items)

    for key, b in bills.items():
        m = b.pop("_m")
        if not b["last_action_date"]:
            b["last_action_date"] = (m.get("ModifiedDate") or m.get("CreatedDate") or "")[:10]
        b["status"] = status_of(m, b["last_action"])
        if b["status"] == "Chaptered":
            b["chaptered"] = True

    log("history done")
    # votes (floor roll calls, one record per MeasureHistoryId)
    votes, vote_rows = {}, 0
    if not args.no_votes:
        for s in sessions:
            groups = defaultdict(list)
            prefs = sorted({p for (ss, p, _) in bykey if ss == s})
            for r in fetch_keyset_parallel("MeasureVotes", f"SessionKey eq '{s}'", "MeasureVoteId", prefs):
                groups[r["MeasureHistoryId"]].append(r)
                vote_rows += 1
            for hid, rs in groups.items():
                key = bykey.get((s, rs[0]["MeasurePrefix"], rs[0]["MeasureNumber"]))
                if not key:
                    continue
                members, ayes, noes, ab = {}, 0, 0, 0
                for r in rs:
                    v = (r.get("Vote") or "").lower()
                    name = r["VoteName"]
                    if v == "aye":
                        vv, ayes = "AYE", ayes + 1
                    elif v in ("nay", "no"):
                        vv, noes = "NOE", noes + 1
                    else:
                        vv, ab = "ABSTAIN", ab + 1
                    members[name] = {"legislator": code2id.get(name), "vote": vv}
                txt = clean(rs[0].get("ActionText"))
                res = "Passed" if re.search(r"passed|adopted|concur|approved", txt, re.I) and not re.search(r"fail|lost", txt, re.I) else \
                      "Failed" if re.search(r"fail|lost", txt, re.I) else ""
                votes.setdefault(key, []).append({"date": rs[0]["ActionDate"][:10], "chamber": CHAMBER.get(rs[0].get("Chamber"), rs[0].get("Chamber") or ""),
                                                  "floor": True, "motion": txt, "ayes": ayes, "noes": noes, "abstain": ab, "result": res, "members": members})
        for vs in votes.values():
            vs.sort(key=lambda v: v["date"])

    def dump(name, data):
        (OUT / name).write_text(json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    dump("bills.json", bills)
    dump("legislators.json", legs)
    for name, data in (("votes", votes), ("history", hist_out)):
        with gzip.open(OUT / f"{name}.json.gz", "wt", encoding="utf-8") as fh:
            json.dump(data, fh, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

    n = len(bills)
    by_status = Counter(b["status"] for b in bills.values())
    by_session = Counter(b["session"] for b in bills.values())
    matched = sum(1 for b in bills.values() for a in b["authors"] if a["legislator"])
    total_auth = sum(len(b["authors"]) for b in bills.values())
    rep = [f"# Oregon extract report", "",
           f"Sessions: {', '.join(sessions)}. Source: OLIS OData API ({BASE}).", "",
           f"- bills: {n} ({dict(by_session)})",
           f"- with digest: {sum(1 for b in bills.values() if b['digest'])} (MeasureSummary digest+catchline: {sum(1 for b in bills.values() if b['digest_source'].startswith('OR measure summary'))})",
           f"- with authors: {sum(1 for b in bills.values() if b['authors'])}; committee-sponsored (sponsor_committee): {sum(1 for b in bills.values() if b.get('sponsor_committee'))}",
           f"- author rows {total_auth}, matched to legislators {matched}",
           f"- legislators: {len(legs)}",
           f"- bills with floor roll calls: {len(votes)}; vote records {sum(len(v) for v in votes.values())}; member vote rows {vote_rows}",
           f"- bills with history: {len(hist_out)}; actions {sum(len(v) for v in hist_out.values())}",
           f"- status: {dict(by_status)}", "",
           "## Entities used", "Measures (RelatingTo, CatchLine, MeasureSummary, CurrentLocation, ChapterNumber, Vetoed), MeasureSponsors, MeasureHistoryActions, MeasureVotes, Legislators, Committees.", "",
           "## Notes and gaps",
           "- Status is derived: Vetoed flag -> Vetoed; ChapterNumber or enacted location -> Chaptered; location Governor/Secretary of State (adopted resolutions, passed bills) -> Passed; "
           "everything else is Died because all three sessions have ended. Oregon does not expose a separate 'failed in committee' flag, so Failed Passage in Committee is not used.",
           "- Votes: MeasureVotes are floor roll calls (all marked floor=true). Committee votes (CommitteeVotes entity) are not included. 'Excused' and any non Aye/Nay value count as abstain.",
           "- Vote result is inferred from the action text. Staff Measure Summary PDFs are not parsed; the digest is the OLIS MeasureSummary field.",
           "", "## CurrentLocation values", ""]
    rep += [f"- {c}: {k or '(blank)'}" for k, c in locations.most_common(40)]
    (OUT / "extract_report.md").write_text("\n".join(rep) + "\n", encoding="utf-8")
    print("\n".join(rep[:14]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
