#!/usr/bin/env python3
"""Rebuild the reviewable policy snapshot from curated authorities and state briefs.

Run after editing the existing state briefs or the event records below. No live
scraping is performed: policy changes require source review before publication.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SURVEY = ROOT / "src/lib/statePolicySurvey.ts"
OUTPUT = ROOT / "public/data/policy_tracker.json"
REVIEWED = "2026-09-23"
GUIDE = "https://www.bakerdonelson.com/avmap"

names = dict(zip(
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(),
    "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia".split("|")
))

# States with an enacted AV-specific statute identified in the state-law review.
# Pilot, testing and freight-only measures count, but are described as such.
statutes = set("AL AR AZ CA CO CT DC FL GA HI IL IA KS KY LA ME MD MI MS MT NE NV NH NM NY NC ND OK PA SD TN TX UT VT WA WV".split())
orders = {
    "AZ": [("2018-03-01", "Arizona Executive Order 2018-04", "Historical executive framework for driverless testing and operation; much of it was codified in HB 2813 in 2021.", "https://azdot.gov/mvd/services/professional-services/autonomous-vehicles-testing-and-operating-state-arizona", "superseded")],
    "MA": [("2016-10-20", "Massachusetts Executive Order 572", "Established a state-led approval framework for highly automated vehicle testing. Rescinded in 2022.", "https://www.mass.gov/executive-orders/no-572-to-promote-the-testing-and-deployment-of-highly-automated-driving-technologies", "rescinded"), ("2022-12-14", "Massachusetts Executive Order 603", "Rescinded Executive Order 572. The prior order must not be shown as current operating authority.", "https://www.mass.gov/executive-orders/no-603-rescinding-certain-executive-orders", "in_effect")],
    "WA": [("2017-06-07", "Washington Executive Order 17-02", "Created a state testing coordination and self-certification framework.", "https://governor.wa.gov/sites/default/files/exe_order/17-02AutonomouVehicles.pdf", "historical_status_unverified")],
    "OH": [("2019-10-02", "Ohio Executive Order 2019-26D", "Reauthorized DriveOhio as the state smart mobility center; its testing registration is distinct from deployment approval.", "https://governor.ohio.gov/media/executive-orders/executive-order-2019-26d", "historical_status_unverified")],
    "DE": [("2017-09-05", "Delaware Executive Order 14", "Created an advisory council on connected and autonomous vehicles; it did not itself authorize driverless commercial service.", "https://archives.delaware.gov/executive-orders/governor-john-carney/", "historical_status_unverified")],
    "ID": [("2018-01-02", "Idaho Executive Order 2018-01", "Created a committee to study controlled testing and operation, not a statewide operating permit.", "https://proddfmmainsa.blob.core.windows.net/dfm-admin-website/rules/2018%20Archive/ExOs/2018-01_ExOr_18-2.pdf", "historical_status_unverified")],
    "IL": [("2018-10-25", "Illinois Executive Order 2018-13", "Established the Autonomous Illinois initiative and a voluntary testing program with an onboard licensed driver.", "https://www.illinois.gov/government/executive-orders/executive-order.executive-order-number-13.2018.html", "historical_status_unverified")],
    "ME": [("2018-01-18", "Maine executive order on highly automated vehicles", "Created an advisory committee to recommend policy; the separate legislative resolve addresses a pilot framework.", "https://www.maine.gov/governor/lepage/official-documents/executive-orders.html", "historical_status_unverified")],
    "MN": [("2018", "Minnesota Executive Order 18-04", "Established a connected and automated vehicles advisory council; rescinded by Executive Order 19-18.", "https://www.lrl.mn.gov/archive/execorders/18-04.pdf", "rescinded"), ("2019-04-01", "Minnesota Executive Order 19-18", "Replaced the 2018 advisory council order with a governor's council and interagency coordination.", "https://www.leg.mn.gov/archive/execorders/19-18.pdf", "historical_status_unverified")],
    "WI": [("2017-05-18", "Wisconsin Executive Order 245", "Created a steering committee on AV testing and deployment; the order specified dissolution after a 2018 final report.", "https://wisconsindot.gov/Documents/about-wisdot/who-we-are/comm-couns/executive-order245.pdf", "completed")],
}

state_links = {
    "AL": ("Alabama SB 47 enrolled text", "https://alison.legislature.state.al.us/files/pdf/SearchableInstruments/2019RS/PrintFiles/SB47-Enr.pdf"),
    "AR": ("Arkansas HB 1561 · AV pilot program", "https://www.arkleg.state.ar.us/Bills/Detail?ddBienniumSession=2019%2F2019R&id=HB1561"),
    "AZ": ("Arizona DOT AV framework and HB 2813 history", "https://azdot.gov/mvd/services/professional-services/autonomous-vehicles-testing-and-operating-state-arizona"),
    "CA": ("California DMV AV program", "https://www.dmv.ca.gov/portal/vehicle-industry-services/autonomous-vehicles/"),
    "CO": ("Colorado SB 17-213", "https://leg.colorado.gov/bills/sb17-213"),
    "CT": ("Connecticut Public Act 17-69", "https://www.cga.ct.gov/2017/act/pa/2017PA-00069-R00SB-00260-PA.htm"),
    "FL": ("Florida Statutes § 316.85", "https://www.flsenate.gov/Laws/Statutes/2025/316.85"),
    "GA": ("Georgia SB 219", "https://www.legis.ga.gov/Legislation/20172018/170801.pdf"),
    "HI": ("Hawaii Act 21 (2020)", "https://data.capitol.hawaii.gov/sessions/sessionlaws/Years/SLH2020/SLH2020_Act21.pdf"),
    "IA": ("Iowa Code § 321.514", "https://www.legis.iowa.gov/docs/code/321.514.pdf"),
    "IL": ("Illinois Vehicle Code § 11-208(e-10)", "https://www.ilga.gov/legislation/ilcs/fulltext?DocName=062500050K11-208"),
    "ME": ("Maine Resolve Chapter 46", "https://www.legislature.maine.gov/legis/bills/bills_128th/chapters/RESOLVE46.asp"),
    "KS": ("Kansas Statutes § 8-2902", "https://www.kslegislature.gov/b2025_26/laws/008_000_0000_chapter/008_029_0000_article/008_029_0002_section/008_029_0002_k/"),
    "KY": ("Kentucky HB 7 (2024)", "https://apps.legislature.ky.gov/record/24rs/hb7.html"),
    "LA": ("Louisiana Revised Statutes § 32:400.3", "https://www.legis.la.gov/legis/LawPrint.aspx?d=1148308"),
    "MD": ("Maryland Transportation Code § 15-901", "https://www.mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gtr&enactments=false&section=15-901"),
    "MS": ("Mississippi HB 1003 sent to governor (2023)", "https://billstatus.ls.state.ms.us/documents/2023/pdf/HB/1000-1099/HB1003SG.pdf"),
    "MT": ("Montana Code § 61-6-409", "https://mca.legmt.gov/bills/mca/title_0610/chapter_0060/part_0040/section_0090/0610-0060-0040-0090.html"),
    "NE": ("Nebraska Revised Statutes § 60-3302", "https://nebraskalegislature.gov/laws/statutes.php?statute=60-3302"),
    "NH": ("New Hampshire RSA 242:1", "https://gc.nh.gov/rsa/html/XX/242/242-1.htm"),
    "NM": ("NMDOT autonomous vehicle testing notification", "https://www.dot.nm.gov/highway-operations-program/operations-support-division-director/intelligent-transportation-systems/"),
    "NC": ("North Carolina General Statutes Article 18", "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/ByArticle/Chapter_20/Article_18.html"),
    "ND": ("North Dakota Century Code Chapter 39-01", "https://ndlegis.gov/cencode/t39c01.html"),
    "OK": ("Oklahoma SB 1541 (2022)", "https://www.oklegislature.gov/BillInfo.aspx?Bill=SB1541&Session=2200"),
    "DC": ("DDOT AV law and testing guidance", "https://ddot.dc.gov/page/autonomous-vehicles"),
    "MI": ("Michigan automated vehicle statutes", "https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-300-1949-VI-AUTOMATED-VEHICLES"),
    "NV": ("Nevada DMV AV program", "https://dmv.nv.gov/autonomous.htm"),
    "NY": ("New York State DMV AV demonstration", "https://dmv.ny.gov/business/autonomous-vehicle-technology-demonstration-testing-and-operation"),
    "PA": ("Pennsylvania Vehicle Code Chapter 85", "https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/75/75.HTM"),
    "SD": ("South Dakota HB 1095 enrolled (2024)", "https://mylrc.sdlegislature.gov/api/Documents/Bill/264493.pdf?Year=2024"),
    "TN": ("Tennessee Automated Vehicles Act, HB 381", "https://wapp.capitol.tn.gov/apps/BillInfo/Default?BillNumber=HB0381&ga=110"),
    "TX": ("Texas DMV commercial AV authorization", "https://www.txdmv.gov/AVprogram"),
    "UT": ("Utah Code Chapter 41-26", "https://le.utah.gov/xcode/Title41/Chapter26/41-26.html"),
    "VT": ("Vermont Automated Vehicle Testing Act", "https://legislature.vermont.gov/statutes/fullchapter/23/041"),
    "WA": ("Washington DOL AV guidance", "https://dol.wa.gov/vehicles-and-boats/vehicles/vehicle-registration/register-other-vehicles-and-other-services/registering-autonomous-vehicles"),
    "WV": ("West Virginia Fully Autonomous Vehicle Act", "https://code.wvlegislature.gov/17H-1/"),
}
statute_dates = {"AR": "2019", "AZ": "2021", "CO": "2017", "GA": "2017", "HI": "2020-09-15", "MI": "2016", "PA": "2022", "TN": "2017", "TX": "2017"}

def event(id, level, place, title, summary, kind, status, date, source, **extra):
    return dict(id=id, level=level, jurisdiction=place, title=title, summary=summary,
                instrument=kind, status=status, date=date, source_url=source,
                verified_at=REVIEWED, **extra)

federal = [
    event("fmvss-2018-rfc", "federal", "US", "FMVSS barrier review", "NHTSA requested public comment on standards that might impede certification or testing of ADS vehicles without human driving controls. This request did not amend a standard.", "FMVSS rulemaking", "request_for_comment", "2018-01-18", "https://www.federalregister.gov/documents/2018/01/18/2018-00671/removing-regulatory-barriers-for-vehicles-with-automated-driving-systems", fmvss=[]),
    event("fmvss-2019-anprm", "federal", "US", "Removing regulatory barriers for ADS vehicles", "Advanced notice sought input on adapting crash avoidance standards for vehicles without traditional manual controls; it did not change an FMVSS.", "FMVSS rulemaking", "advance_notice", "2019-05-28", "https://www.federalregister.gov/documents/2019/05/28/2019-11032/removing-regulatory-barriers-for-vehicles-with-automated-driving-systems", fmvss=[]),
    event("fmvss-2020-nprm", "federal", "US", "Occupant protection proposal", "Proposed adapting crash protection requirements for ADS vehicles without conventional driving controls.", "FMVSS rulemaking", "superseded_by_final", "2020-03-30", "https://www.federalregister.gov/documents/2020/03/30/2020-05886/occupant-protection-for-automated-driving-systems", fmvss=["208"]),
    event("fmvss-2022-final", "federal", "US", "Occupant protection final rule", "Updated occupant protection standards for ADS vehicles without traditional manual driving controls; a finalized vehicle design rule, not an ADS driving performance test.", "FMVSS rulemaking", "effective", "2022-03-30", "https://www.federalregister.gov/documents/2022/03/30/2022-05426/occupant-protection-for-vehicles-with-automated-driving-systems", fmvss=["208"], effective_date="2022-09-26", proposal_date="2020-03-30", proposal_url="https://www.federalregister.gov/documents/2020/03/30/2020-05886/occupant-protection-for-automated-driving-systems"),
    event("fmvss-102-2026", "federal", "US", "Transmission displays · FMVSS 102", "Proposed changes to requirements written around human-operated transmission controls in ADS-equipped vehicles.", "FMVSS rulemaking", "under_review", "2026-03-16", "https://www.federalregister.gov/d/2026-05024", fmvss=["102"], comment_deadline="2026-04-15"),
    event("fmvss-103-104-2026", "federal", "US", "Defrosting and windshield wiping · FMVSS 103/104", "Proposed changes to defrosting and wiping requirements for ADS vehicles without conventional driver controls.", "FMVSS rulemaking", "under_review", "2026-03-16", "https://www.federalregister.gov/d/2026-05023", fmvss=["103", "104"], comment_deadline="2026-04-15"),
    event("fmvss-110-2026", "federal", "US", "Tire placards · FMVSS 110", "Proposed adapting tire information placard requirements to ADS-equipped vehicle designs.", "FMVSS rulemaking", "under_review", "2026-04-01", "https://www.federalregister.gov/d/2026-06254", fmvss=["110"], comment_deadline="2026-05-01"),
    event("fmvss-135-2026", "federal", "US", "Brake controls · FMVSS 135", "Proposed removing the manual brake pedal requirement for vehicles designed exclusively for ADS operation while retaining braking performance requirements.", "FMVSS rulemaking", "under_review", "2026-06-26", "https://www.federalregister.gov/d/2026-12981", fmvss=["135"], comment_deadline="2026-08-26", comment_extension_url="https://www.federalregister.gov/d/2026-15231"),
]
oversight = [
    event("nhtsa-sgo-2021", "federal", "US", "Standing General Order crash reporting", "NHTSA ordered specified ADS and Level 2 ADAS crash reports from manufacturers and operators; the reports are not determinations of fault.", "oversight order", "in_effect_as_amended", "2021-06-29", "https://www.nhtsa.gov/press-releases/nhtsa-orders-crash-reporting-vehicles-equipped-advanced-driver-assistance-systems"),
    event("nhtsa-sgo-2025", "federal", "US", "Third amended Standing General Order", "NHTSA revised ADS crash reporting requirements in April 2025. Review the current order and amendments for applicable thresholds and deadlines.", "oversight order", "in_effect", "2025-04-24", "https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting"),
    event("nhtsa-av-step-2025", "federal", "US", "AV STEP proposal", "Proposed a voluntary ADS safety transparency and evaluation program. NHTSA withdrew this proposal in June 2026; no AV STEP program took effect.", "proposed program", "withdrawn", "2025-01-15", "https://www.federalregister.gov/documents/2025/01/15/2024-30854/ads-equipped-vehicle-safety-transparency-and-evaluation-program"),
    event("nhtsa-av-step-2026", "federal", "US", "AV STEP withdrawal", "NHTSA formally withdrew the 2025 AV STEP proposed rulemaking.", "withdrawal", "final", "2026-06-26", "https://www.federalregister.gov/documents/2026/06/26/2026-12980/ads-equipped-vehicle-safety-transparency-and-evaluation-program-withdrawal"),
]

city = [
    event("nyc-testing-2024", "city", "New York City", "NYC DOT AV testing permit", "The city requires its own testing permit on top of the New York State DMV demonstration permit, with a trained human test operator in the driver's seat. This is a testing program, not commercial deployment approval.", "permit program", "in_effect", "2024-03-28", "https://www.nyc.gov/html/dot/html/motorist/autonomous-vehicles.shtml", state="NY"),
    event("seattle-testing-2022", "city", "Seattle", "Seattle AV testing permit", "SDOT established a Street Use permit for AV tests, including an onboard test driver and first responder plan. First permits were issued in 2023.", "permit program", "in_effect", "2022", "https://www.seattle.gov/transportation/projects-and-programs/programs/autonomous-vehicle-testing-permit", state="WA"),
    event("sf-state-authority", "city", "San Francisco", "State-led passenger service oversight", "California DMV permits underlying AV operation and CPUC permits passenger service. SFMTA manages city streets and curb policy and participates in state proceedings; it does not issue the statewide AV passenger permit.", "oversight position", "current", None, "https://www.sfmta.com/projects/autonomous-vehicles-avs-san-francisco", state="CA"),
    event("sf-market-street-2025", "city", "San Francisco", "Market Street pickup and drop-off access", "The city began allowing Waymo passenger pickup and drop-off on Market Street under local street-use rules.", "street rule", "in_effect", "2025-04-10", "https://www.sfmta.com/notices/waymo-market-street-message-director-kirschbaum", state="CA"),
    event("austin-coordination", "city", "Austin", "AV coordination under Texas preemption", "Texas places AV operation oversight with the state. Austin publishes public-safety and street coordination information but does not grant a separate AV operating authorization.", "oversight position", "current", None, "https://www.austintexas.gov/transportation-public-works/autonomous-vehicles", state="TX"),
    event("boston-testing-history", "city", "Boston", "Boston AV testing approach", "Boston's earlier testing approach used a local memorandum of understanding. The city's published program information includes historical approvals and should not be read as a current permit roster.", "testing framework", "historical_status_unverified", None, "https://www.boston.gov/departments/new-urban-mechanics/autonomous-vehicles-bostons-approach", state="MA"),
]

raw = SURVEY.read_text()
rows = {}
for match in re.finditer(r'^  ([A-Z]{2}): (\[".*?"\]),?$', raw, re.M):
    rows[match.group(1)] = json.loads(match.group(2))
primary = (ROOT / "src/lib/statePolicy.ts").read_text()
for match in re.finditer(r'^  ([A-Z]{2}): \{\s*framework: "([^"]+)",\s*analysis: "([^"]+)",\s*oversight: "([^"]+)"', primary, re.M):
    rows[match.group(1)] = list(match.groups()[1:])

states = []
events = []
for code, name in names.items():
    brief = rows.get(code)
    if code == "DC":
        brief = ["Testing pathway", "District rules address AV testing with a human behind the wheel; a testing provision is not commercial deployment authorization.", "DDOT oversight."]
    if code == "MA":
        brief = ["Historical testing order rescinded", "Executive Order 572 established a testing framework in 2016 and was rescinded by Executive Order 603 in 2022. Current testing authority needs separate verification.", "Do not rely on the rescinded order for current testing."]
    if code == "MI":
        brief = ["Testing and conditional operation", "Michigan law covers research, testing and operation and permits driverless use under statutory conditions, including minimal-risk capability and insurance. SAVE projects have separate manufacturer limits.", "State AV statutes and vehicle rules."]
    if code == "HI":
        brief = ["Testing pilot legislation", "Act 21 (2020) established a state AV testing pilot with an onboard human driver and a report to the 2023 legislature. It did not grant broad driverless commercial authority.", "Hawaii DOT determined eligible pilot testers."]
    if not brief:
        raise ValueError(f"Missing state brief: {code}")
    link_label, link_url = state_links.get(code, ("State law survey (secondary source; verify primary text)", GUIDE))
    if code in statutes:
        events.append(event(f"{code.lower()}-statute-baseline", "state", name,
            "Enacted AV statute · current framework", brief[1], "legislation", "in_effect", statute_dates.get(code),
            link_url, state=code, source_label=link_label,
            source_tier="primary" if code in state_links else "secondary", date_precision="year" if code in statute_dates else "undetermined"))
        if code == "HI":
            events[-1].update(title="Act 21 · AV testing pilot", date="2020-09-15", date_precision="day", status="historical_status_unverified")
        if code == "TX":
            events.append(event("tx-sb2807-2025", "state", name, "SB 2807 · commercial AV authorization", "Added a TxDMV authorization program for commercial AV operation; the authorization requirement became enforceable May 28, 2026.", "legislation", "in_effect", "2025", "https://www.txdmv.gov/AVprogram", state=code, source_label="TxDMV AV program", source_tier="primary", date_precision="year"))
    for date, title, summary, source, status in orders.get(code, []):
        events.append(event(f"{code.lower()}-eo-{date[:4]}", "state", name, title, summary,
            "executive_order", status, date, source, state=code, source_label=title, source_tier="primary"))
    states.append(dict(code=code, name=name, framework=brief[0], analysis=brief[1], oversight=brief[2],
        enacted_legislation=code in statutes, executive_order_history=code in orders,
        source_url=link_url, source_label=link_label,
        source_tier="primary" if code in state_links else "secondary", verified_at=REVIEWED))

# California's rulemaking history is distinct from individual permit grants.
dmv = "https://www.dmv.ca.gov/portal/vehicle-industry-services/autonomous-vehicles/california-autonomous-vehicle-regulations/"
cpuc = "https://www.cpuc.ca.gov/regulatory-services/licensing/transportation-licensing-and-analysis-branch/autonomous-vehicle-programs"
ca_history = [
    ("ca-dmv-2017-proposal", "2017-03-10", "DMV · driverless testing and deployment proposal", "DMV proposed a regulatory framework for driverless testing and deployment, followed by modified texts in October and November 2017.", "regulatory proposal", "historical", dmv),
    ("ca-dmv-2020-delivery", "2020-01-16", "DMV · light-duty delivery vehicle rules", "DMV began accepting applications under approved rules for autonomous delivery trucks below 10,001 pounds. Operation still required a DMV permit.", "regulation", "in_effect", dmv),
    ("ca-dmv-2024-draft", "2024-08-30", "DMV · draft testing and deployment update", "DMV requested public comments on draft changes to Articles 3.7 (testing) and 3.8 (deployment). This was an early draft, not adopted text.", "draft regulation", "superseded", dmv),
    ("ca-dmv-2025-proposal", "2025-04-25", "DMV · formal regulatory proposal", "DMV published proposed changes to Articles 3.7 and 3.8 and its initial statement of reasons; the initial comment period ended June 9, 2025.", "regulatory proposal", "superseded", dmv),
    ("ca-dmv-2025-modified", "2025-12-03", "DMV · first modified proposal", "DMV released revised regulatory text for another comment round, which closed December 18, 2025.", "modified proposal", "superseded", dmv),
    ("ca-dmv-2026-modified", "2026-01-21", "DMV · second modified proposal", "DMV released a second revision of Articles 3.7 and 3.8; comments closed February 5, 2026.", "modified proposal", "superseded", dmv),
    ("ca-dmv-2026-effective", "2026-04-28", "DMV · updated testing and deployment rules effective", "The adopted Article 3.7 testing and Article 3.8 deployment updates took effect. Testing data reporting has a 120-day implementation period; deployment reports begin after the first full calendar quarter following the effective date.", "regulation", "in_effect", "https://www.dmv.ca.gov/portal/about-the-california-department-of-motor-vehicles/california-dmv-rulemaking-actions/"),
    ("ca-cpuc-2018-pilots", "2018-05-31", "CPUC · passenger service pilots", "Decision 18-05-043 authorized drivered and driverless test AV passenger service. These pilots require a corresponding DMV testing permit and cannot charge fares.", "commission decision", "in_effect", cpuc),
    ("ca-cpuc-2020-deployment", "2020-11-20", "CPUC · paid passenger deployment framework", "Decision 20-11-046, as modified by 21-05-017, authorized drivered and driverless paid passenger service programs. Deployment applicants also need a DMV deployment permit; driverless applicants submit a Passenger Safety Plan.", "commission decision", "in_effect", cpuc),
    ("ca-cpuc-2024-reporting", "2024-11-07", "CPUC · enhanced passenger service reporting", "CPUC adopted enhanced AV reporting after a 2023 workshop and public comments, extending oversight of passenger safety and service activity.", "commission decision", "in_effect", cpuc),
]
for id, date, title, summary, instrument, status, source in ca_history:
    events.append(event(id, "state", "California", title, summary, instrument, status, date, source,
        state="CA", source_label="California DMV" if id.startswith("ca-dmv") else "CPUC AV passenger service programs", source_tier="primary"))
for state in states:
    if state["code"] == "CA":
        state["analysis"] = "DMV regulates AV testing and deployment under Articles 3.7 and 3.8. Its 2026 update followed a draft, formal proposal and two modified comment rounds. CPUC separately authorizes passenger service: test pilots cannot charge fares, while deployment programs can. A DMV permit alone does not authorize paid rides."
        state["oversight"] = "DMV: vehicle testing, deployment permits and reporting. CPUC: passenger service pilots, fare-charging deployment, passenger safety and service reporting."

dataset = dict(schema_version="1.1.0", as_of=REVIEWED,
    methodology="Curated policy snapshot. An enacted statute includes narrow testing or pilot laws; EO history includes rescinded orders. Secondary survey classifications require primary-text review. No-policy-record is not a finding that AV operation is legal or illegal. Dates are null when enactment date is unverified.",
    federal=federal, federal_oversight=oversight, states=states, state_events=events, city_events=city)
OUTPUT.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n")
print(f"Wrote {len(states)} jurisdictions, {len(events)} state events, {len(city)} city events, {len(federal)} federal events")
