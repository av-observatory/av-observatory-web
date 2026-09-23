#!/usr/bin/env python3
"""Fail publication if SGO charts count old or duplicate report versions."""
import csv
import json
from collections import Counter
from pathlib import Path

data = Path(__file__).resolve().parents[1] / "public/data"
with (data / "sgo_incidents_all_versions.csv").open(newline="") as file:
    raw = list(csv.DictReader(file))
with (data / "sgo_incidents.csv").open(newline="") as file:
    latest = list(csv.DictReader(file))
summary = json.loads((data / "sgo_incidents_monthly.json").read_text())
expected = {}
for row in raw:
    id = row["report_id"].strip()
    if id not in expected or int(row["report_version"]) > int(expected[id]["report_version"]):
        expected[id] = row
actual = {row["report_id"].strip(): row for row in latest}
assert len(actual) == len(latest) == len(expected) == summary["row_count"], "Duplicate SGO report IDs or incorrect count"
assert actual == expected, "The displayed SGO snapshot must retain the highest version of every report"
monthly = Counter()
for row in latest:
    y, m = row["report_year"].strip(), row["report_month"].strip()
    if y.isdigit() and m.isdigit() and 1 <= int(m) <= 12:
        monthly[int(y), int(m)] += 1
assert monthly == {(r["year"], r["month"]): r["incident_count"] for r in summary["monthly_national_total"]}, "SGO monthly counts include duplicate or stale versions"
print(f"Validated {len(latest)} latest-version SGO reports from {len(raw)} source rows")
