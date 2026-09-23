import fs from "node:fs";
const data = JSON.parse(fs.readFileSync(process.argv[2] ?? "public/data/legislation_tracker.json", "utf8"));
if (data.schema_version !== "1.1.0" || data.states.length !== 51 || new Set(data.states.map(s => s.code)).size !== 51) throw Error("Invalid jurisdiction coverage");
const stages = new Set(["introduced", "committee", "floor", "passed_legislature", "executive", "law"]);
for (const bill of [...data.federal, ...data.state_bills]) {
  if (!["bill", "resolution"].includes(bill.measure_type)) throw Error(`Missing measure type: ${bill.id}`);
  if (!stages.has(bill.progress_stage) || !Array.isArray(bill.hearings) || !bill.stage_dates || typeof bill.stage_dates !== "object") throw Error(`Missing process data: ${bill.id}`);
  for (const [stage, date] of Object.entries(bill.stage_dates)) if (!stages.has(stage) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error(`Invalid stage date: ${bill.id}`);
  for (const hearing of bill.hearings) if (!/^\d{4}-\d{2}-\d{2}$/.test(hearing.date) || !/^https:\/\//.test(hearing.source_url)) throw Error(`Invalid hearing: ${bill.id}`);
  if (!bill.id || !bill.number || !bill.summary || !bill.takeaway || !bill.title || !bill.status || !/^https:\/\//.test(bill.source_url) || !/^\d{4}-\d{2}-\d{2}$/.test(bill.last_action_date)) throw Error(`Incomplete bill ${bill.id}`);
}
if (new Set([...data.federal, ...data.state_bills].map(b => b.id)).size !== data.federal.length + data.state_bills.length) throw Error("Duplicate bill IDs");
console.log(`Validated ${data.federal.length} federal and ${data.state_bills.length} state bills`);
