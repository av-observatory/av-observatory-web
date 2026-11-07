#!/usr/bin/env python3
"""Test the configured OpenAI editorial API without modifying repository data."""
import json
import os
import runpy
from pathlib import Path

if not os.getenv("OPENAI_API_KEY"):
    raise SystemExit("OPENAI_API_KEY is not configured")
ed=runpy.run_path(str(Path(__file__).with_name("ai-policy-editorial.py")))
result=ed["invoke"]([
    {"role":"system","content":"Respond with JSON {ok:boolean}. No other text."},
    {"role":"user","content":"Return ok=true."}
])
if result.get("ok") is not True:
    raise SystemExit(f"Unexpected OpenAI response: {json.dumps(result)}")
print("OpenAI JSON API probe passed")
