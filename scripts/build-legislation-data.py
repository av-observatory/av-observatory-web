#!/usr/bin/env python3
"""Build the reviewed bill snapshot. Refresh script may supersede it on R2."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
policy = json.loads((root / "public/data/policy_tracker.json").read_text())
as_of = "2026-09-23"
ncsl = "https://www.ncsl.org/transportation/autonomous-vehicles-legislation-database"

def bill(state, number, title, summary, status, action_date, action, url, session="2025-2026", repository=ncsl):
    return dict(id=f"{state.lower()}-{number.lower().replace('.', '').replace(' ', '')}-{session[:4]}",
        jurisdiction=state, number=number, title=title, summary=summary, status=status,
        last_action_date=action_date, last_action=action, session=session,
        source_url=url, repository_url=repository, reviewed_at=as_of, summary_reviewed_at=as_of)

federal = [
    bill("US", "H.R. 7390", "SELF DRIVE Act of 2026", "Would create a federal safety framework for ADS-equipped vehicles, including NHTSA authority and manufacturer requirements.", "introduced", "2026-02-05", "Referred to House committees; a subcommittee later forwarded it to the full committee.", "https://www.congress.gov/bill/119th-congress/house-bill/7390", "119th Congress", "https://www.govinfo.gov/app/details/BILLS-119hr7390ih"),
    bill("US", "S. 3742", "AV Safety Data Act", "Would expand incident reporting for certain autonomous vehicles.", "introduced", "2026-01-29", "Referred to Senate Commerce, Science, and Transportation.", "https://www.congress.gov/bill/119th-congress/senate-bill/3742", "119th Congress", "https://www.govinfo.gov/app/details/BILLS-119s3742is"),
    bill("US", "H.R. 10033", "AV Emergency Response Coordination Act", "Would set minimum coordination requirements between AV operators and emergency responders.", "introduced", "2026-08-03", "Referred to House Transportation and Energy and Commerce committees.", "https://www.congress.gov/bill/119th-congress/house-bill/10033", "119th Congress", "https://www.govinfo.gov/app/details/BILLS-119hr10033ih"),
    bill("US", "S. 1798", "Autonomous Vehicle Acceleration Act of 2025", "Would direct federal standards for autonomous vehicles and address NHTSA exemption authority.", "introduced", "2025-05-15", "Referred to Senate Commerce, Science, and Transportation.", "https://www.congress.gov/bill/119th-congress/senate-bill/1798", "119th Congress", "https://www.govinfo.gov/app/details/BILLS-119s1798is"),
    bill("US", "H.R. 4661", "AMERICA DRIVES Act", "Would establish a federal framework for autonomous mobility and related transportation policy.", "introduced", "2025-07-23", "Referred to House Transportation and Infrastructure.", "https://www.congress.gov/bill/119th-congress/house-bill/4661", "119th Congress", "https://www.govinfo.gov/app/details/BILLS-119hr4661ih"),
    bill("US", "H.R. 8692", "Shared Autonomous Mobility Act of 2026", "Would address shared autonomous mobility services and federal transportation programs.", "introduced", "2026-05-07", "Referred to House Transportation and Infrastructure.", "https://www.congress.gov/bill/119th-congress/house-bill/8692", "119th Congress", "https://www.govinfo.gov/app/details/BILLS-119hr8692ih"),
]

# Statuses are the NCSL database's September 15, 2026 state-bill index;
# links open each bill in a bill repository for its detailed action history.
state_bills = [
    bill("CA", "SB 1246", "Autonomous vehicles", "Would require AV manufacturers to maintain remote assistance capacity and broaden emergency responder coordination.", "to_governor", "2026-08-21", "Sent to governor in the NCSL index.", "https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260SB1246"),
    bill("DC", "B 26-0684", "AV deployment authorization", "Would establish a DDOT commercial AV program with permits, safety plans and reporting.", "pending", "2026-05-01", "Referred to Transportation and the Environment Committee.", "https://lims.dccouncil.gov/Legislation/B26-0684"),
    bill("IL", "SB 3308", "Automated Driving Systems Development Act", "Would establish eligibility, permits and review for AV pilot projects.", "pending", "2026-02-03", "Assigned to Senate Assignments Committee in NCSL index.", "https://legiscan.com/IL/bill/SB3308/2025"),
    bill("IL", "SB 3392", "Autonomous Vehicle Pilot Project Act", "Would require a pilot's operational design domain and limit its geographic scope.", "pending", "2026-02-04", "Assigned to Senate Assignments Committee.", "https://legiscan.com/IL/bill/SB3392/2025"),
    bill("IL", "HB 4663", "Autonomous Vehicle Pilot Project Act", "House proposal for AV pilot authorization and operational design domain limits.", "pending", "2026-01-28", "Assigned to House Rules Committee.", "https://legiscan.com/IL/bill/HB4663/2025"),
    bill("IL", "HB 4789", "Automated Driving Systems Development Act", "House proposal for a state AV pilot application and oversight framework.", "pending", "2026-02-02", "Assigned to House Rules Committee.", "https://legiscan.com/IL/bill/HB4789/2025"),
    bill("IL", "HB 5103", "Automated Driving Systems Development Act", "Would establish a state AV pilot program and application process.", "pending", "2026-02-05", "Assigned to House Rules Committee.", "https://legiscan.com/IL/bill/HB5103/2025"),
    bill("IL", "HB 5220", "Autonomous Vehicles Article", "Would set requirements for AV testing on public roads and authorize state rules.", "pending", "2026-02-05", "Assigned to House Rules Committee.", "https://legiscan.com/IL/bill/HB5220/2025"),
    bill("NJ", "A 768", "AV testing on state roadways", "Would permit AV testing and use on New Jersey roads under specified conditions.", "pending", "2026-01-13", "Assembly Science, Innovation and Technology Committee.", "https://www.njleg.state.nj.us/bill-search/2026/A768", "2026-2027"),
    bill("NJ", "A 958", "Law enforcement AV interaction training", "Would require training for law enforcement interactions with AVs.", "pending", "2026-01-13", "Assembly Public Safety and Preparedness Committee.", "https://www.njleg.state.nj.us/bill-search/2026/A958", "2026-2027"),
    bill("NJ", "S 1677", "Fully autonomous vehicle pilot", "Would establish a state pilot program for fully autonomous vehicles.", "pending", "2026-05-11", "Senate Budget and Appropriations Committee.", "https://www.njleg.state.nj.us/bill-search/2026/S1677", "2026-2027"),
    bill("NJ", "A 3968", "Fully autonomous vehicle pilot", "Assembly companion proposal for an AV pilot program.", "pending", "2026-06-01", "Assembly Appropriations Committee.", "https://www.njleg.state.nj.us/bill-search/2026/A3968", "2026-2027"),
    bill("NY", "S 10413", "Autonomous taxi licensing", "Would require NYC Taxi and Limousine Commission licensing before AV taxi or ride-hail service in large cities.", "pending", "2026-05-15", "Senate Transportation Committee.", "https://www.nysenate.gov/legislation/bills/2025/S10413"),
    bill("NY", "A 11500", "Albany-area driverless pilot", "Would allow fully autonomous vehicle operation in Albany and Rensselaer counties for a limited term.", "pending", "2026-05-28", "Assembly Transportation Committee.", "https://assembly.state.ny.us/leg/?bn=A11500&term=2025"),
    bill("PA", "HR 563", "Driverless vehicles study", "Would direct a study of driverless vehicles' safety and workforce effects.", "pending", "2026-06-10", "House Communications and Technology Committee.", "https://www.legis.state.pa.us/cfdocs/billInfo/billInfo.cfm?syear=2025&sind=0&body=H&type=R&bn=563"),
    bill("VA", "SB 670", "Commercial automated driving systems", "Would require licenses and conditions for commercial fully autonomous passenger and freight operation.", "pending_carryover", "2026-02-11", "Carried over in House Transportation Committee.", "https://lis.virginia.gov/bill-details/20261/SB670", "2026"),
]

states = [dict(code=s["code"], name=s["name"], repository_url=ncsl) for s in policy["states"]]
dataset = dict(schema_version="1.0.0", as_of=as_of, state_index_reviewed="2026-09-15",
    methodology="Introduced AV bills, selected by subject relevance. State seed: NCSL 2026 AV legislation database, pending/to-governor records as indexed September 15. Federal seed: 119th Congress bill texts on govinfo. Status may change after the source review; an empty jurisdiction means no pending bill indexed in this snapshot, not a finding that no bill exists. Cross-check the linked legislature before relying on a status. LegiScan API refresh can discover and update current-session bills when configured.",
    source="reviewed snapshot", federal=federal, states=states, state_bills=state_bills)
output = root / "public/data/legislation_tracker.json"
output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n")
print(f"Wrote {len(federal)} federal bills, {len(state_bills)} state bills and {len(states)} jurisdictions")
