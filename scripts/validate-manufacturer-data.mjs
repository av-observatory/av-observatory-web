import fs from "node:fs";
const data = JSON.parse(fs.readFileSync("public/data/manufacturer_profiles.json", "utf8"));
if (!/^1\./.test(data.schema_version) || !data.profiles || typeof data.profiles !== "object") throw Error("Invalid operator profile schema");
for (const [name, profile] of Object.entries(data.profiles)) {
  for (const field of ["service", "approach", "partnerships", "source"]) if (typeof profile[field] !== "string" || !profile[field]) throw Error(`${name}: missing ${field}`);
  if (!Array.isArray(profile.developments)) throw Error(`${name}: missing developments`);
  for (const item of profile.developments) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !/^https:\/\//.test(item.source) || !item.headline || !item.summary || !item.kind) throw Error(`${name}: incomplete sourced development`);
  }
}
console.log(`Validated ${Object.keys(data.profiles).length} operator profiles`);
