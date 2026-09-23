#!/usr/bin/env python3
"""Keep the newest version of each NHTSA SGO report and rebuild chart totals.

Replace public/data/sgo_incidents_all_versions.csv with a newly reviewed source
export, then run this script. Raw versions remain available for audit.
"""
import csv
import json
from collections import Counter
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "public/data"
RAW = DATA / "sgo_incidents_all_versions.csv"
LATEST = DATA / "sgo_incidents.csv"
SUMMARY = DATA / "sgo_incidents_monthly.json"


def version(row):
    try:
        return int(row["report_version"])
    except (ValueError, KeyError):
        return -1


def main():
    with RAW.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        fields = reader.fieldnames
        rows = list(reader)
    if not fields or not {"report_id", "report_version", "reporting_entity"}.issubset(fields):
        raise ValueError("SGO source is missing report identity fields")
    if any(not row["report_id"].strip() for row in rows):
        raise ValueError("SGO source contains a report without an ID")
    latest = {}
    for row in rows:
        key = row["report_id"].strip()
        if key not in latest or version(row) > version(latest[key]):
            latest[key] = row
        elif version(row) == version(latest[key]) and row != latest[key]:
            raise ValueError(f"Conflicting records for report {key} version {version(row)}")
    selected = list(latest.values())
    with LATEST.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(selected)

    summary = json.loads(SUMMARY.read_text())
    summary["row_count"] = len(selected)
    summary["states_represented"] = sorted({row["state"].strip() or "Unknown" for row in selected})
    summary["entities_represented"] = sorted({row["reporting_entity"].strip() for row in selected if row["reporting_entity"].strip()})
    summary["notes"] = (
        "One latest version per NHTSA report ID; earlier versions remain in "
        "sgo_incidents_all_versions.csv. Counts are reports, not verified at-fault "
        "crashes. Monthly charts use the latest report version's filing month/year "
        "when present, not the incident month; reports without a valid filing "
        "month remain in all-time counts."
    )
    national, states, entities, vehicles, programs = (Counter() for _ in range(5))
    classification = summary["entity_classification"]
    for row in selected:
        year, month = row["report_year"].strip(), row["report_month"].strip()
        if not (year.isdigit() and month.isdigit() and 1 <= int(month) <= 12):
            continue
        y, m = int(year), int(month)
        entity = row["reporting_entity"].strip()
        national[y, m] += 1
        states[y, m, row["state"].strip() or "Unknown"] += 1
        entities[y, m, entity] += 1
        info = classification.get(entity, {})
        vehicles[y, m, info.get("vehicle_class", "unknown")] += 1
        programs[y, m, info.get("program_type", "unknown")] += 1

    def packed(counter, field=None):
        return [dict(year=k[0], month=k[1], **({field: k[2]} if field else {}), incident_count=v)
                for k, v in sorted(counter.items())]

    summary["monthly_national_total"] = packed(national)
    summary["monthly_by_state"] = packed(states, "state")
    summary["monthly_by_entity"] = packed(entities, "reporting_entity")
    summary["monthly_by_vehicle_class"] = packed(vehicles, "vehicle_class")
    summary["monthly_by_program_type"] = packed(programs, "program_type")
    SUMMARY.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    assert len(selected) == len({row["report_id"] for row in selected})
    assert sum(national.values()) == sum(states.values()) == sum(entities.values()) == sum(vehicles.values()) == sum(programs.values())
    print(f"SGO: {len(rows)} raw versions → {len(selected)} distinct latest-version reports; {sum(national.values())} have filing months")


if __name__ == "__main__":
    main()
