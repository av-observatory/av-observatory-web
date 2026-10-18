# Florida extract report

Generated 2026-10-18 by scripts/extract-fl-legislature.py (workflow extract-fl.yml).

## Counts
- bills/resolutions: 3920  (by session: {'2025': 1959, '2025A': 22, '2025B': 2, '2025C': 7, '2026': 1897, '2026D': 6, '2026E': 22, '2026F': 5})
- by type: {'HB': 1800, 'HCR': 7, 'HJR': 35, 'HM': 7, 'HR': 121, 'SB': 1840, 'SCR': 6, 'SJR': 26, 'SM': 6, 'SPB': 1, 'SR': 71}
- with digest: 3920
- with authors (members): 3917; committee-sponsored: 938
- author rows matched to a legislator id: 8810 of 9739
- bills with floor roll calls: 832 (1596 votes)
- legislators: 171 (12 inactive stubs created from roll calls)
- history rows: 57235
- status: {'Died': 3217, 'Chaptered': 493, 'Vetoed': 21, 'Passed': 189}

## Sources
- Florida Senate site (www.flsenate.gov): session bill lists, bill pages (summary line, sponsors, history, vote links), floor roll-call PDFs (pdftotext).
- Members: flsenate.gov/Senators and flhouse.gov representatives list (2024-2026 term).

## Known gaps / notes
- Digest is the one-sentence bill summary printed on the Senate bill page (subject; summary of the current version). Florida does not publish a longer plain-language digest in a machine-readable feed; staff analysis PDFs exist for some bills but are not ingested.
- No official bulk/API feed was reachable (ftp.flsenate.gov did not connect, leg.state.fl.us/data returned 403, www.flsenate.gov has no data-download page), so everything is scraped from bill pages and roll-call PDFs.
- Only floor roll calls are included (committee vote records are PDFs and were not parsed). Voice votes have no roll call.
- Roll-call members are resolved by chamber+district; inactive stub legislators (id FL:<S|H><district>-<lastname>, empty party) were created where the seat's current member differs from the name printed in the vote (members who left office, e.g. Ingoglia, Collins, Avila).
- Keys use the session code as suffix: (2025), (2026) regular sessions and (2025A)/(2025B)/(2025C)/(2026D)/(2026E)/(2026F) special sessions.
- Sponsors: the bill page prints last names only (with initials only where needed); matched to the member rosters by chamber and last name, ambiguous or departed members stay unmatched (legislator null).
- Status is derived from the action history: Chapter No./Approved by Governor = Chaptered; Vetoed by Governor = Vetoed; enrolled/presented = Passed; Died*/Indefinitely postponed/Withdrawn/Laid on Table = Died; every other bill of an ended session = Died.
- 30 distinct sponsor names unmatched to a member id (e.g. Agriculture, Appropriations, Avila, Banking and Insurance, Boyles, Children, Families, and Elder Affairs, Collins, Commerce and Tourism, Community Affairs, Criminal Justice, Education Postsecondary, Education Pre-K - 12).
