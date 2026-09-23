export type Development = { date: string; headline: string; summary: string; source: string; publisher: string; kind: "announcement" | "filing" | "activity evidence" | "regulatory action" | "media" };
export type CompanyProfile = { slug: string; name: string; service: string; approach: string; partnerships: string; source: string; developments: Development[] };

import data from "../../public/data/manufacturer_profiles.json";

export const profiles: Record<string, Omit<CompanyProfile,"slug"|"name">> = data.profiles as Record<string, Omit<CompanyProfile,"slug"|"name">>;

const modeLabel: Record<string,string> = { ridehail: "Passenger ridehail", shuttle: "Passenger shuttle", freight: "Freight transport", passenger: "Passenger service" };
export function companySlug(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
export function buildProfiles(locations: {company:string; mode:string; market:string; state:string; source_url:string; source_date?:string}[]): CompanyProfile[] {
  const groups = new Map<string, typeof locations>();
  for (const row of locations) groups.set(row.company, [...(groups.get(row.company) ?? []), row]);
  return Array.from(groups, ([name, rows]) => {
    const modes = Array.from(new Set(rows.map(r => modeLabel[r.mode] ?? r.mode))).join(" and ").toLowerCase();
    const c = profiles[name];
    const evidence = Array.from(new Map(rows.filter(r => r.source_url && r.source_date).map(r => [`${r.source_url}|${r.market}`, r])).values()).map(r => ({
      date: r.source_date!, headline: `Activity evidence: ${r.market}, ${r.state}`, summary: `The Observatory records ${name}'s ${r.mode} activity in this market, based on the linked source. The date is the source or verification date, not necessarily the service launch date.`, source: r.source_url, publisher: "Operating record", kind: "activity evidence" as const,
    }));
    return { slug: companySlug(name), name, service: c?.service ?? `${modes.charAt(0).toUpperCase()+modes.slice(1)} documented in the Observatory's current U.S. activity records.`, approach: c?.approach ?? "Service geography and operating conditions vary by market; examine the linked activity evidence for scope.", partnerships: c?.partnerships ?? "Partnerships have not yet been independently documented in this profile.", source: c?.source ?? rows.find(r => r.source_url)?.source_url ?? "", developments: [...(c?.developments ?? []), ...evidence] };
  }).sort((a,b) => a.name.localeCompare(b.name));
}
