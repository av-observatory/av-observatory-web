# Reporting datasets and refresh

## 311 requests

`public/data/av_311_complaints.json` contains the reviewed San Francisco 311 category, one record per public service request ID. `av_311_source_registry.json` inventories official sources across states with documented deployments. Only a municipality with a public AV-identifiable category contributes counts; missing coverage never means zero requests. The daily `refresh-311.yml` workflow runs `python3 scripts/refresh-311.py` and `python3 scripts/export-data-csv.py`, validates, and commits changes. Add another city's official source with an explicit classification and stable request IDs to the refresh script and the registry before including its totals. Do not use keyword inference or public addresses as an AV attribution rule. The publisher in the parent data repository copies each committed JSON/CSV snapshot to R2.

## NHTSA incidents and CPUC mileage

`python3 scripts/build-safety-rates.py --archive <NHTSA archived ADS CSV> --current <NHTSA current ADS CSV>` enriches the existing latest-version `sgo_incidents.csv` snapshot with official air-bag fields and NHTSA's Same Incident ID, generates a distinct serious/fatal crash list, and joins incident month to Waymo's monthly CPUC driverless P1+P2+P3 mileage. The script rejects a version or report-ID mismatch: update the SGO snapshot first if NHTSA has added reports. Check with `python3 scripts/validate-safety-rates.py`, then regenerate CSV companions. The resulting rates are **descriptive proxies**: NHTSA's Waymo ADS crash numerator may include testing or operations beyond CPUC's passenger-service denominator. Severity reflects the highest alleged injury severity in an incident, not the number of people injured. Records sharing NHTSA's Same Incident ID are counted once in the serious/fatal list and the within-operator monthly rate.

## Waymo map

`python3 scripts/build-waymo-explorer.py` takes the latest reviewed S2 GeoJSON snapshot and generates both `public/data/waymo_s2_explorer.csv` and the standalone `public/waymo-s2-explorer/index.html`. The HTML embeds its starting CSV and requires network access only for Leaflet, PapaParse, and the CartoDB map tiles. Rows with the same S2 Cell in multiple counties have their mileage summed for one polygon, and county names are retained. The Level 13 geometry decoder lives in the single HTML file without an S2 CDN. Run `python3 scripts/build-waymo-explorer.py --check` before publishing. The CSV and other top-level `public/data` files are included in the parent repository's R2 snapshot.
