#!/usr/bin/env python3
"""Validate published NHTSA report joins and CPUC rate denominators offline."""
import csv
import json
from pathlib import Path
from collections import Counter

DATA=Path(__file__).resolve().parent.parent/'public/data'
def read(name):
    with (DATA/name).open(newline='',encoding='utf-8') as f:return list(csv.DictReader(f))
reports=read('sgo_incidents.csv')
details=read('sgo_crash_details.csv')
serious=read('sgo_serious_fatal_crashes.csv')
rates=json.loads((DATA/'ca_waymo_sgo_rates.json').read_text())['monthly']
assert len(reports)==len(details)==len({r['report_id'] for r in details})
assert {r['report_id'] for r in reports}=={r['report_id'] for r in details}
assert len(serious)==len({r['incident_key'] for r in serious})
assert all(r['report_ids'] and r['source_url'].startswith('https://static.nhtsa.gov/') for r in serious)
assert len(rates)==len({r['month'] for r in rates}) and all(r['cpuc_driverless_vmt']>0 for r in rates)
assert all(abs(r['crashes_per_million_miles']-r['sgo_ads_crashes']/r['cpuc_driverless_vmt']*1e6)<.001 for r in rates)
print(f'Validated {len(details)} latest NHTSA reports, {len(serious)} severe incidents, {len(rates)} matched months')
