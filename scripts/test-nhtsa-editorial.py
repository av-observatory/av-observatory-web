#!/usr/bin/env python3
"""Regression tests for every NHTSA editorial card produced by refresh."""
import json
from pathlib import Path
from nhtsa_editorial import editorial_brief,validate_summary
DATA=Path(__file__).resolve().parents[1]/"public"/"data"
samples=[
  ("investigation","Automated Driving System (ADS) conflict avoidance, driving behavior competence and assertiveness",
  "The Office of Defects Investigation (ODI) has received several reports of crashes involving automated vehicles (AVs). The crashes occurred in Dallas, Texas and Austin, Texas. The ADS performance in these crashes may indicate inappropriate assertiveness. "+"Report IDs and further regulatory language. "*130),
  ("recall","ADS braking near motorcycles",
  "The manufacturer reports that ADS software could brake unexpectedly around motorcycles. "+"Additional technical background. "*120)
]
for kind,subject,source in samples:
    brief=editorial_brief(kind,subject,source,"Avride")
    assert validate_summary(brief),(kind,brief)
    assert len(brief)<380
    assert not any(acronym in brief.split() for acronym in ("ADS","ODI","AVs","FMVSS"))
for filename,key in (("nhtsa_investigations.json","investigations"),("nhtsa_av_recalls.json","recalls")):
    rows=json.loads((DATA/filename).read_text(encoding="utf-8"))[key]
    for row in rows:
        assert validate_summary(row["summary"]),(filename,row["id"])
    print(f"Validated {len(rows)} {key} for editorial summary quality")
