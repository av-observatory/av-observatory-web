export type SeriousCrash = {
  incident_key: string; incident_date: string; city: string; state: string;
  reporting_entities: string; report_ids: string; severity: string; make: string; model: string;
  crash_with: string; roadway_type: string; engagement_status: string;
  air_bag_deployment: string; source_url: string;
};
export type MediaContext = { report_id: string; match: string; narrative: string; attribution: string; sources: string[] };

export function SgoSeriousCrashList({ crashes, media }: { crashes: SeriousCrash[]; media: MediaContext[] }) {
  return <section className="mt-7"><div className="flex flex-wrap justify-between items-end gap-3"><div><p className="eyebrow">NHTSA SGO · Latest Report Versions</p><h2 className="text-xl font-semibold tracking-tight mt-2">Serious or Fatal Crashes</h2></div><span className="text-sm text-neutral-600">{crashes.length} distinct reported incidents</span></div>
    <p className="text-sm text-neutral-600 mt-2 max-w-4xl">A running list of ADS reports with serious injury or fatality alleged. Reports sharing NHTSA’s Same Incident ID appear once, with all reporting entities and IDs shown. Severity is reported or alleged, and does not establish fault or final injury outcome. Where a news event can be matched to an SGO report, an attributed editorial summary adds context. The latest NHTSA release contains part of August 2026.</p>
    <div className="grid gap-3 mt-4">{crashes.map((crash, i) => <details key={crash.incident_key} className="viz-card px-5 py-4" open={i === 0}>
      <summary className="cursor-pointer list-none flex flex-wrap gap-2 items-start justify-between"><span><strong className="text-[#152b45]">{crash.severity.startsWith("Fatal") ? "Fatality Alleged" : "Serious Injury Alleged"}</strong><span className="block text-sm text-neutral-600 mt-1">{crash.incident_date} · {[crash.city, crash.state].filter(Boolean).join(", ")} · {crash.reporting_entities}</span></span><span className="text-sm text-[#184f95]">Details ▾</span></summary>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm mt-4 pt-4 border-t border-[#dce5ec]">
        <div><span className="block text-neutral-500">Reported Collision With</span>{crash.crash_with || "Not Reported"}</div>
        <div><span className="block text-neutral-500">Roadway</span>{crash.roadway_type || "Not Reported"}</div>
        <div><span className="block text-neutral-500">Subject Vehicle</span>{[crash.make, crash.model].filter(Boolean).join(" ") || "Not Reported"}</div>
        <div><span className="block text-neutral-500">Air Bags</span>{crash.air_bag_deployment}</div>
        <div><span className="block text-neutral-500">Automation System</span>{crash.engagement_status || "Not Reported"}</div>
        <div><span className="block text-neutral-500">NHTSA Report IDs</span>{crash.report_ids}</div>
      </div>
      {(() => { const item = media.find(m => crash.report_ids.split(';').map(x=>x.trim()).includes(m.report_id)); return item ? <div className="bg-[#f1f6fb] rounded p-4 mt-4"><strong className="text-sm text-[#123b69]">Narrative Developed From Media and Agency Reports</strong><p className="text-sm leading-relaxed mt-2">{item.narrative}</p><p className="text-sm text-neutral-600 mt-2">{item.attribution} · Match: {item.match.replaceAll('_',' ')}</p><div className="flex flex-wrap gap-3 mt-2">{item.sources.map((url,j)=><a key={url} href={url} className="text-sm text-[#184f95] underline">Source {j+1} ↗</a>)}</div></div> : <p className="text-sm text-neutral-600 mt-4">No independently matched media account has been verified for this report. The details above come from the SGO fields and should not be read as a complete account of the crash.</p>; })()}
      <p className="text-sm text-neutral-600 mt-4">These are fields from the reporting entities’ latest incident submissions. For the narrative and subsequent updates, find the Report IDs in the <a className="text-[#184f95] underline" href={crash.source_url}>NHTSA source CSV ↗</a>.</p>
    </details>)}</div>
    <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/sgo_serious_fatal_crashes.csv`} download className="inline-block text-sm text-[#184f95] underline mt-4">Download Serious and Fatal Crash List CSV ↗</a>
    <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/sgo_media_context.json`} className="inline-block text-sm text-[#184f95] underline mt-4 ml-4">Download Media Context JSON ↗</a>
  </section>;
}
