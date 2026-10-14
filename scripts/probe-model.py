#!/usr/bin/env python3
"""Make one classification request exactly like refresh-policy.py and print the full error, if any."""
import importlib.util
import json
import sys
from pathlib import Path

import anthropic

spec = importlib.util.spec_from_file_location("rp", Path(__file__).resolve().parent / "refresh-policy.py")
rp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rp)
client = anthropic.Anthropic()
cand = {"kind": "new", "level": "state", "source_url": "https://example.gov/x",
        "text": "The Governor signed the autonomous vehicle bill into law on March 3, 2026.", "label": "probe"}
variants = {
    "as-in-script (effort + format)": dict(output_config={"effort": "medium", "format": {"type": "json_schema", "schema": rp.SCHEMA}}),
    "format only": dict(output_config={"format": {"type": "json_schema", "schema": rp.SCHEMA}}),
    "no output_config (prompt for JSON)": dict(),
}
for name, extra in variants.items():
    try:
        r = client.messages.create(model=rp.MODEL, max_tokens=2000, system=rp.SYSTEM,
                                   messages=[{"role": "user", "content": "Classify:\n" + cand["text"]}], **extra)
        print(f"OK   {name}: stop={r.stop_reason} blocks={[b.type for b in r.content]}")
    except anthropic.APIStatusError as exc:
        print(f"FAIL {name}: HTTP {exc.status_code}: {exc.message}")
        print("     body:", json.dumps(getattr(exc, 'body', None))[:600])
