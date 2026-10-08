import { promises as fs } from "fs";
import path from "path";
import { StatTile } from "@/components/StatTile";
import { EuropeCrashTracker, type EuropeCrashIncident, type EuropeCountry } from "@/components/EuCrashTracker";

type UnresolvedLead = {
  lead_id:string;
  country:string;
  city:string;
  period:string;
  operator:string;
  manufacturer:string;
  vehicle:string;
  status:string;
  finding:string;
  sources:string[];
};

type ReportingOption = {
  source:string;
  scope:string;
  access:string;
  usefulness:string;
  notes:string;
  url:string;
};

type EuropeCrashDataset = {
  dataset:string;
  updated_at:string;
  status:string;
  methodology:string;
  limitations:string;
  incidents:EuropeCrashIncident[];
  countries:EuropeCountry[];
  unresolved_leads:UnresolvedLead[];
  reporting_options:ReportingOption[];
};

async function loadData():Promise<EuropeCrashDataset>{
  const raw=await fs.readFile(path.join(process.cwd(),"public","data","europe_crash_tracker.json"),"utf-8");
  return JSON.parse(raw);
}

export default async function EuropeSafetyPage(){
  const data=await loadData();
  const countries=data.countries;
  const fatal=data.incidents.filter(x=>Number(x.fatalities)>0).length;
  return <div className="max-w-6xl px-8 py-6">
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <p className="eyebrow">Europe · Crash Reporting</p>
      <span className="text-[11px] font-bold uppercase tracking-[.12em] px-2 py-1 rounded bg-[#fff1d6] text-[#8a5a11]">Beta</span>
    </div>
    <h1 className="text-4xl font-semibold tracking-tight max-w-3xl">Europe Crash Tracker</h1>
    <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
      A deduplicated record of publicly reported crashes involving automated-driving systems across Europe, including EU and non-EU countries. Unlike the US NHTSA SGO tracker, this beta is discovery-based: one real-world crash is counted once even when multiple media, operator or agency sources report it.
    </p>

    <div className="mt-5 grid sm:grid-cols-3 gap-2.5">
      <StatTile label="Verified Incidents" value={data.incidents.length.toString()} caption="One canonical record per crash" />
      <StatTile label="Countries in Scope" value={countries.length.toString()} caption="Including countries with zero verified crashes" />
      <StatTile label="Fatal Incidents" value={fatal.toString()} caption="Based on public reporting" />
    </div>

    <section className="mt-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Crash Records</h2>
          <p className="text-sm text-neutral-600 mt-1 max-w-4xl">Coverage is not yet exhaustive. Records are added only when the event, automated-driving involvement, date/location and source trail can be verified well enough to avoid double counting.</p>
        </div>
        <div className="flex gap-3 text-sm">
          <a href="/data/europe_crash_tracker.csv" className="text-[#184f95] underline">Download CSV ↗</a>
          <a href="/data/europe_crash_tracker.json" className="text-[#184f95] underline">Download JSON ↗</a>
          <a href="/data/europe_crash_tracker_unresolved_leads.csv" className="text-[#184f95] underline">Download unresolved leads ↗</a>
          <a href="/data/europe_crash_tracker_countries.csv" className="text-[#184f95] underline">Download country coverage ↗</a>
        </div>
      </div>
      <div className="mt-4"><EuropeCrashTracker incidents={data.incidents} countries={data.countries}/></div>
    </section>

    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight">Deduplication Method</h2>
      <div className="viz-card p-5 mt-2 text-sm leading-relaxed text-neutral-700">
        <p>{data.methodology}</p>
        <p className="mt-3"><strong>Beta limitation:</strong> {data.limitations}</p>
      </div>
    </section>

    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight">Historical Leads Not Counted as Canonical Crashes</h2>
      <p className="text-sm text-neutral-600 mt-1 max-w-4xl">Historical search also finds reports that cannot yet be separated into individual incidents, or events that occurred while the vehicle was clearly in manual operation. They stay visible here so the research trail is not lost, but they are excluded from the incident count above.</p>
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {data.unresolved_leads.map(row=><article key={row.lead_id} className="viz-card p-4">
          <p className="eyebrow">{row.country} · {row.period}</p>
          <h3 className="font-semibold text-[#152b45] mt-1">{row.city} · {row.operator}</h3>
          <p className="text-xs font-semibold text-[#98601d] mt-2">{row.status}</p>
          <p className="text-sm text-neutral-600 mt-2">{row.finding}</p>
          <div className="flex flex-wrap gap-3 mt-3">{row.sources.map((url,i)=><a key={url} href={url} target="_blank" rel="noreferrer" className="text-sm text-[#184f95] underline">Source {i+1} ↗</a>)}</div>
        </article>)}
      </div>
    </section>

    <section className="mt-8 mb-10">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Other Reporting Sources Under Review</h2>
        <p className="text-sm text-neutral-600 mt-1 max-w-4xl">The media tracker is only the first layer. These sources can improve completeness and provide official corroboration as access becomes available.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {data.reporting_options.map(row=><article key={row.source} className="viz-card p-4">
          <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-[#152b45]">{row.source}</h3><span className="text-xs font-semibold text-[#123b69]">{row.usefulness}</span></div>
          <p className="text-sm text-neutral-600 mt-2">{row.notes}</p>
          <dl className="text-sm mt-3 space-y-1"><div><dt className="inline text-neutral-500">Scope: </dt><dd className="inline">{row.scope}</dd></div><div><dt className="inline text-neutral-500">Access: </dt><dd className="inline">{row.access}</dd></div></dl>
          {row.url&&<a href={row.url} target="_blank" rel="noreferrer" className="inline-block text-sm text-[#184f95] underline mt-3">Source / documentation ↗</a>}
        </article>)}
      </div>
    </section>
  </div>;
}
