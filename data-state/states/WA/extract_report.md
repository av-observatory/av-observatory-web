# Washington extract report (biennium 2025-26)

- Bills and resolutions: 40 (one record per type and number; version records collapsed)
- By type: {'HB': 21, 'HCR': 1, 'HR': 1, 'SB': 16, 'SR': 1}
- By status: {'Died': 30, 'Chaptered': 8, 'Passed': 2}
- Digest from bill report 'Summary of Bill': 19/40; remainder use the WA long description (digest_source says which)
- Bills with authors: 40/40 (0 author rows without a legislator id); committee-sponsored bills keep sponsor_committee
- Bills with roll calls: 10; vote records: 20 (20 flagged floor)
- History: 40 bills, 395 actions
- Legislators: 159 (5 added from sponsor/vote records, not in the member roster: active=false, no party/district)

## Sources
- LegislationService.asmx: GetLegislationByYear (2025, 2026), GetLegislation, GetLegislativeStatusChangesByBillNumber, GetRollCalls, GetSponsors
- SponsorService.asmx: GetSponsors / GetHouseSponsors / GetSenateSponsors (party, district)
- LegislativeDocumentService.asmx GetDocuments, then House/Senate Bill Report HTML on lawfilesext.leg.wa.gov (Summary of Bill)

## Notes and known gaps
- Status: Chaptered = 'C n L yy' current status (partial vetoes stay Chaptered and the chapter text says so); whole veto = Vetoed; delivered to governor / passed legislature = Passed; everything else is Died because the 2025 and 2026 sessions are over.
- Roll calls: only floor roll calls published by the web service; committee votes are not included. Member names are last names as printed by WA; legislator ids come from the service MemberId.
- Gubernatorial appointments (GA) and initiatives are excluded.

## Raw current-status values (counts)
- C # L #: 8
- H HC/Wellness: 4
- H Approps: 4
- H Local Govt: 2
- H Rules X: 2
- S EL/K-#: 2
- S Rules #: 2
- H Community Safe: 1
- H Rules C: 1
- H Finance: 1
- H State Govt & T: 1
- H ConsPro&Bus: 1
- H Rules #C: 1
- H Adopted: 1
- S State Gov/Trib: 1
- S Health & Long-: 1
- S Law & Justice: 1
- S Housing: 1
- S Ways & Means: 1
- S Rules X: 1
- S Environment, E: 1
- S Ag & Natural R: 1
- S Adopted: 1
