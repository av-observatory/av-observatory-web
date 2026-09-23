#!/usr/bin/env python3
"""Join NHTSA's public ADS report fields to the latest-version site snapshot.

Run with --current and --archive for offline, reproducible refreshes, or omit
them to retrieve the latest official NHTSA CSVs. Never mix report submission
month with the incident month used for the CPUC mileage comparison.
"""
import argparse
import csv
from datetime import datetime
import io
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public/data"
NHTSA = "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/"
SOURCES = {
    "archive": NHTSA + "Archive-2021-2025/SGO-2021-01_Incident_Reports_ADS.csv",
    "current": NHTSA + "SGO-2021-01_Incident_Reports_ADS.csv",
}
WAYMO_TCP = "PSG0038152"
DETAIL_FIELDS = ["report_id", "report_version", "same_incident_id", "incident_date", "air_bag_deployment",
    "subject_air_bag", "crash_partner_air_bag", "source_url", "narrative_available"]
SERIOUS_FIELDS = ["incident_key", "incident_date", "city", "state", "reporting_entities", "report_ids",
    "severity", "make", "model", "crash_with", "roadway_type", "engagement_status",
    "air_bag_deployment", "source_url"]


def read_source(location):
    if str(location).startswith("https://"):
        with urlopen(location, timeout=90) as response:
            content = response.read().decode("utf-8-sig")
    else:
        content = Path(location).read_text(encoding="utf-8-sig")
    return list(csv.DictReader(io.StringIO(content)))


def air_bags(raw):
    if "Any Air Bags Deployed?" in raw:
        value = raw["Any Air Bags Deployed?"].lower()
        if "yes" in value:
            return "Deployed"
        if value == "no subject vehicle, no crash partner":
            return "No Deployment Reported"
        return "Unknown"
    subject, partner = raw.get("SV Any Air Bags Deployed?", ""), raw.get("CP Any Air Bags Deployed?", "")
    if "Yes" in (subject, partner):
        return "Deployed"
    if subject == "No" and partner in ("No", "Not Applicable"):
        return "No Deployment Reported"
    return "Unknown"


def incident_month(value):
    try:
        return datetime.strptime(value.strip().upper(), "%b-%Y").strftime("%Y-%m")
    except ValueError:
        return None


def severity_rank(value):
    value = value.lower()
    return 2 if value.startswith("fatal") else 1 if value.startswith("serious") else 0


