#!/usr/bin/env python3
"""Build reproducible CSV companions for the site's structured data."""
import argparse
import csv
import io
import json
from pathlib import Path
import sys

DATA = Path(__file__).resolve().parent.parent / "public" / "data"


def encode(value):
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return "" if value is None else value


def export(name, records, output):
    records = list(records)
    if not records or not all(isinstance(row, dict) for row in records):
        raise ValueError(f"Expected nonempty objects for {name}")
    fields = list(dict.fromkeys(field for row in records for field in row))
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for record in records:
        writer.writerow({key: encode(value) for key, value in record.items()})
    if name in output:
        raise ValueError(f"Duplicate export: {name}")
    output[name] = stream.getvalue()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Reject missing or outdated CSV exports")
    args = parser.parse_args()
    output = {}
    for path in sorted(DATA.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        stem = path.stem
        if stem == "manufacturer_profiles":
            export(stem + ".csv", ({"company": company, **{k: v for k, v in profile.items() if k != "developments"}}
                for company, profile in data["profiles"].items()), output)
            export(stem + "_developments.csv", ({"company": company, **event}
                for company, profile in data["profiles"].items() for event in profile.get("developments", [])), output)
        elif stem == "state_permit_registry":
            export(stem + ".csv", data["all_permits"], output)
            export(stem + "_manufacturers.csv", ({k: v for k, v in row.items() if k != "permits"} for row in data["manufacturers"]), output)
            export(stem + "_state_notes.csv", data["states_status_notes"], output)
        elif stem == "ma_adt_testing_registry":
            export(stem + ".csv", ({k: v for k, v in row.items() if k != "documents"} for row in data["companies"]), output)
            export(stem + "_documents.csv", ({"company": row["company"], **doc}
                for row in data["companies"] for doc in row.get("documents", [])), output)
        elif stem == "waymo_s2_vintage_summary":
            export(stem + ".csv", ({k: v for k, v in row.items() if k != "states"} for row in data["vintages"]), output)
            export(stem + "_states.csv", ({"vintage_end": row["vintage_end"], **state}
                for row in data["vintages"] for state in row["states"]), output)
        elif stem == "waymo_s2_state_summary":
            for key in ("state_summary", "county_summary"):
                export(stem + "_" + key + ".csv", data[key], output)
        elif stem == "policy_tracker":
            for key in ("federal", "federal_oversight", "states", "state_events", "city_events"):
                export(stem + "_" + key + ".csv", data[key], output)
        elif stem == "legislation_tracker":
            for key in ("federal", "states", "state_bills"):
                export(stem + "_" + key + ".csv", data[key], output)
            bills = data["federal"] + data["state_bills"]
            export(stem + "_stage_dates.csv", ({"bill_id": bill["id"], "stage": stage, "date": date}
                for bill in bills for stage, date in bill.get("stage_dates", {}).items() if date), output)
            hearings = [{"bill_id": bill["id"], **hearing}
                for bill in bills for hearing in bill.get("hearings", [])]
            if hearings:
                export(stem + "_hearings.csv", hearings, output)
        elif stem == "sgo_incidents_monthly":
            for key in ("monthly_national_total", "monthly_by_state", "monthly_by_entity", "monthly_by_vehicle_class", "monthly_by_program_type"):
                export(stem + "_" + key + ".csv", data[key], output)
        elif stem == "odd_history":
            for key in ("historical_events", "current_updates"):
                export(stem + "_" + key + ".csv", data[key], output)
        elif stem == "cpuc_activity_monthly":
            # The CPUC source already has an authoritative CSV in public/data.
            if not (DATA / (stem + ".csv")).is_file():
                raise ValueError("Missing existing CPUC CSV")
        elif stem == "operational_domains":
            export(stem + ".csv", data["locations"], output)
        elif stem == "waymo_ca_exposure_rate":
            export(stem + ".csv", data["monthly"], output)
        elif stem == "cpuc_vs_waymo_s2_ca_miles":
            export(stem + ".csv", [{"title": data["title"], "purpose": data["purpose"],
                **{side + "_" + k: v for side in ("cpuc_side", "waymo_s2_side") for k, v in data[side].items()},
                "caveats": data["caveats"]}], output)
        else:
            raise ValueError(f"Unmapped JSON dataset: {path.name}")

    for path in sorted(DATA.glob("*.geojson")):
        features = json.loads(path.read_text(encoding="utf-8"))["features"]
        export(path.stem + ".csv", ({**feature.get("properties", {}), "geometry_geojson": feature.get("geometry")}
            for feature in features), output)

    for name, content in output.items():
        target = DATA / name
        if args.check:
            if not target.is_file() or target.read_text(encoding="utf-8") != content:
                raise ValueError(f"CSV export is missing or stale: {name}")
        else:
            target.write_text(content, encoding="utf-8")
    print(f"{'Verified' if args.check else 'Generated'} {len(output)} CSV exports")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError) as exc:
        sys.exit(str(exc))
