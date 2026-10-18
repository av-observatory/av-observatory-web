#!/usr/bin/env python3
"""Carry California tags from taxonomy v1.0 to v1.1 without re-asking the model where the meaning did not change.

Per old sub-topic: K = same meaning (rename or merge on the same axis): move the tag, keep its direction;
N = the new sub-topic has no direction (funding-only or none): move the tag, direction becomes not_applicable;
R = the meaning changed (axis changed or the sub-topic was split): the whole bill is left out so the tagger redoes it.
Usage: migrate-tags-v11.py <old tags.json> <old taxonomy.json> <out tags.json>
"""
import importlib.util, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
old_tags, old_tax, out_path = (Path(a) for a in sys.argv[1:4])
new_tax = json.loads((ROOT / "data-state/taxonomy/taxonomy.json").read_text())
NEW = {s["id"]: dict(s, topic=t["name"]) for t in new_tax["topics"] for s in t["subtopics"]}
BY_NAME = {s["name"]: sid for sid, s in NEW.items()}
OLD = {s["id"]: s["name"] for t in json.loads(old_tax.read_text())["topics"] for s in t["subtopics"]}

# old name (prefix) -> (new name, mode); everything else maps to the identical new name with mode K
OVERRIDE = {
    "Firearm ownership and carry": ("Carry and ownership, including public places and schools", "K"),
    "Background checks and licensing": ("Purchase, licensing and dealers", "K"),
    "Dealers, ammunition and manufacturing": ("Purchase, licensing and dealers", "K"),
    "Safe storage and child access": ("Safe storage and extreme-risk orders", "K"),
    "Extreme risk protection orders": ("Safe storage and extreme-risk orders", "K"),
    "Firearms in schools and public places": ("Carry and ownership, including public places and schools", "R"),
    "Weapon and magazine types": ("Weapon and magazine types", "K"),
    "Long-term care and disability services": ("Long-term care and disability services", "N"),
    "Child welfare and foster care": ("Child welfare and foster care", "N"),
    "Paid family leave and family benefits": ("Worker benefits (paid leave, unemployment insurance)", "K"),
    "Paid leave and benefits": ("Worker benefits (paid leave, unemployment insurance)", "K"),
    "Unemployment insurance": ("Worker benefits (paid leave, unemployment insurance)", "K"),
    "Zoning and land use": ("Zoning, land use and short-term rentals", "K"),
    "Short-term rentals": ("Zoning, land use and short-term rentals", "K"),
    "Cybersecurity": ("Data privacy and security", "K"),
    "Data privacy": ("Data privacy and security", "K"),
    "Higher education (tuition, tenure, DEI)": ("Campus policy (speech, DEI, tenure)", "R"),
    "School safety and discipline": ("School safety, discipline and phones", "K"),
    "Phones and technology in schools": ("School safety, discipline and phones", "K"),
    "Ballot measures and initiatives": ("State constitution and ballot measures", "N"),
    "Constitutional amendments and resolutions": ("State constitution and ballot measures", "K"),
    "Renewable energy and storage": ("Clean energy (renewables, storage, nuclear)", "K"),
    "Nuclear power": ("Clean energy (renewables, storage, nuclear)", "K"),
    "Bail and pretrial": ("Bail, pretrial and courts", "K"),
    "Courts and procedure": ("Bail, pretrial and courts", "R"),
    "State cooperation with federal enforcement": ("State cooperation with federal enforcement, including employment verification", "K"),
    "Employment verification": ("State cooperation with federal enforcement, including employment verification", "K"),
    "Benefits and services for immigrants": ("Benefits, education and services for immigrants", "K"),
    "In-state tuition and education access": ("Benefits, education and services for immigrants", "K"),
    "Anti-discrimination protections": ("Anti-discrimination protections, including DEI programs", "K"),
    "Diversity, equity and inclusion programs": ("Anti-discrimination protections, including DEI programs", "R"),
    "Religious liberty": ("Speech and religion", "K"),
    "Free speech and assembly": ("Speech and religion", "K"),
    "Agriculture and food": ("Food and agriculture", "N"),
    "State agencies and structure": ("State agencies and programs", "K"),
    "Local government powers and preemption": ("Local control and preemption", "K"),
    "Emergency powers": ("Emergency powers", "N"),
}


def target(old_name):
    for prefix, (new_name, mode) in OVERRIDE.items():
        if old_name.startswith(prefix):
            return BY_NAME[new_name], mode
    base = old_name.split(" (")[0]
    for name, sid in BY_NAME.items():
        if name == old_name or name.split(" (")[0] == base:
            return sid, "K"
    return None, "R"


spec = importlib.util.spec_from_file_location("tagger", ROOT / "scripts/tag-bills-taxonomy.py")
tagger = importlib.util.module_from_spec(spec)
import os
os.environ.setdefault("ANTHROPIC_API_KEY", "x")
spec.loader.exec_module(tagger)
tagger.MODEL = "claude-haiku-5-5"
bills = json.loads((ROOT / "data-state/states/CA/bills.json").read_text())
old = json.loads(old_tags.read_text())["bills"]
rank = {"high": 0, "medium": 1, "low": 2}
result, redo, moved, na = {}, [], 0, 0
for k, v in old.items():
    tags, need = [], False
    for t in v.get("tags", []):
        sid, mode = target(OLD.get(t["subtopic"], ""))
        if mode == "R" or sid is None:
            need = True
            break
        t = dict(t, subtopic=sid, topic=NEW[sid]["topic"])
        if mode == "N" or NEW[sid]["axis"] in ("F", "N"):
            if t["direction"] != "not_applicable":
                t["direction"] = "not_applicable"
                na += 1
        tags.append(t)
    if need:
        redo.append(k)
        continue
    merged = {}
    for t in tags:  # two old sub-topics can land on one new one: keep the more confident call
        cur = merged.get(t["subtopic"])
        if cur is None or rank[t["confidence"]] < rank[cur["confidence"]] or (cur["direction"] == "unclear" and t["direction"] != "unclear"):
            merged[t["subtopic"]] = t
    entry = dict(v, tags=list(merged.values()), migrated_from="taxonomy 1.0 / prompt r2")
    entry["hash"] = tagger.bill_hash(bills[k])
    result[k] = entry
    moved += 1
out_path.write_text(json.dumps({"model": "claude-haiku-5-5", "taxonomy": new_tax["version"], "prompt_rev": tagger.PROMPT_REV, "bills": result},
                                sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n")
print(f"{len(old)} bills: {moved} carried over (directions cleared on {na} tags that are now funding-only or no-direction), {len(redo)} need the model again")
