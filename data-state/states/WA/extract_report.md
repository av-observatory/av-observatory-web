# Washington extract report (biennium 2025-26)

- Bills and resolutions: 3411 (one record per type and number; version records collapsed)
- By type: {'HB': 1748, 'HJM': 18, 'HJR': 14, 'HCR': 9, 'HR': 115, 'SB': 1363, 'SJM': 17, 'SJR': 13, 'SCR': 11, 'SR': 103}
- By status: {'Died': 2484, 'Chaptered': 690, 'Vetoed': 1, 'Passed': 236}
- Digest from bill report 'Summary of Bill': 1970/3411; remainder use the WA long description (digest_source says which)
- Bills with authors: 2808/3411 (0 author rows without a legislator id); committee-sponsored bills keep sponsor_committee
- Bills with roll calls: 953; vote records: 2304 (2049 flagged floor)
- History: 3411 bills, 37589 actions
- Legislators: 154 (0 added from sponsor/vote records, not in the member roster: active=false, no party/district)

## Sources
- LegislationService.asmx: GetLegislationByYear (2025, 2026), GetLegislation, GetLegislativeStatusChangesByBillNumber, GetRollCalls, GetSponsors
- SponsorService.asmx: GetSponsors / GetHouseSponsors / GetSenateSponsors (party, district)
- LegislativeDocumentService.asmx GetDocuments, then House/Senate Bill Report HTML on lawfilesext.leg.wa.gov (Summary of Bill)

## Notes and known gaps
- Status: Chaptered = 'C n L yy' current status (partial vetoes stay Chaptered and the chapter text says so); whole veto = Vetoed; delivered to governor / passed legislature = Passed; everything else is Died because the 2025 and 2026 sessions are over.
- Roll calls: only floor roll calls published by the web service; committee votes are not included. Member names are last names as printed by WA; legislator ids come from the service MemberId.
- Gubernatorial appointments (GA) and initiatives are excluded.

## Raw current-status values (counts)
- C # L #: 690
- S Ways & Means: 257
- H Approps: 231
- S Rules X: 197
- H Finance: 148
- H Rules X: 118
- S Rules #: 114
- H Adopted: 113
- S Adopted: 103
- H Rules R: 91
- H HC/Wellness: 84
- S Law & Justice: 82
- H Community Safe: 68
- H Civil R & Judi: 61
- S State Gov/Trib: 58
- H State Govt & T: 56
- H ConsPro&Bus: 55
- H Env & Energy: 50
- H Rules #C: 49
- H Education: 49
- S EL/K-#: 49
- H EL & Human Svc: 48
- H Transportation: 46
- H Local Govt: 45
- S Human Services: 42
- S Environment, E: 41
- S Labor & Comm: 41
- S Health & Long-: 39
- S Transportation: 36
- H Labor & Workpl: 35
- H Ag&Nr: 28
- S Housing: 27
- H Postsec Ed & W: 25
- S Loc Gov: 24
- H Housing: 23
- S Ag & Natural R: 19
- H Cap Budget: 18
- H Community Safet: 16
- S Higher Ed & Wo: 16
- H Tech, Econ Dev: 13
- H State Govt & Tr: 12
- S Health & Long-T: 12
- S Environment, En: 11
- S Filed Sec/St: 11
- H Rules C: 10
- S Business, Trade: 10
- H Postsec Ed & Wk: 9
- H Filed Sec/St: 8
- S Ag & Natural Re: 7
- S Business, Trad: 5
- S Higher Ed & Wor: 3
- S Passed #rd: 2
- H Introduced: 2
- Gov vetoed: 1
- H Labor & Workpla: 1
- S insists: 1
- S Held: 1
