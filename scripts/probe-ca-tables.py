#!/usr/bin/env python3
"""List what California's bulk file (pubinfo zip) holds: members with sizes, and the first rows of the tables we care about."""
import sys, zipfile
from pathlib import Path
sys.path.insert(0, Path(__file__).parent.as_posix())
from bill_enumerators import RangeFile

z = zipfile.ZipFile(RangeFile("https://downloads.leginfo.legislature.ca.gov/pubinfo_2025.zip"))
infos = z.infolist()
print("MEMBERS", len(infos))
for i in sorted(infos, key=lambda i: -i.file_size)[:40]:
    print(f"  {i.file_size:>12,}  {i.filename}")
WANT = ("BILL_TBL", "BILL_VERSION_TBL", "BILL_VERSION_AUTHORS_TBL", "BILL_HISTORY_TBL", "BILL_SUMMARY_VOTE_TBL",
        "BILL_DETAIL_VOTE_TBL", "LEGISLATOR_TBL", "LOCATION_CODE_TBL", "CODES_TBL")
names = {i.filename.rsplit("/", 1)[-1].upper(): i.filename for i in infos}
for want in WANT:
    member = names.get(want + ".DAT")
    if not member:
        print("MISSING", want)
        continue
    print("\n==", want, z.getinfo(member).file_size, "bytes")
    with z.open(member) as fh:
        for n, raw in enumerate(fh):
            if n >= 3:
                break
            print("  ", repr(raw.decode("utf-8", "replace").rstrip("\r\n")[:420]))