def write_csv(name, fields, rows):
    with (DATA / name).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", default=SOURCES["archive"])
    parser.add_argument("--current", default=SOURCES["current"])
    args = parser.parse_args()
    raw_by_id = {}
    for source, location in (("archive", args.archive), ("current", args.current)):
        for row in read_source(location):
            report_id = row["Report ID"].strip()
            version = int(row["Report Version"] or 0)
            if report_id not in raw_by_id or version >= int(raw_by_id[report_id]["Report Version"] or 0):
                raw_by_id[report_id] = {**row, "_source": SOURCES[source]}
    reports = list(csv.DictReader((DATA / "sgo_incidents.csv").open(newline="", encoding="utf-8")))
    ids = {r["report_id"] for r in reports}
    if ids != raw_by_id.keys():
        raise ValueError(f"NHTSA source IDs do not match site snapshot: {len(ids - raw_by_id.keys())} missing, {len(raw_by_id.keys() - ids)} new. Refresh the SGO snapshot first.")
    details = []
    for report in reports:
        raw = raw_by_id[report["report_id"]]
        if int(raw["Report Version"] or 0) != int(report["report_version"] or 0):
            raise ValueError(f"Report version mismatch: {report['report_id']}")
        details.append({"report_id": report["report_id"], "report_version": report["report_version"],
            "same_incident_id": raw.get("Same Incident ID", "").strip(), "incident_date": raw.get("Incident Date", ""),
            "air_bag_deployment": air_bags(raw), "subject_air_bag": raw.get("SV Any Air Bags Deployed?", ""),
            "crash_partner_air_bag": raw.get("CP Any Air Bags Deployed?", ""), "source_url": raw["_source"],
            "narrative_available": "Yes" if raw.get("Narrative", "").strip() else "No"})
    details_by_id = {row["report_id"]: row for row in details}
    write_csv("sgo_crash_details.csv", DETAIL_FIELDS, details)

    serious = {}
    for report in reports:
        if not severity_rank(report["highest_injury_severity"]):
            continue
        detail = details_by_id[report["report_id"]]
        key = detail["same_incident_id"] or report["report_id"]
        serious.setdefault(key, []).append((report, detail))
    serious_rows = []
    for key, members in serious.items():
        members.sort(key=lambda pair: (severity_rank(pair[0]["highest_injury_severity"]),
            pair[0]["reporting_entity"] == pair[0]["operating_entity"]), reverse=True)
        report, detail = members[0]
        serious_rows.append({"incident_key": key, "incident_date": detail["incident_date"],
            "city": report["city"], "state": report["state"],
            "reporting_entities": "; ".join(sorted({p["reporting_entity"] for p, _ in members})),
            "report_ids": "; ".join(sorted(p["report_id"] for p, _ in members)),
            "severity": report["highest_injury_severity"], "make": report["make"], "model": report["model"],
            "crash_with": report["crash_with"], "roadway_type": report["roadway_type"],
            "engagement_status": report["automation_system_engaged"],
            "air_bag_deployment": detail["air_bag_deployment"], "source_url": detail["source_url"]})
    serious_rows.sort(key=lambda r: (incident_month(r["incident_date"]) or "", r["incident_key"]), reverse=True)
    write_csv("sgo_serious_fatal_crashes.csv", SERIOUS_FIELDS, serious_rows)

    cpuc = json.loads((DATA / "cpuc_activity_monthly.json").read_text(encoding="utf-8"))["data"]
    mileage = {}
    for row in cpuc:
        if row["operator_tcpid"] != WAYMO_TCP or row["program"] != "driverless":
            continue
        segments = [row.get(f"total_vmt_period{i}") for i in (1, 2, 3)]
        if any(value is None for value in segments):
            continue
        month = f"{row['calendar_year']}-{row['calendar_month']:02d}"
        mileage[month] = mileage.get(month, 0) + sum(segments)
    crashes = {month: {} for month in mileage}
    for report in reports:
        if report["state"].strip().upper() != "CA" or report["reporting_entity"] != "Waymo LLC":
            continue
        if report["automation_system_engaged"].strip().upper() != "ADS":
            continue
        detail = details_by_id[report["report_id"]]
        month = incident_month(detail["incident_date"])
        if month not in crashes:
            continue
        key = detail["same_incident_id"] or report["report_id"]
        existing = crashes[month].get(key)
        if existing is None or severity_rank(report["highest_injury_severity"]) > severity_rank(existing["highest_injury_severity"]):
            crashes[month][key] = report
    monthly = []
    for month, miles in sorted(mileage.items()):
        count = len(crashes[month])
        severe = sum(severity_rank(row["highest_injury_severity"]) > 0 for row in crashes[month].values())
        monthly.append({"month": month, "cpuc_driverless_vmt": round(miles, 2), "sgo_ads_crashes": count,
            "sgo_serious_or_fatal_crashes": severe,
            "crashes_per_million_miles": round(count / miles * 1_000_000, 3),
            "serious_or_fatal_crashes_per_million_miles": round(severe / miles * 1_000_000, 3)})
    result = {"dataset": "California Waymo reported crash-rate proxy", "operator": "Waymo",
        "scope": "CA Waymo LLC ADS-engaged SGO incidents divided by Waymo CPUC driverless passenger-service P1+P2+P3 VMT in the same incident month.",
        "numerator_source": "https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting",
        "denominator_source": "https://www.cpuc.ca.gov/regulatory-services/licensing/transportation-licensing-and-analysis-branch/autonomous-vehicle-programs",
        "limitations": "SGO records do not identify the CPUC passenger-service program. The numerator can include Waymo testing or other operations that the denominator excludes. Reporting lags, alleged severity, and changes to SGO rules affect counts; these are descriptive proxies, not a comparable fleet safety rate. Serious/fatal is the highest alleged severity per crash, not the number of injured people.",
        "monthly": monthly}
    (DATA / "ca_waymo_sgo_rates.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"Enriched {len(details)} latest-version reports; {len(serious_rows)} distinct serious/fatal incidents; {len(monthly)} CPUC-matched months")


if __name__ == "__main__":
    main()
