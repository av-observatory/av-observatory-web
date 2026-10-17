#!/usr/bin/env python3
"""Turn California's bulk file (pubinfo zip) into clean data files for the legislator/bill site.

Writes data-state/states/CA/:
  bills.json         status, authors (matched to legislators), latest action, digest
  legislators.json   district, house, party, name
  votes.json.gz      per bill: each recorded vote with tallies and how each member voted
  history.json.gz    per bill: every action
Source: https://downloads.leginfo.legislature.ca.gov/pubinfo_<year>.zip (read over HTTP ranges, or --zip a local copy).
Authors and votes carry last names only, so they are matched to legislators by house and last name;
ambiguous matches keep every candidate id instead of guessing.
"""
import argparse, gzip, json, re, sys, zipfile
from collections import defaultdict
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
OUT = ROOT / "data-state/states/CA"
HOUSE = {"A": "Assembly", "S": "Senate"}


def rows(z, members, table):
    name = members.get(table.upper() + ".DAT")
    if not name:
        raise RuntimeError(f"{table}.dat not in the zip")
    with z.open(name) as fh:
        for raw in fh:
            cells = raw.decode("utf-8", "replace").rstrip("\r\n").split("\t")
            yield [("" if c == "NULL" else c.strip("`")) for c in cells]


