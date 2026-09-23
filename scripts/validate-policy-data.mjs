import fs from "node:fs";
const data = JSON.parse(fs.readFileSync("public/data/policy_tracker.json", "utf8"));
if (data.schema_version !== "1.1.0" || data.states.length !== 51) throw Error("Invalid policy dataset version or state coverage");
const unique = new Set(data.states.map(s => s.code));
if (unique.size !== 51 || !unique.has("MA") || !unique.has("DC")) throw Error("Duplicate or missing jurisdictions");
const all = [...data.federal, ...data.federal_oversight, ...data.state_events, ...data.city_events];
if (new Set(all.map(e => e.id)).size !== all.length) throw Error("Duplicate policy event IDs");
for (const item of all) {
  if (!item.title || !item.summary || !item.takeaway || !item.status || !item.instrument || !item.verified_at || !/^https:\/\//.test(item.source_url)) throw Error(`Incomplete policy event: ${item.id}`);
  if (item.date && !/^\d{4}(-\d{2}-\d{2})?$/.test(item.date)) throw Error(`Invalid date: ${item.id}`);
}
for (const state of data.states) {
  if (!state.analysis || !/^https:\/\//.test(state.source_url)) throw Error(`Incomplete state: ${state.code}`);
}
if (data.state_events.some(e => e.state === "MA" && e.title.includes("572") && e.status !== "rescinded")) throw Error("Massachusetts EO 572 must be rescinded");
for (const rule of data.federal.filter(e => e.fmvss?.length && e.id !== "fmvss-2020-nprm")) {
  if (rule.status === "under_review" && !rule.comment_deadline) throw Error(`Missing comment deadline: ${rule.id}`);
  if (rule.status === "effective" && !rule.effective_date) throw Error(`Missing effective date: ${rule.id}`);
}
const occupant = data.federal.find(e => e.id === "fmvss-2022-final");
const amended = ["201", "203", "204", "205", "206", "207", "208", "212", "214", "216a", "219", "225", "226"];
if (JSON.stringify(occupant?.fmvss) !== JSON.stringify(amended)) throw Error("2022 ADS final rule must index all 13 amended numbered standards");
for (const number of amended) {
  const child = data.federal.find(e => e.id === `fmvss-${number}-2022`);
  if (child?.rulemaking_id !== occupant.id || JSON.stringify(child.fmvss) !== JSON.stringify([number])) throw Error(`FMVSS ${number} must have its own indexed entry`);
}
const steering = data.federal.find(e => e.id === "fmvss-204-2026");
if (steering?.takeaway !== "Exempts FMVSS 208-certified vehicles from the steering-column displacement test") throw Error("FMVSS 204 takeaway must describe the limited exemption");
if (steering?.effective_date !== "2026-07-06" || steering?.status !== "effective" || steering?.scope !== "related vehicle design") throw Error("2026 FMVSS 204 final rule missing or misclassified");
console.log(`Validated ${data.states.length} jurisdictions and ${all.length} policy events`);
