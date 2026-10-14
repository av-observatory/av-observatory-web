#!/usr/bin/env python3
"""Build an independently auditable NHTSA automated-driving oversight dataset.

Primary inputs: NHTSA's entire ODI investigation flat file and post-2010
recall flat file. These are not aggregator summaries. Every relevant action
and campaign is deduplicated by its official ID, and ODI's CAMPNO is the
only automatic investigation-to-recall linkage.
"""
import io
import json
import re
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "public" / "data"
URL_INV = "https://static.nhtsa.gov/odi/ffdd/inv/FLAT_INV.zip"
URL_RCL = "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip"
COMPANIES = {
    "ZOOX": "Zoox", "WAYMO": "Waymo", "CRUISE": "Cruise",
    "TESLA": "Tesla", "NURO": "Nuro", "MOTIONAL": "Motional",
    "AURORA": "Aurora", "ARGO AI": "Argo AI",
    "MAY MOBILITY": "May Mobility", "WAYVE": "Wayve",
    "KODIAK": "Kodiak", "GATIK": "Gatik", "EASYMILE": "EasyMile",
    "NAVYA": "Navya", "PONY.AI": "Pony.ai", "WERIDE": "WeRide",
}
KEYWORDS = re.compile(
    r"\b(?:AUTONOMOUS|AUTOMATED DRIVING|SELF.DRIVING|FULL SELF.DRIVING|"
    r"FSD|AUTOPILOT|ROBOTAXI|DRIVERLESS|"
    r"LEVEL [345] AUTOMATION|ADS.EQUIPPED|"
    r"ADVANCED DRIVER ASSISTANCE|AUTOMATED LANE KEEPING)\b",
    re.I,
)
ADS_COMP = re.compile(r"AUTONOMOUS/SELF DRIVING|AUTONOMOUS.*SOFTWARE", re.I)

def fetch_tab(url):
    req = urllib.request.Request(url, headers={"User-Agent": "AVObservatory/1.0 (public research)"})
    with urllib.request.urlopen(req, timeout=90) as response:
        payload = response.read()
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        filename = next((n for n in archive.namelist() if n.lower().endswith((".txt", ".lst"))), None)
        if not filename:
            raise ValueError("No tab-delimited text in "+url)
        with archive.open(filename) as handle:
            for raw in handle:
                line = raw.decode("latin-1").rstrip("\r\n")
                if line:
                    yield [field.strip() for field in line.split("\t")]

def date(text):
    if not text or not re.fullmatch(r"\d{8}", text):
        return None
    try:
        return datetime.strptime(text, "%Y%m%d").date().isoformat()
    except ValueError:
        return None

def company_of(row):
    upper = " ".join(row).upper()
    for needle, label in COMPANIES.items():
        if needle in upper:
            return label
    return None

def relevant(company, make, component, subject, summary):
    if company and company != "Tesla":
        return True
    searchable = " ".join((make, component, subject, summary))
    return bool(KEYWORDS.search(searchable) or ADS_COMP.search(component))

def load_seeds():
    data = json.loads((DIR/"nhtsa_investigations.json").read_text(encoding="utf-8"))
    return {item["id"]: item for item in data["investigations"]}

