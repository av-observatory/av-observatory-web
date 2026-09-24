"use client";

import { useState } from "react";
import Link from "next/link";
import { UsStateMap } from "@/components/UsStateMap";
import { NATIONAL_POLICY_SOURCE, policyBriefs } from "@/lib/statePolicy";

export function NationalStatePolicy({ valueByAbbrev, companiesByState }: {
  valueByAbbrev: Record<string, number>;
  companiesByState: Record<string, string[]>;
}) {
  const [selected, setSelected] = useState({ abbreviation: "CA", name: "California" });
  const brief = policyBriefs[selected.abbreviation];
  const companies = companiesByState[selected.abbreviation] ?? [];
  return <div className="grid lg:grid-cols-[1.45fr_.75fr] gap-3 items-stretch">
    <div className="viz-card p-4">
      <div className="eyebrow">Operating footprint</div>
      <p className="mt-2 text-sm text-neutral-600">Shading counts companies with current deployment evidence. Select a state for its policy context.</p>
      <UsStateMap valueByAbbrev={valueByAbbrev} selectedAbbrev={selected.abbreviation} onStateClick={(abbreviation, name) => setSelected({ abbreviation, name })} />
    </div>
    <section className="viz-card p-5" aria-live="polite" aria-label="Selected state policy analysis">
      <div className="eyebrow">State policy · {selected.abbreviation}</div>
      <h3 className="text-2xl font-semibold mt-2 text-[#0b1d33]">{selected.name}</h3>
      {brief ? <>
        <p className="font-semibold mt-5">{brief.framework}</p>
        <p className="text-sm leading-relaxed text-neutral-700 mt-2">{brief.analysis}</p>
        <h4 className="font-semibold text-sm mt-5">Oversight</h4>
        <p className="text-sm text-neutral-700 mt-1">{brief.oversight}</p>
        <p className="text-xs text-neutral-500 mt-5">{brief.reviewed}. Policy snapshot; check the linked primary authorities before relying on it for an operating decision.</p>
        <div className="mt-2 flex flex-col gap-1">{brief.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="text-sm underline text-[#184f95]">{s.label} ↗</a>)}</div>
      </> : <>
        <p className="mt-5 text-sm text-neutral-700">A state-specific policy analysis has not yet been verified for {selected.name}. The map&apos;s operating evidence does not establish the state&apos;s permit rules or where a company is authorized to drive.</p>
        <a className="inline-block mt-4 text-sm underline text-[#184f95]" href={NATIONAL_POLICY_SOURCE} target="_blank" rel="noreferrer">Research state legislation at NCSL ↗</a>
      </>}
      <div className="mt-6 border-t border-neutral-200 pt-4">
        <h4 className="font-semibold text-sm">Documented Current Operations</h4>
        <p className="text-sm mt-1 text-neutral-700">{companies.length ? companies.join(" · ") : "No current deployment record in this dataset."}</p>
        <Link href="/deployment" className="inline-block mt-2 text-sm underline text-[#184f95]">Examine deployment evidence →</Link>
      </div>
    </section>
  </div>;
}
