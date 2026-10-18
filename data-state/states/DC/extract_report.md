# DC Council extract report (Council Period 26, 2025-26)

- Bills + proposed resolutions: 1677 (856 bills B26-, 821 resolutions PR26-)
- With a published LIMS summary (digest): 438/1677; remaining digests fall back to the title
- With authors: 1677/1677; with sponsor_committee/requestor only: 0
- Bills with recorded votes: 1061 (1836 votes, 1443 floor roll calls)
- Legislators: 15 (active 14)

## Status (normalized)

- Chaptered: 1127
- In Committee Process: 368
- Died: 89
- In Floor Process: 63
- Passed: 30

## Status (LIMS raw)

- Approved: 528
- Under Council Review: 431
- Enacted: 231
- Official Law: 189
- Deemed Approved: 179
- Withdrawn: 79
- Under Mayoral Review: 30
- Postponed Indefinitely: 7
- Deemed Disapproved: 2
- Failed: 1

## Sources

- LIMS public JSON used by the LIMS web app: POST /api/Search/SearchResult (list), GET /api/Search/GetLegislationDetails/<number> (record, history, sponsors, council roll calls, committee mark-up tallies).
- The documented /api/v2/PublicData/* API requires an access token and was not used.

## Mapping notes

- Introduced by -> LEAD_AUTHOR; Co-Introduced by -> COAUTHOR. Executive-requested measures carry no introducer; the requestor text is kept in sponsor_committee/requested_by.
- Adopted/approved/deemed-approved resolutions are mapped to status 'Chaptered' (chapter 'Resolution NN-N'); Acts/Laws use 'D.C. Act NN-N' / 'D.C. Law NN-N'.
- 'Under Council Review' is refined from history: council first/final reading -> In Floor Process; referral/hearing/mark-up -> In Committee Process; else Pending Referral.
- Votes: each council meeting action (first/final reading, etc.) with a vote is a floor vote; voice votes list every member as recorded (Yes). Committee mark-ups carry tallies only (no member list).
- Member party and ward come from a hardcoded table (LIMS exposes neither); unknown members are left blank.
- DC has no state legislative districts; district is Ward N / At-Large / Chairman.

## Known gaps

- no fetch failures
- Digest = LIMS 'BILL SUMMARY' text where the Council published one; many bills (and most resolutions) have none, so the title is used.
- Committee reports/abstracts are PDFs and not read.