def main():
    today = datetime.now(timezone.utc).date().isoformat()
    seed = load_seeds()
    recall_seed_path = DIR/"nhtsa_av_recalls.json"
    recall_seed = ({item["id"]: item for item in json.loads(recall_seed_path.read_text(encoding="utf-8"))["recalls"]}
                   if recall_seed_path.exists() else {})
    investigations = {}
    recall_links = {}
    inv_rows = 0
    for row in fetch_tab(URL_INV):
        inv_rows += 1
        if len(row) < 11:
            continue
        number, make, model, year, component, manufacturer, opened, closed, campaign, subject, summary = row[:11]
        if not number or not date(opened):
            continue
        company = company_of([manufacturer, make])
        if not relevant(company, make, component, subject, summary):
            continue
        company = company or "Other AV / ADAS"
        prior = seed.get(number, {})
        campaign = campaign.strip().upper()
        item = {
            "id": number, "company": company,
            "status": "Closed" if date(closed) else "Open",
            "action": prior.get("action") or {"PE":"Preliminary Evaluation","EA":"Engineering Analysis","AQ":"Audit Query","RQ":"Recall Query","DP":"Defect Petition"}.get(number[:2],"NHTSA Investigation"),
            "opened": date(opened), "closed": date(closed),
            "subject": prior.get("subject") or subject or "Automated driving safety investigation",
            "product": prior.get("product") or f"{make} {model}".strip(),
            "summary": prior.get("summary") or summary or subject,
            "source": prior.get("source") or "https://www.nhtsa.gov/search-safety-issues",
            "source_label": prior.get("source_label") or "NHTSA ODI",
            "related_recalls": [campaign] if campaign else [],
        }
        if number in investigations:
            old = investigations[number]
            if item["closed"] and not old["closed"]:
                old.update(status="Closed",closed=item["closed"])
            if campaign and campaign not in old["related_recalls"]:
                old["related_recalls"].append(campaign)
        else:
            investigations[number] = item
        if campaign:
            recall_links.setdefault(campaign, set()).add(number)
    if inv_rows < 500 or len(investigations) < 8:
        raise ValueError(f"Investigation feed appears truncated: {inv_rows} source rows, {len(investigations)} filtered")
    # Preserve NHTSA audit-query cases known to the prior curated dataset
    # even when absent from the public ODI defect-investigation flat file.
    for number, item in seed.items():
        if number not in investigations:
            investigations[number] = {**item, "related_recalls": []}
    recalls = {}
    recall_rows = 0
    for row in fetch_tab(URL_RCL):
        recall_rows += 1
        if len(row) < 23:
            continue
        campaign, make, model, component, manufacturer = row[1], row[2], row[3], row[6], row[7]
        recall_type, reported, defect, consequence, remedy = row[10], row[15], row[19], row[20], row[21]
        if not campaign or not date(reported):
            continue
        company = company_of([manufacturer, make])
        if not relevant(company, make, component, defect, consequence) and campaign not in recall_links:
            continue
        company = company or "Other AV / ADAS"
        current = recalls.get(campaign)
        if current:
            if model and model not in current["products"]:
                current["products"].append(model)
            continue
        curated = recall_seed.get(campaign, {})
        recalls[campaign] = {
            "id": campaign, "company": company, "reported": date(reported),
            "subject": curated.get("subject") or defect[:140].strip() or component,
            "summary": curated.get("summary") or defect.strip(),
            "consequence": consequence.strip(),
            "remedy": remedy.strip(),
            "products": [model] if model else [],
            "status": "Recall announced; remedy information in official record",
            "related_investigations": sorted(recall_links.get(campaign, [])),
            "source": "https://api.nhtsa.gov/recalls/campaignNumber?campaignNumber="+campaign,
            "source_label": "NHTSA campaign record",
        }
    if recall_rows < 1000 or len(recalls) < 3:
        raise ValueError(f"Recall feed appears truncated: {recall_rows} rows, {len(recalls)} relevant campaigns")
    for investigation in investigations.values():
        investigation["related_recalls"] = [c for c in investigation["related_recalls"] if c in recalls]
    data_inv = {"schema_version":"1.1.0","dataset":"NHTSA AV / ADAS Defect Investigations and Audit Queries",
        "source_url":URL_INV,"observed_at":today,
        "coverage":"Primary-source ODI investigation flat file; AV/ADAS keyword/manufacturer selection plus retained audited oversight records.",
        "source_rows":inv_rows,
        "investigations":sorted(investigations.values(),key=lambda r:(r["opened"] or "",r["id"]),reverse=True)}
    data_rcl = {"schema_version":"1.0.0","dataset":"NHTSA AV / ADAS Safety Recalls",
        "source_url":URL_RCL,"observed_at":today,
        "coverage":"Primary-source NHTSA post-2010 recall campaigns, deduplicated across model rows.",
        "source_rows":recall_rows,
        "recalls":sorted(recalls.values(),key=lambda r:(r["reported"],r["id"]),reverse=True)}
    (DIR/"nhtsa_investigations.json").write_text(json.dumps(data_inv,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (DIR/"nhtsa_av_recalls.json").write_text(json.dumps(data_rcl,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Audited {inv_rows} ODI source rows -> {len(investigations)} investigations; {recall_rows} recall rows -> {len(recalls)} campaigns")
    # Audit invariants: unique IDs, chronology, valid status, linked campaigns.
    assert len(investigations)==len({x["id"] for x in data_inv["investigations"]})
    assert len(recalls)==len({x["id"] for x in data_rcl["recalls"]})
    assert all((x["status"]=="Closed") == bool(x["closed"]) for x in data_inv["investigations"] if x["id"] not in seed)
    assert all(c in recalls for x in data_inv["investigations"] for c in x["related_recalls"])

if __name__ == "__main__":
    main()
