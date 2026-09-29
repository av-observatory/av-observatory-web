"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { UsStateMap } from "@/components/UsStateMap";
import { usePolicyData, displayDate } from "@/lib/policyTracker";

const CURRENT = new Set(["in_effect","current","in_effect_as_amended"]);

export function NationalStatePolicy({ valueByAbbrev, companiesByState }: {
  valueByAbbrev: Record<string, number>;
  companiesByState: Record<string, string[]>;
}) {
  const [selected, setSelected] = useState({ abbreviation: "CA", name: "California" });
  const { data, source } = usePolicyData();
  const companies = companiesByState[selected.abbreviation] ?? [];
  const events = useMemo(() => data.state_events
    .filter(e => e.state === selected.abbreviation)
    .sort((a,b) => {
      const ac = CURRENT.has(a.status) ? 0 : 1;
      const bc = CURRENT.has(b.status) ? 0 : 1;
      return ac-bc || (b.date ?? "").localeCompare(a.date ?? "");
    }), [data.state_events, selected.abbreviation]);
  const current = events.filter(e => CURRENT.has(e.status));
  const lead = current[0] ?? events[0];

  return <div className="grid lg:grid-cols-[1.45fr_.75fr] gap-3 items-stretch">
    <div className="viz-card p-4">
      <div className="eyebrow">Operating footprint</div>
      <p className="mt-2 text-sm text-neutral-600">Shading counts companies with current deployment evidence. Select a state for its policy context.</p>
      <UsStateMap valueByAbbrev={valueByAbbrev} selectedAbbrev={selected.abbreviation} onStateClick={(abbreviation, name) => setSelected({ abbreviation, name })} />
    </div>
    <section className="viz-card p-5" aria-live="polite" aria-label="Selected state policy analysis">
      <div className="eyebrow">State policy · {selected.abbreviation}</div>
      <h3 className="text-2xl font-semibold mt-2 text-[#0b1d33]">{selected.name}</h3>
      {lead ? <>
        <p className="font-semibold mt-5">{lead.title}</p>
        <p className="text-sm leading-relaxed text-neutral-700 mt-2">{lead.takeaway ?? lead.summary}</p>
        {current.length > 1 && <div className="mt-4 border-t border-neutral-200 pt-3">
          <h4 className="font-semibold text-sm">Other current AV policy records</h4>
          <div className="grid gap-2 mt-2">{current.slice(1,4).map(event => <div key={event.id} className="text-sm">
            <span className="font-medium">{event.title}</span>
            <span className="text-neutral-500"> · {event.instrument}{event.date ? ` · ${displayDate(event.date)}` : ""}</span>
          </div>)}</div>
        </div>}
        <p className="text-xs text-neutral-500 mt-5">{source === "R2" ? `Live R2 policy feed · ${data.as_of}` : `Site cache · ${data.as_of}`}. Current view is derived from dated policy-event history rather than a hand-written state brief.</p>
        <a href={lead.source_url} target="_blank" rel="noreferrer" className="inline-block mt-2 text-sm underline text-[#184f95]">{lead.source_label ?? "Primary source"} ↗</a>
      </> : <>
        <p className="mt-5 text-sm text-neutral-700">No state-specific AV policy event is currently indexed for {selected.name}. This is a coverage statement, not a legal conclusion.</p>
      </>}
      <div className="mt-6 border-t border-neutral-200 pt-4">
        <h4 className="font-semibold text-sm">Documented Current Operations</h4>
        <p className="text-sm mt-1 text-neutral-700">{companies.length ? companies.join(" · ") : "No current deployment record in this dataset."}</p>
        <Link href="/deployment" className="inline-block mt-2 text-sm underline text-[#184f95]">Examine deployment evidence →</Link>
      </div>
    </section>
  </div>;
}
