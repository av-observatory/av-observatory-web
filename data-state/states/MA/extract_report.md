# Massachusetts (194th General Court, 2025-26) extract report

- bills: 8980 (5694 House, 3286 Senate)
- with pinslip digest: 8187; title-only digest: 793
- with authors: 8498; committee-sponsored (sponsor_committee): 1161
- legislators: 204
- bills with votes: 171 (508 votes; 237 with member-level rolls)
- bills with history: 8980
- status: Chaptered 338, Died 4150, Failed Passage in Committee 19, In Committee Process 3533, In Floor Process 919, Passed 21

## Sources
- malegislature.gov JSON API (Documents, DocumentHistoryActions, LegislativeMembers, Branches/Senate/RollCalls).

## Known gaps
- Docket-only filings without a bill number (about 2,977 in the Documents list) are not included; they receive numbers after the filing deadline.
- House roll calls are published only as PDFs ("YEA and NAY No. N"); House votes carry the tally parsed from the history action text and empty `members`. Senate roll calls linked to a bill have member-level votes.
- Committee votes are not included. Digest is the official Pinslip where one exists; otherwise the title.
- Status is derived from history action text; most filings die quietly in committee and stay 'In Committee Process' while the 194th session runs to January 2027. 'Died' = study order, new draft, placed on file, withdrawn; 'Failed Passage in Committee' = reported adversely.
- Sponsors that are not legislators (Governor, Treasurer, agencies, private petitioners) have legislator null.
