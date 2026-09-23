import fs from "node:fs";
const data = JSON.parse(fs.readFileSync(process.argv[2] ?? "public/data/legislation_tracker.json", "utf8"));
if (data.schema_version !== "1.0.0" || data.states.length !== 51 || new Set(data.states.map(s => s.code)).size !== 51) throw Error("Invalid jurisdiction coverage");
for (const bill of [...data.federal, ...data.state_bills]) {
  if (!bill.id || !bill.number || !bill.summary || !bill.title || !bill.status || !/^https:\/\//.test(bill.source_url) || !/^\d{4}-\d{2}-\d{2}$/.test(bill.last_action_date)) throw Error(`Incomplete bill ${bill.id}`);
}
if (new Set([...data.federal, ...data.state_bills].map(b => b.id)).size !== data.federal.length + data.state_bills.length) throw Error("Duplicate bill IDs");
console.log(`Validated ${data.federal.length} federal and ${data.state_bills.length} state bills`);
