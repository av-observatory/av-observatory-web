#!/usr/bin/env python3
"""Build the standalone S2 viewer and its latest-vintage CSV from reviewed GeoJSON."""
import argparse
import csv
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'public/data'
TEMPLATE = ROOT / 'scripts/waymo-s2-explorer.template.html'
HTML = ROOT / 'public/waymo-s2-explorer/index.html'
CSV = DATA / 'waymo_s2_explorer.csv'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    features = json.loads((DATA / 'waymo_s2_latest.geojson').read_text())['features']
    out = io.StringIO(newline='')
    writer = csv.DictWriter(out, fieldnames=['S2 Cell','state_name','county_name','Waymo RO Miles'],lineterminator='\n')
    writer.writeheader()
    seen={}
    for f in features:
        p=f['properties']; cell=p['s2_cell']
        if cell not in seen: seen[cell]={'state':p['state'],'counties':set(),'miles':0}
        if seen[cell]['state']!=p['state']: raise ValueError(f'S2 cell crosses states: {cell}')
        seen[cell]['counties'].add(p['county'])
        seen[cell]['miles']+=p['waymo_ro_miles']
    for cell,p in sorted(seen.items()):
        writer.writerow({'S2 Cell':cell,'state_name':p['state'],'county_name':' / '.join(sorted(p['counties'])),'Waymo RO Miles':p['miles']})
    csv_text=out.getvalue()
    # JS string literal encoding also escapes newlines and angle brackets safely.
    html=TEMPLATE.read_text().replace('/*__DEFAULT_CSV__*/', json.dumps(csv_text,ensure_ascii=False).replace('<','\\u003c'))
    if args.check:
        if CSV.read_text()!=csv_text or HTML.read_text()!=html: raise ValueError('Waymo explorer or CSV out of date')
    else:
        CSV.write_text(csv_text)
        HTML.parent.mkdir(parents=True,exist_ok=True)
        HTML.write_text(html)
    print(f'{"Verified" if args.check else "Generated"} Waymo viewer with {len(seen)} distinct S2 cells')
if __name__=='__main__':main()
