import fs from "node:fs";
const data = JSON.parse(fs.readFileSync("public/data/policy_tracker.json", "utf8"));
if (data.schema_version !== "1.1.0" || data.states.length !== 51) throw Error("Invalid policy dataset version or state coverage");
const unique = new Set(data.states.map(s => s.code));
if (unique.size !== 51 || !unique.has("MA") || !unique.has("DC")) throw Error("Duplicate or missing jurisdictions");
const all = [...data.federal, ...data.federal_oversight, ...data.state_events, ...data.city_events];
if (new Set(all.map(e => e.id)).size !== all.length) throw Error("Duplicate policy event IDs");
for (const item of all) {
  if (!item.title || !item.summary || !item.status || !item.instrument || !item.verified_at || !/^https:\/\//.test(item.source_url)) throw Error(`Incomplete policy event: ${item.id}`);
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
console.log(`Validated ${data.states.length} jurisdictions and ${all.length} policy events`);
