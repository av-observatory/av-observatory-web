#!/usr/bin/env python3
"""Refresh AV-identifiable 311 complaints from reviewed municipal open data."""
import argparse
from collections import Counter
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DATA = Path(__file__).resolve().parent.parent / "public/data"
SOURCE = "https://data.sf.gov/resource/vw6y-z8j6.json"
CATEGORY = "Autonomous Vehicle Complaints"
LIMIT = 50000


def build(rows):
    records = {}
    for raw in rows:
        if raw.get("service_name") != CATEGORY:
            raise ValueError("311 source response contains non-AV records")
        ident = raw.get("service_request_id")
        date = raw.get("requested_datetime", "")[:10]
        if not ident or len(date) != 10:
            raise ValueError("311 record missing ID or date")
        records[ident] = {"id": "SF-" + ident, "source_id": ident, "state": "CA", "market": "San Francisco",
            "requested_date": date, "month": date[:7], "type": raw.get("service_subtype") or "Unspecified",
            "status": raw.get("status_description") or "Unknown", "agency": raw.get("agency_responsible") or "",
            "source_url": SOURCE + "?" + urlencode({"service_request_id": ident})}
    records = sorted(records.values(), key=lambda row: (row["requested_date"], row["source_id"]))
    monthly = [{"month": month, "market": "San Francisco", "state": "CA", "complaints": count}
        for month, count in sorted(Counter(row["month"] for row in records).items())]
    return {"schema_version": "1.0.0", "dataset": "AV-identifiable municipal 311 service requests",
        "source_url": "https://data.sf.gov/d/vw6y-z8j6", "source_api": SOURCE,
        "selection": "Exact service_name match: Autonomous Vehicle Complaints. Other city request types and any unclassified AV mentions are excluded.",
        "limitations": "311 entries are public requests, not verified AV incidents. They can include feedback or duplicates and do not identify an operator. The SF AV category begins in April 2025. Other deployment markets are not included until a public 311 source with identifiable AV fields is validated; their absence does not mean zero complaints.",
        "source_data_as_of": max((raw.get("data_as_of", "") for raw in rows), default=""),
        "total_records": len(records), "markets": [{"market": "San Francisco", "state": "CA", "complaints": len(records)}],
        "monthly": monthly, "records": records}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, help="Read an archived municipal API response")
    parser.add_argument("--check", action="store_true", help="Check the stored JSON without network access")
    args = parser.parse_args()
    if args.check:
        data = json.loads((DATA / "av_311_complaints.json").read_text(encoding="utf-8"))
        if len(data["records"]) != data["total_records"] or len({r["source_id"] for r in data["records"]}) != data["total_records"]:
            raise ValueError("311 records missing or duplicated")
        registry = json.loads((DATA / "av_311_source_registry.json").read_text(encoding="utf-8"))
        operations = json.loads((DATA / "operational_domains.json").read_text(encoding="utf-8"))
        deployed = {r["state"] for r in operations["locations"] if r["phase"] == "deployment"}
        tracked = {s["state"] for s in registry["states"]}
        if deployed - tracked:
            raise ValueError("Missing 311 deployment state review: " + ", ".join(sorted(deployed - tracked)))
        print(f"Validated {data['total_records']} 311 requests and {len(tracked)} deployment state reviews")
        return
    if args.fixture:
        rows = json.loads(args.fixture.read_text(encoding="utf-8"))
    else:
        url = SOURCE + "?" + urlencode({"service_name": CATEGORY, "$limit": LIMIT})
        request = Request(url, headers={"User-Agent": "AV-Observatory/1.0 (public research)"})
        with urlopen(request, timeout=90) as response:
            rows = json.load(response)
    if len(rows) >= LIMIT:
        raise ValueError("311 request reached the page limit; paginate before publishing")
    data = build(rows)
    (DATA / "av_311_complaints.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Indexed {data['total_records']} SF 311 AV-category requests; source as of {data['source_data_as_of']}")


if __name__ == "__main__":
    main()
