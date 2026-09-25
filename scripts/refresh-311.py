#!/usr/bin/env python3
"""Refresh reviewed San Francisco AV 311 and Austin public AV reports.

Only Austin's city-defined Resident Feedback records are counted as resident
complaints. Other staff and first-responder records remain available separately.
Public narrative and location fields are deliberately not copied.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DATA = Path(__file__).resolve().parent.parent / "public/data"
SOURCE = "https://data.sf.gov/resource/vw6y-z8j6.json"
AUSTIN_ITEM = "https://www.arcgis.com/sharing/rest/content/items/c15d72cee30643f7b422ebb5937f0b81"
AUSTIN_LAYER = "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/TPW_AV_Incidents_Reports_view/FeatureServer/0"
CATEGORY = "Autonomous Vehicle Complaints"
LIMIT = 50000

def fetch(url):
    with urlopen(Request(url, headers={"User-Agent": "AV-Observatory/1.0 (public research)"}), timeout=90) as response:
        return json.load(response)

def build_sf(rows):
    records = {}
    for raw in rows:
        if raw.get("service_name") != CATEGORY: raise ValueError("311 response contains non-AV records")
        ident = raw.get("service_request_id")
        date = raw.get("requested_datetime", "")[:10]
        if not ident or len(date) != 10: raise ValueError("311 record missing ID or date")
        records[ident] = {"id": "SF-" + ident, "source_id": ident, "state": "CA", "market": "San Francisco",
            "requested_datetime": raw.get("requested_datetime") or "", "requested_date": date, "month": date[:7], "type": raw.get("service_subtype") or "Unspecified",
            "status": raw.get("status_description") or "Unknown", "agency": raw.get("agency_responsible") or "",
            "source_url": SOURCE + "?" + urlencode({"service_request_id": ident})}
    records = sorted(records.values(), key=lambda row: (row["requested_date"], row["source_id"]))
    monthly = [{"month": month, "market": "San Francisco", "state": "CA", "complaints": count}
        for month, count in sorted(Counter(row["month"] for row in records).items())]
    return {"schema_version": "1.1.0", "dataset": "San Francisco AV-identifiable 311 service requests",
        "source_url": "https://data.sf.gov/d/vw6y-z8j6", "source_api": SOURCE,
        "selection": "Exact service_name match: Autonomous Vehicle Complaints. Other city request types and unclassified AV mentions are excluded.",
        "limitations": "These are public 311 requests, not verified incidents. The published subtypes describe how SF311 classified a request, not the specific behavior alleged. Operator identity is unavailable; the AV category begins in April 2025.",
        "source_data_as_of": max((raw.get("data_as_of", "") for raw in rows), default=""),
        "total_records": len(records), "markets": [{"market": "San Francisco", "state": "CA", "complaints": len(records)}],
        "monthly": monthly, "records": records}

def build_austin(features):
    records = {}
    for feature in features:
        raw = feature['attributes']
        ident = raw.get('OBJECTID')
        timestamp = raw.get('Date')
        if ident is None or not isinstance(timestamp, (int, float)):
            if ident is not None and all(raw.get(field) is None for field in ('Type','AV_Company','Date','Issue')):
                continue  # A blank ArcGIS placeholder is not a report.
            raise ValueError('Austin incident missing object ID or date')
        date = datetime.fromtimestamp(timestamp / 1000, timezone.utc).strftime('%Y-%m-%d')
        source_type = str(raw.get('Type') or 'Unspecified').strip()
        records[ident] = {"id": f"ATX-{ident}", "source_id": str(ident), "market": "Austin", "state": "TX",
            "reported_date": date, "month": date[:7], "reporter_type": source_type,
            "issue": str(raw.get('Issue') or 'Unspecified').strip(),
            "operator": str(raw.get('AV_Company') or 'Unspecified').strip(),
            "source_url": AUSTIN_LAYER + '/' + str(ident)}
    records = sorted(records.values(), key=lambda r: (r['reported_date'], int(r['source_id'])))
    feedback = [r for r in records if r['reporter_type'].casefold() == 'resident feedback']
    monthly = [{"month": month, "resident_feedback": n} for month, n in sorted(Counter(r['month'] for r in feedback).items())]
    issues = [{"issue": issue, "resident_feedback": n} for issue, n in sorted(Counter(r['issue'] for r in feedback).items(), key=lambda x: (-x[1],x[0]))]
    return {"schema_version": "1.0.0", "dataset": "Austin documented AV reports and resident feedback",
        "source_url": "https://www.austintexas.gov/transportation-public-works/autonomous-vehicles",
        "dashboard_url": "https://austin.maps.arcgis.com/apps/dashboards/dbd59d9b20634de1afad32a8267b739b",
        "source_item": AUSTIN_ITEM, "source_api": AUSTIN_LAYER + '/query',
        "selection": "Austin's public TPW AV incident feature layer. Resident complaints are exactly Type=Resident Feedback (case-insensitive); other Type values are city department or responder reports and are kept separate.",
        "limitations": "Austin compiles unvalidated reports received from residents, City departments, and other sources, including 311. The Resident Feedback label does not prove every record entered via 311. This series differs from San Francisco's dedicated 311 AV category and their raw counts should not be compared as rates. Public narrative and precise location are omitted from Observatory exports.",
        "total_city_reports": len(records), "blank_source_rows_excluded": len(features) - len(records), "resident_feedback_count": len(feedback),
        "latest_reported_date": max((r['reported_date'] for r in records), default=''),
        "reporter_types": [{"type": t,"reports": n} for t, n in sorted(Counter(r['reporter_type'] for r in records).items(),key=lambda x:(-x[1],x[0]))],
        "monthly": monthly, "resident_issues": issues, "records": records}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixture', type=Path, help='Read an archived San Francisco API response')
    parser.add_argument('--austin-fixture', type=Path, help='Read an archived Austin ArcGIS feature response')
    parser.add_argument('--check', action='store_true', help='Check stored JSON without network access')
    args = parser.parse_args()
    if args.check:
        sf = json.loads((DATA / 'av_311_complaints.json').read_text())
        atx = json.loads((DATA / 'austin_av_reports.json').read_text())
        if len(sf['records']) != sf['total_records'] or len({r['id'] for r in sf['records']}) != sf['total_records']:
            raise ValueError('SF 311 records missing or duplicated')
        if len(atx['records']) != atx['total_city_reports'] or len({r['id'] for r in atx['records']}) != atx['total_city_reports']:
            raise ValueError('Austin reports missing or duplicated')
        if atx['resident_feedback_count'] != sum(r['reporter_type'].casefold() == 'resident feedback' for r in atx['records']):
            raise ValueError('Austin resident feedback count mismatch')
        if sum(r['resident_feedback'] for r in atx['resident_issues']) != atx['resident_feedback_count']:
            raise ValueError('Austin issue totals do not match resident feedback')
        registry = json.loads((DATA / 'av_311_source_registry.json').read_text())
        operations = json.loads((DATA / 'operational_domains.json').read_text())
        deployed = {r['state'] for r in operations['locations'] if r['phase'] == 'deployment'}
        tracked = {s['state'] for s in registry['states']}
        if deployed - tracked: raise ValueError('Missing deployment state review: ' + ', '.join(sorted(deployed - tracked)))
        print(f"Validated {sf['total_records']} SF requests, {atx['resident_feedback_count']} Austin resident reports, and {len(tracked)} states")
        return
    sf_rows = json.loads(args.fixture.read_text()) if args.fixture else fetch(SOURCE + '?' + urlencode({'service_name': CATEGORY, '$limit': LIMIT}))
    if len(sf_rows) >= LIMIT: raise ValueError('SF 311 reached request page limit; paginate first')
    query = AUSTIN_LAYER + '/query?' + urlencode({'where':'1=1','outFields':'OBJECTID,Type,AV_Company,Date,Incident_No,Issue','returnGeometry':'false','f':'json','resultRecordCount':'2000'})
    atx_raw = json.loads(args.austin_fixture.read_text()) if args.austin_fixture else fetch(query)
    if atx_raw.get('error') or atx_raw.get('exceededTransferLimit') or len(atx_raw.get('features', [])) >= 2000:
        raise ValueError('Austin query errored or reached page limit; paginate before publishing')
    sf, atx = build_sf(sf_rows), build_austin(atx_raw['features'])
    (DATA / 'av_311_complaints.json').write_text(json.dumps(sf,ensure_ascii=False,indent=2)+'\n')
    (DATA / 'austin_av_reports.json').write_text(json.dumps(atx,ensure_ascii=False,indent=2)+'\n')
    print(f"Indexed {sf['total_records']} SF 311 requests, {atx['resident_feedback_count']} Austin resident reports (of {atx['total_city_reports']} city reports)")

if __name__ == '__main__': main()
