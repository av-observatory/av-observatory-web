#!/usr/bin/env python3
"""Compatibility entry point for the AV Observatory legislation builder.

State legislation is built from the Open States API v3 national discovery
pipeline in scripts/refresh-legislation.py. This wrapper exists only for older
local workflows that still call build-legislation-data.py.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
target = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "public/data/legislation_tracker.json")
cmd = [sys.executable, str(ROOT / "scripts/refresh-legislation.py"), target]
raise SystemExit(subprocess.call(cmd, env=os.environ.copy()))
