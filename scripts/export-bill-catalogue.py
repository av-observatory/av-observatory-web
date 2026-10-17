#!/usr/bin/env python3
"""Merge every state's bill ledger into one gzipped JSONL catalogue (one bill per line) and copy it to R2.

The catalogue is the durable copy of all enumerated bills, AV or not, kept for future non-AV analysis.
Without R2 configuration it writes the file locally and exits 0.
"""
import gzip, json, os, subprocess, sys
from datetime import date
from pathlib import Path

LEDGERS = Path("data-state/bill_ledger")
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "bill_catalogue.jsonl.gz")


def rows():
    for path in sorted(LEDGERS.glob("*.json")):
        state = path.stem
        for key, bill in json.loads(path.read_text()).get("bills", {}).items():
            session, _, number = key.partition(":")
            yield {"state": state, "session": session, "number": number, **bill}


def main():
    count = 0
    with gzip.open(OUT, "wt", encoding="utf-8") as fh:
        for row in rows():
            fh.write(json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n")
            count += 1
    print(f"catalogue: {count} bills, {OUT.stat().st_size / 1e6:.1f} MB -> {OUT}")
    env = {k: os.environ.get(k, "") for k in ("R2_BUCKET", "R2_ACCOUNT_ID", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")}
    if not all(env.values()):
        print("::warning::R2 not configured; catalogue left in the workspace only")
        return
    for key in ("bill-catalogue/latest.jsonl.gz", f"bill-catalogue/{date.today().isoformat()}.jsonl.gz"):
        subprocess.run(["aws", "s3", "cp", str(OUT), f"s3://{env['R2_BUCKET']}/{key}", "--content-type", "application/gzip",
                        "--cache-control", "private, no-store",
                        "--endpoint-url", f"https://{env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"], check=True)
        print(f"uploaded {key}")


if __name__ == "__main__":
    main()