def digest_of(xml: str) -> str:
    m = re.search(r"<(?:\w+:)?DigestText[^>]*>(.*?)</(?:\w+:)?DigestText>", xml, re.S | re.I)
    text = m.group(1) if m else ""
    if not text:
        m = re.search(r"LEGISLATIVE COUNSEL'S DIGEST(.*?)(?:THE PEOPLE OF THE STATE OF CALIFORNIA|<(?:\w+:)?Bill>)", xml, re.S | re.I)
        text = m.group(1) if m else ""
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", text)).split())[:3500]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", default="2025")
    ap.add_argument("--zip", help="local copy of the pubinfo zip (much faster than HTTP ranges for the digests)")
    ap.add_argument("--no-digest", action="store_true")
    args = ap.parse_args()
    if args.zip:
        z = zipfile.ZipFile(args.zip)
    else:
        from bill_enumerators import RangeFile
        z = zipfile.ZipFile(RangeFile(f"https://downloads.leginfo.legislature.ca.gov/pubinfo_{args.year}.zip"))
    members = {n.rsplit("/", 1)[-1].upper(): n for n in z.namelist()}

    # legislators: (house letter, author_name) -> [ids]
    legislators, by_name = {}, defaultdict(list)
    for r in rows(z, members, "LEGISLATOR_TBL"):
        if len(r) < 13 or not r[2]:
            continue
        district, session, full, house, author, first, last = r[0], r[1], r[2], r[3], r[4], r[5], r[6]
        party, active = r[11], r[12]
        lid = f"{district}:{session}"
        legislators[lid] = {"id": lid, "name": full, "first": first, "last": last or author, "house": HOUSE.get(house, house),
                            "district": district, "party": party, "active": active == "Y"}
        by_name[(house, (author or last).lower())].append(lid)

    def resolve(house_letter, name):
        ids = by_name.get((house_letter, name.lower()), [])
        return ids[0] if len(ids) == 1 else ids  # a list means ambiguous

    # bills
    bills, by_id = {}, {}
    for r in rows(z, members, "BILL_TBL"):
        if len(r) < 18 or not r[3] or not r[4].isdigit():
            continue
        key = f"{r[3]} {int(r[4])}"
        rec = {"id": r[0], "type": r[3], "number": int(r[4]), "session": r[1], "measure_state": r[5],
               "chaptered": bool(r[7]), "chapter": f"{r[6]} ch. {r[9]}" if r[9] else "",
               "latest_version": r[10], "location": r[14], "location_name": r[15], "house": r[16], "status": r[17]}
        bills[key] = rec
        by_id[r[0]] = key
    latest = {rec["latest_version"]: key for key, rec in bills.items()}

    # version rows: subject (title) and the lob file with the full text
    lobs = {}
    for r in rows(z, members, "BILL_VERSION_TBL"):
        if len(r) > 15 and r[0] in latest:
            key = latest[r[0]]
            bills[key]["title"] = r[6] or r[5]
            bills[key]["version_date"] = r[3][:10]
            bills[key]["version_form"] = r[4]
            lobs[key] = r[14]

    # authors of the latest version
    for key in bills:
        bills[key]["authors"] = []
    for r in rows(z, members, "BILL_VERSION_AUTHORS_TBL"):
        if len(r) > 4 and r[0] in latest and r[1] == "Legislator":
            bills[latest[r[0]]]["authors"].append({"name": r[3], "house": r[2].title(), "role": r[4], "legislator": resolve(r[2][:1].upper(), r[3])})

    # history
    history = defaultdict(list)
    for r in rows(z, members, "BILL_HISTORY_TBL"):
        if len(r) > 6 and r[0] in by_id:
            history[by_id[r[0]]].append((r[2][:10], int(r[6] or 0), r[3]))
    for key, items in history.items():
        items.sort()
        bills[key]["last_action_date"], bills[key]["last_action"] = items[-1][0], items[-1][2]
        bills[key]["action_count"] = len(items)

    # votes: summaries, then member votes
    motions = {r[0]: r[1] for r in rows(z, members, "BILL_MOTION_TBL") if len(r) > 1}
    votes, index = defaultdict(list), {}
    for r in rows(z, members, "BILL_SUMMARY_VOTE_TBL"):
        if len(r) > 8 and r[0] in by_id:
            v = {"loc": r[1], "date": r[2][:10], "seq": r[3], "motion": motions.get(r[4], r[4]),
                 "ayes": int(r[5] or 0), "noes": int(r[6] or 0), "abstain": int(r[7] or 0), "result": r[8].strip("()"), "members": {}}
            index[(r[0], r[1], r[2], r[3])] = v
            index[(r[0], r[1], r[2][:10], r[3])] = v  # the detail table does not always repeat the time of day
            votes[by_id[r[0]]].append(v)
    for r in rows(z, members, "BILL_DETAIL_VOTE_TBL"):
        if len(r) > 5:
            v = index.get((r[0], r[1], r[3], r[4])) or index.get((r[0], r[1], r[3][:10], r[4]))
            if v is not None:
                letter = r[1][0].upper() if r[1][:1] in "AS" and "FLOOR" in r[1].upper() else ""
                v["members"][r[2]] = {"vote": r[5], "legislator": resolve(letter, r[2]) if letter else None}

    # digests from the version files
    if not args.no_digest:
        names = set(z.namelist())
        done = 0
        for key, lob in lobs.items():
            member = next((n for n in (lob, f"{lob}") if n in names), None) or members.get(lob.upper())
            if member:
                with z.open(member) as fh:
                    bills[key]["digest"] = digest_of(fh.read(400000).decode("utf-8", "replace"))
                done += bool(bills[key]["digest"])
        print(f"digests found for {done} of {len(lobs)} bills")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "bills.json").write_text(json.dumps(bills, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n")
    (OUT / "legislators.json").write_text(json.dumps(legislators, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n")
    for name, data in (("votes", votes), ("history", history)):
        with gzip.open(OUT / f"{name}.json.gz", "wt", encoding="utf-8") as fh:
            json.dump(data, fh, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    ambiguous = sum(isinstance(a["legislator"], list) for b in bills.values() for a in b["authors"])
    print(f"CA: {len(bills)} bills, {len(legislators)} legislators, {sum(len(v) for v in votes.values())} votes, "
          f"{sum(len(b['authors']) for b in bills.values())} author rows ({ambiguous} ambiguous or unmatched)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
