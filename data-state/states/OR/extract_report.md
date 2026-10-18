# Oregon extract report

Sessions: 2025R1, 2025S1, 2026R1. Source: OLIS OData API (https://api.oregonlegislature.gov/odata/odataservice.svc/).

- bills: 3773 ({'2025R1': 3466, '2025S1': 3, '2026R1': 304})
- with digest: 3773 (MeasureSummary digest+catchline: 3773)
- with authors: 2733; committee-sponsored (sponsor_committee): 168
- author rows 13320, matched to legislators 13079
- legislators: 93
- bills with floor roll calls: 943; vote records 1985; member vote rows 89492
- bills with history: 3773; actions 31463
- status: {'Died': 2915, 'Chaptered': 778, 'Vetoed': 8, 'Passed': 72}

## Entities used
Measures (RelatingTo, CatchLine, MeasureSummary, CurrentLocation, ChapterNumber, Vetoed), MeasureSponsors, MeasureHistoryActions, MeasureVotes, Legislators, Committees.

## Notes and gaps
- Status is derived: Vetoed flag -> Vetoed; ChapterNumber or enacted location -> Chaptered; location Governor/Secretary of State (adopted resolutions, passed bills) -> Passed; everything else is Died because all three sessions have ended. Oregon does not expose a separate 'failed in committee' flag, so Failed Passage in Committee is not used.
- Votes: MeasureVotes are floor roll calls (all marked floor=true). Committee votes (CommitteeVotes entity) are not included. 'Excused' and any non Aye/Nay value count as abstain.
- Vote result is inferred from the action text. Staff Measure Summary PDFs are not parsed; the digest is the OLIS MeasureSummary field.

## CurrentLocation values

- 1814: In House Committee
- 1074: In Senate Committee
- 777: Chapter Number Assigned
- 73: Filed with Secretary of State
- 12: At Presidents Desk Upon Adjournment
- 6: At House Desk Upon Adjournment
- 3: House - Tabled
- 3: At Senate Desk Upon Adjournment
- 2: In House Committee Awaiting transfer to Desk
- 2: In Senate Committee Awaiting transfer to Desk
- 2: House Desk - Vetoed
- 2: House Desk - Failed
- 2: Senate - Tabled
- 1: Senate Presidents Desk - Awaiting Referral
