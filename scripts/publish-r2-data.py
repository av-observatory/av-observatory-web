#!/usr/bin/env python3
"""Validate and publish machine-readable site data to R2 with immutable snapshots."""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public/data"
MIME = {".json": "application/json", ".geojson": "application/geo+json", ".csv": "text/csv"}


def inventory(directory):
    files = sorted(p for p in directory.iterdir() if p.is_file())
    if not files or any(p.suffix not in MIME for p in files):
        raise ValueError("Only JSON, GeoJSON and CSV data files may be published")
    entries = []
    for path in files:
        if path.suffix in (".json", ".geojson"):
            data = json.loads(path.read_text(encoding="utf-8"))
            if path.suffix == ".geojson" and (data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list)):
                raise ValueError(f"Invalid GeoJSON FeatureCollection: {path}")
        else:
            with path.open(newline="", encoding="utf-8-sig") as f:
                if not csv.reader(f).__next__():
                    raise ValueError(f"CSV has no header: {path}")
        content = path.read_bytes()
        entries.append({"name": path.name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(), "content_type": MIME[path.suffix]})
    return entries


def aws(*args):
    result = subprocess.run(["aws", *args, "--endpoint-url", f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"R2 operation failed: {result.stderr.strip()}")
    return result.stdout


def head(bucket, key):
    result = subprocess.run(["aws", "s3api", "head-object", "--bucket", bucket, "--key", key,
        "--endpoint-url", f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"], capture_output=True, text=True)
    if result.returncode:
        if "404" in result.stderr or "Not Found" in result.stderr:
            return None
        raise RuntimeError(f"Cannot check R2 object {key}: {result.stderr.strip()}")
    return json.loads(result.stdout)


def put(bucket, key, path, entry, immutable=False, cache="public, max-age=300"):
    previous = head(bucket, key) if immutable else None
    if previous:
        verify(previous, entry, bucket, key)
        return
    aws("s3", "cp", str(path), f"s3://{bucket}/{key}", "--content-type", entry["content_type"],
        "--cache-control", cache, "--metadata", f"sha256={entry['sha256']}")
    verify(head(bucket, key), entry, bucket, key)


def verify(actual, expected, bucket, key):
    if not actual or actual.get("ContentLength") != expected["bytes"] or actual.get("Metadata", {}).get("sha256") != expected["sha256"]:
        raise RuntimeError(f"R2 object failed size/checksum metadata verification: {key}")
    response = subprocess.run(["aws", "s3", "cp", f"s3://{bucket}/{key}", "-", "--endpoint-url",
        f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"], capture_output=True)
    if response.returncode or hashlib.sha256(response.stdout).hexdigest() != expected["sha256"]:
        raise RuntimeError(f"R2 object failed downloaded SHA-256 verification: {key}")


def manifest_entry(path):
    content = path.read_bytes()
    return {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(), "content_type": "application/json"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("site", "legislation"))
    parser.add_argument("--file", type=Path, help="Refreshed bill JSON for legislation mode")
    parser.add_argument("--revision", help="Full Git commit SHA for site mode")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print manifest without contacting R2")
    args = parser.parse_args()
    if args.mode == "site":
        if not args.revision or len(args.revision) < 12 or not all(c in "0123456789abcdef" for c in args.revision):
            parser.error("site mode requires a full Git commit SHA")
        files = inventory(DATA)
        commit_time = subprocess.run(["git", "show", "-s", "--format=%cI", args.revision],
            cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        manifest = {"schema_version": "1.0.0", "kind": "site_snapshot", "revision": args.revision,
            "created_at": commit_time, "files": files,
            "note": "Site snapshot; the separate daily legislation feed may be more recent."}
        prefix = f"backups/site/{args.revision}"
    else:
        if not args.file:
            parser.error("legislation mode requires --file")
        record = json.loads(args.file.read_text(encoding="utf-8"))
        if not isinstance(record, dict) or not isinstance(record.get("federal"), list) or not isinstance(record.get("state_bills"), list):
            raise ValueError("Invalid legislative feed")
        content = args.file.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        files = [{"name": "legislation_tracker.json", "bytes": len(content), "sha256": digest, "content_type": "application/json"}]
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        manifest = {"schema_version": "1.0.0", "kind": "legislation_refresh", "created_at": datetime.now(timezone.utc).isoformat(), "files": files}
        prefix = f"backups/legislation/{stamp}-{digest[:12]}"
    print(json.dumps({"prefix": prefix, "manifest": manifest}, indent=2))
    if args.dry_run:
        return
    for key in ("R2_ACCOUNT_ID", "R2_BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
        if not os.environ.get(key):
            raise RuntimeError(f"Missing R2 configuration: {key}")
    bucket = os.environ["R2_BUCKET"]
    with tempfile.TemporaryDirectory() as tmp:
        manifest_path = Path(tmp) / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        for entry in files:
            source = DATA / entry["name"] if args.mode == "site" else args.file
            put(bucket, f"{prefix}/{entry['name']}", source, entry, immutable=True, cache="public, max-age=31536000, immutable")
        put(bucket, f"{prefix}/manifest.json", manifest_path, manifest_entry(manifest_path), immutable=True, cache="public, max-age=31536000, immutable")
        if args.mode == "site":
            for entry in files:
                put(bucket, f"data/{entry['name']}", DATA / entry["name"], entry)
            put(bucket, "policy/policy_tracker.json", DATA / "policy_tracker.json", next(x for x in files if x["name"] == "policy_tracker.json"))
            # A daily refresh owns this legacy key. Seed only if there is no live index yet.
            if head(bucket, "policy/legislation_tracker.json") is None:
                entry = next(x for x in files if x["name"] == "legislation_tracker.json")
                put(bucket, "policy/legislation_tracker.json", DATA / entry["name"], entry)
            put(bucket, "backups/site/latest.json", manifest_path, manifest_entry(manifest_path))
        else:
            put(bucket, "policy/legislation_tracker.json", args.file, files[0])
            put(bucket, "backups/legislation/latest.json", manifest_path, manifest_entry(manifest_path))
    print(f"Verified R2 snapshot: {prefix}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError, json.JSONDecodeError) as error:
        sys.exit(str(error))
