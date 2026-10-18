# Massachusetts (194th General Court, 2025-26) extract report

- bills: 400 (400 House, 0 Senate)
- with pinslip digest: 385; title-only digest: 15
- with authors: 397; committee-sponsored (sponsor_committee): 2
- legislators: 204
- bills with votes: 2 (15 votes; 2 with member-level rolls)
- bills with history: 400
- status: Chaptered 3, Died 154, In Committee Process 46, In Floor Process 197

## Sources
- malegislature.gov JSON API (Documents, DocumentHistoryActions, LegislativeMembers, Branches/Senate/RollCalls).

## Known gaps
- 2977 docket-only filings without a bill number are not included (they receive numbers after the filing deadline).
- House roll calls are published only as PDFs ("YEA and NAY No. N"); House votes carry the tally parsed from the history action text and empty `members`. Senate roll calls linked to a bill have member-level votes.
- Committee votes are not included. Digest is the official Pinslip where one exists; otherwise the title.
- Status is derived from history action text; most filings die quietly in committee and stay 'In Committee Process' while the 194th session runs to January 2027.
- No fetch failures.
