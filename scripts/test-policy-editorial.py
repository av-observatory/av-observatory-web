#!/usr/bin/env python3
"""Network-free tests for bill/full-text retrieval and AI editorial safeguards."""
import os
from pathlib import Path
import runpy
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
import legislation_source_text as source

assert source.looks_like_bill_text(
    {"number":"AB 2193"},
    "ASSEMBLY BILL No. 2193. An act relating to autonomous vehicles and permitting.")
assert not source.looks_like_bill_text(
    {"number":"AB 2193"},
    "Search bills by number or legislative session. Find local legislative updates on this site.")
assert "govinfo.gov/content/pkg/BILLS-119hr7390ih" in list(source.sources(
    {"repository_url":"https://www.govinfo.gov/app/details/BILLS-119hr7390ih",
     "source_url":"https://www.congress.gov/bill/119th-congress/house-bill/7390"},"federal_bill"))[0]

os.environ["OPENAI_API_KEY"]="test-only-key"
mod=runpy.run_path(str(Path(__file__).resolve().parent/"ai-policy-editorial.py"))
assert mod["quality"]({"summary": "The bill would require autonomous vehicle operators to submit collision reports to a state agency within thirty days. It would also establish specified minimum reporting criteria and direct the agency to publish an annual summary of reported safety incidents."})
assert not mod["quality"]({"summary": "An ADS and FMVSS rule."})
assert not mod["status_consistent"]({"status":"introduced"},"federal_bill",{"summary":"The law requires annual reports."})
assert not mod["status_consistent"]({"status":"introduced"},"federal_bill",{"summary":"This act amends the motor vehicle code."})
assert mod["status_consistent"]({"status":"introduced"},"federal_bill",{"summary":"The bill would require annual reports."})
assert mod["status_consistent"]({"status":"introduced"},"federal_bill",{"summary":"The bill would amend Title 49 of the U.S. Code to establish safeguards. It would require reporting."})
assert not mod["status_consistent"]({"status":"introduced"},"federal_bill",{"summary":"The bill would require reporting. Operators submit incident records."})
assert mod["status_consistent"]({"status":"introduced"},"federal_bill",{"summary":"The bill would require reporting. Operators would submit incident records."})

lengthy=("Federal Motor Vehicle Safety Standard No. 208 requires occupant crash protection. "
       +"Additional regulatory background on separate matters. "*800
       +"The amendment to FMVSS No. 201 applies to vehicles without steering controls. ")
focused=mod["select_relevant_excerpt"](lengthy,{"id":"fmvss-201-2022"},"fmvss")
assert "No. 201" in focused and len(focused)<=24000
assert len(mod["select_relevant_excerpt"]("short bill",{"id":"ca-ab-2"},"state_bill"))==10

# Model and source are stubbed. This test exercises both AI passes and metadata.
fn=mod["summarize"]
g=fn.__globals__
g["get_source"]=lambda row,kind: (
    "This bill would require autonomous vehicle operators to report crashes to the "
    "state transportation department within thirty days and require the agency "
    "to publish annual reports. The bill would apply to driverless passenger services.",
    "official_pdf","https://legislature.example.gov/ab21.pdf")
response=[
    {"summary":"The bill would require operators of driverless passenger vehicles to report crashes to the state transportation department within thirty days. The department would then publish annual reports summarizing the incidents, creating a new public reporting obligation for these services.",
     "needs_review":False,"reason":""},
    {"supported":True,"issues":""},
]
calls=[]
def mock_invoke(messages):
    calls.append(messages)
    return response.pop(0)
g["invoke"]=mock_invoke
row={"id":"ca-ab21","status":"introduced","title":"Autonomous vehicles",
     "summary":"Unreviewed","takeaway":"Unreviewed"}
assert fn(row,"state_bill")=="updated"
assert row["editorial_status"]=="verified"
assert row["summary_quality"]=="verified"
assert row["summary_method"]=="ai_verified_primary_source"
assert len(calls)==2
assert fn(row,"state_bill")=="cached"
assert len(calls)==2
print("Policy editorial and primary-text tests passed.")
