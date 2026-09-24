#!/usr/bin/env python3
"""Crosswalk an exact-quarter SF311 count against SF-county Waymo S2 mileage.

The numerator includes all operators; the denominator is Waymo rider-only
mileage. It is a contextual ratio, not an operator complaint rate.
"""
import csv
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'public/data'

def miles(vintage):
    with (DATA / f'waymo_s2_{vintage}.csv').open(newline='') as handle:
        rows = {r['s2_cell']: r for r in csv.DictReader(handle) if r['state'] == 'California' and r['county'] == 'San Francisco'}
    return sum(float(r['waymo_ro_miles']) for r in rows.values()), len(rows)

sf = json.loads((DATA / 'av_311_complaints.json').read_text())
start, start_cells = miles('202512')
end, end_cells = miles('202603')
requests = sum(r['complaints'] for r in sf['monthly'] if '2026-01' <= r['month'] <= '2026-03')
prior_year = sum(r['complaints'] for r in sf['monthly'] if '2025-04' <= r['month'] <= '2026-03')
assert end > start and requests > 0
out = {'schema_version':'1.0.0','period_start':'2026-01-01','period_end':'2026-03-31',
    'sf_311_requests_all_operators':requests,'sf_311_requests_prior_twelve_months':prior_year,
    'waymo_ro_miles_sf_county':round(end-start,2),
    'sf_311_requests_per_million_waymo_ro_miles_context_only':round(requests/(end-start)*1e6,2),
    's2_cells_start':start_cells,'s2_cells_end':end_cells,
    'numerator_source':sf['source_url'],'denominator_source':'https://waymo.com/safety/impact/',
    'interpretation':'Context only: all-operator SF311 requests divided by Waymo-only rider-only miles. This is not a Waymo complaint rate, causal comparison, or verified violation rate.',
    'annual_limit':'A matching San Francisco county S2 baseline for March 2025 is not in the archived county-coded files; the past-year 311 count is shown without a one-year miles rate.'}
(DATA/'sf_311_waymo_s2_context.json').write_text(json.dumps(out,indent=2)+'\n')
with (DATA/'sf_311_waymo_s2_context.csv').open('w',newline='') as handle:
    writer=csv.DictWriter(handle,fieldnames=out.keys());writer.writeheader();writer.writerow(out)
print(out)
