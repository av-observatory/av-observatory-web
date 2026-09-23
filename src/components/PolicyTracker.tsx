"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { UsStateMap, type MapCategory } from "@/components/UsStateMap";
import { PolicyNav } from "@/components/PolicyNav";
import { LegislativeBillsPanel } from "@/components/LegislativeBillsPanel";
import { displayDate, usePolicyData, type PolicyEvent } from "@/lib/policyTracker";

function Intro({ level, description }: { level: string; description: string }) {
  return <><p className="eyebrow mb-3">Policy tracker / {level}</p><h1 className="text-4xl font-semibold tracking-tight text-[#0b1d33]">Autonomous vehicle policy tracker</h1><p className="mt-3 text-sm leading-relaxed text-neutral-600 max-w-3xl">{description}</p></>;
}

const categories: Record<string, MapCategory> = {
  both: { label: "Legislation + executive order history", color: "#5547a3" },
  law: { label: "Enacted legislation", color: "#2b77bc" },
  order: { label: "Executive order history only", color: "#db9b38" },
  none: { label: "No AV-specific law or order identified", color: "#e6e5e0" },
};

const fmvssStages = ["Proposal", "Comments", "Agency review", "Final rule", "In effect"] as const;
const stageMeanings = [
  "Draft amendment published; existing rule still applies.",
  "Public submits evidence before the deadline.",
  "NHTSA weighs comments and may revise or withdraw.",
  "Adopted text published with an effective date.",
  "Rule is binding; a later compliance date may apply.",
] as const;
type FmvssItem = ReturnType<typeof usePolicyData>["data"]["federal"][number];

function StageGuide() {
  return <ol className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-4" aria-label="What the five rulemaking stages mean">
    {fmvssStages.map((name, index) => <li key={name} className="relative rounded-lg border border-[#d3dfed] bg-[#f7fafe] p-3 min-w-0">
      <div className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#123b69] text-white text-sm font-semibold">{index + 1}</span><strong className="text-sm text-[#123b69]">{name}</strong></div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-700">{stageMeanings[index]}</p>
    </li>)}
  </ol>;
}

function FmvssTimeline({ item }: { item: FmvssItem }) {
  const final = item.status === "effective";
  const deadline = "comment_deadline" in item ? item.comment_deadline : undefined;
  const effective = "effective_date" in item ? item.effective_date : undefined;
  const current = final ? 4 : item.status === "under_review" ? 2 : 1;
  return <div className="mt-5" aria-label={`Rulemaking status: ${fmvssStages[current]}`}>
    <ol className="grid grid-cols-5 gap-1" aria-label="Five stages of FMVSS rulemaking">
      {fmvssStages.map((label, index) => <li key={label} aria-current={index === current ? "step" : undefined} className="min-w-0">
        <div className={`h-2 rounded-sm ${index === current ? "bg-[#123b69]" : index < current ? "bg-[#80a9d0]" : "bg-neutral-200"}`} />
        <div className={`mt-2 text-sm leading-tight ${index === current ? "font-semibold text-[#123b69]" : index < current ? "text-neutral-700" : "text-neutral-500"}`}>{label}</div>
      </li>)}
    </ol>
    <p className="text-sm text-neutral-700 mt-3">{final
      ? `Final rule published ${displayDate(item.date)}; in effect since ${displayDate(effective ?? null)}.`
      : deadline ? `Comments closed ${displayDate(deadline)}. NHTSA is reviewing the proposal; no final amendment is identified.`
        : "Comment status requires review."}</p>
  </div>;
}

function StateHistoryEvent({ item }: { item: PolicyEvent }) {
  return <article className="border-l-2 border-[#3987e5] pl-3"><div className="text-xs uppercase tracking-wide text-neutral-500">{displayDate(item.date)} · {item.instrument.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}</div><h4 className="text-sm font-semibold mt-1">{item.title}</h4><p className="text-sm text-neutral-700 mt-1">{item.summary}</p><a href={item.source_url} target="_blank" rel="noreferrer" className="text-sm text-[#184f95] underline inline-block mt-1">{item.source_label ?? "Source text"} ↗</a>{item.source_tier === "secondary" && <p className="text-xs text-amber-800 mt-1">Secondary survey; primary legislation link pending review.</p>}</article>;
}

export function FederalTracker() {
  const { data, source } = usePolicyData();
  const events = data.federal.filter(item => item.fmvss.length && !["fmvss-2020-nprm", "fmvss-2022-final"].includes(item.id)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.fmvss[0].localeCompare(b.fmvss[0], undefined, { numeric: true }));
  const early = data.federal.filter(item => !item.fmvss.length);
  return <main className="max-w-6xl px-8 py-8">
    <Intro level="Federal" description="Track NHTSA oversight and verified FMVSS amendments that explicitly address ADS vehicle design, plus related steering-control changes. Each rulemaking links to its proposal and final text where available." />
    <PolicyNav active="federal" />
    <div className="grid lg:grid-cols-2 gap-3">
      <section className="viz-card p-5"><div className="eyebrow">The regulator</div><h2 className="text-xl font-semibold mt-2">NHTSA oversight</h2><p className="text-sm leading-relaxed mt-3 text-neutral-700">The National Highway Traffic Safety Administration administers federal vehicle safety law. It can investigate safety defects, require recalls, review petitions for exemptions, and collect specified ADS crash reports under its Standing General Order. These tools apply beyond the text of any one safety standard.</p><p className="text-sm leading-relaxed mt-3 text-neutral-700">NHTSA has said there is currently no federal ADS driving-competency standard. State and local rules also shape where and how an AV can operate.</p><a className="text-sm underline text-[#184f95] inline-block mt-4" href="https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting" target="_blank" rel="noreferrer">Crash reporting order ↗</a><span className="mx-2 text-neutral-300">·</span><a className="text-sm underline text-[#184f95]" href="https://www.nhtsa.gov/speeches-presentations/ces-road-rules-governing-global-shift-autonomy" target="_blank" rel="noreferrer">NHTSA on ADS standards ↗</a></section>
      <section className="viz-card p-5"><div className="eyebrow">The standards</div><h2 className="text-xl font-semibold mt-2">FMVSS</h2><p className="text-sm leading-relaxed mt-3 text-neutral-700">Federal Motor Vehicle Safety Standards are requirements for new motor vehicles and equipment, codified in 49 CFR Part 571. AV-specific modernization adapts standards written around steering wheels, pedals, displays, and human drivers to vehicles with automated driving systems.</p><p className="text-sm leading-relaxed mt-3 text-neutral-700">The 2022 ADS occupant protection rule and the separate 2026 FMVSS 204 rule are in effect. Other 2026 ADS design amendments below remain proposals.</p><a className="text-sm underline text-[#184f95] inline-block mt-4" href="https://www.nhtsa.gov/laws-regulations" target="_blank" rel="noreferrer">NHTSA laws and standards ↗</a></section>
    </div>
    <section className="mt-7"><h2 className="text-xl font-semibold">NHTSA oversight history</h2><p className="text-sm text-neutral-600 mt-1">Crash reporting and ADS oversight proposals sit outside the FMVSS vehicle design rules.</p><div className="grid md:grid-cols-2 gap-3 mt-3">{[...data.federal_oversight].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).map(item => <article key={item.id} className="viz-card p-4"><div className="text-xs text-[#184f95] uppercase font-semibold">{displayDate(item.date)} · {item.status.replaceAll("_", " ")}</div><h3 className="font-semibold mt-2">{item.title}</h3><p className="text-sm text-neutral-700 mt-2">{item.summary}</p><a className="text-sm text-[#184f95] underline inline-block mt-2" href={item.source_url} target="_blank" rel="noreferrer">NHTSA / Federal Register ↗</a></article>)}</div></section>
    <section className="mt-7"><div className="flex flex-wrap justify-between items-end gap-2"><div><h2 className="text-xl font-semibold">FMVSS change history</h2><p className="text-sm text-neutral-600 mt-1">ADS design rulemakings and a related steering-control change. The numbers list every standard amended by each tracked final rule; one rulemaking may amend several standards.</p></div><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/policy_tracker.json`} className="text-sm text-[#184f95] underline">Download JSON ↗</a></div>
      <StageGuide />
      <div className="grid md:grid-cols-2 gap-3 mt-3">{events.map(item => <article className="viz-card p-5" key={item.id}><div className="flex flex-wrap justify-between items-start gap-2 text-sm"><span className="font-semibold uppercase tracking-wide text-[#184f95]">FMVSS {item.fmvss.join(" · ")}</span><span className="text-neutral-500 whitespace-nowrap">{displayDate(item.date)}</span></div><div className="mt-2 text-sm font-medium text-neutral-500 uppercase tracking-wide">{"scope" in item ? item.scope : "ADS-specific"}</div><h3 className="font-semibold text-[#0b1d33] mt-2">{item.title}</h3><p className="text-sm text-neutral-700 mt-2 leading-relaxed">{item.summary}</p><FmvssTimeline item={item} /><div className="flex flex-wrap gap-x-4 gap-y-1 mt-3"><a href={item.source_url} target="_blank" rel="noreferrer" className="text-sm text-[#184f95] underline">{item.status === "effective" ? "Final rule" : "Proposed rule"} ↗</a>{"proposal_url" in item && item.proposal_url && <a href={item.proposal_url} target="_blank" rel="noreferrer" className="text-sm text-[#184f95] underline">Original proposal ↗</a>}{"comment_extension_url" in item && item.comment_extension_url && <a href={item.comment_extension_url} target="_blank" rel="noreferrer" className="text-sm text-[#184f95] underline">Comment extension ↗</a>}</div></article>)}</div>
      <div className="viz-card p-5 mt-3"><h3 className="font-semibold">Before a specific FMVSS proposal</h3><p className="text-sm text-neutral-600 mt-1">Early requests for information do not themselves amend a standard.</p><div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">{early.map(item => <a key={item.id} href={item.source_url} target="_blank" rel="noreferrer" className="text-sm text-[#184f95] underline">{displayDate(item.date)} · {item.title} ↗</a>)}</div></div>
    </section>
    <LegislativeBillsPanel jurisdiction="US" />
    <div className="mt-6 text-xs text-neutral-500">Reviewed {data.as_of} · Data source: {source === "R2" ? "R2 live record" : "reviewed site snapshot"}. <Link href="/policy/states" className="underline">Continue to state policy →</Link></div>
  </main>;
}

export function StateTracker() {
  const { data, source } = usePolicyData();
  const [selected, setSelected] = useState("MA");
  const [filter, setFilter] = useState("");
  const categoryByAbbrev = useMemo(() => Object.fromEntries(data.states.map(s => [s.code, s.enacted_legislation ? (s.executive_order_history ? "both" : "law") : (s.executive_order_history ? "order" : "none")])), [data]);
  const state = data.states.find(s => s.code === selected) ?? data.states[0];
  const history = data.state_events.filter(e => e.state === state.code).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return <main className="max-w-7xl px-8 py-8"><Intro level="States" description="Select any state to see its framework, enacted instruments, and policy history. Color shows the type of identified law or executive order, never the number of AVs operating there." /><PolicyNav active="states" />
    <div className="grid lg:grid-cols-[1.35fr_.85fr] gap-3 items-start"><section className="viz-card p-4"><div className="eyebrow">Policy map · 50 states + D.C.</div><p className="text-sm text-neutral-600 mt-2">Includes narrow testing and pilot statutes. Historical and rescinded orders are marked in the history and do not imply current authority.</p><div className="mt-4"><UsStateMap categoryByAbbrev={categoryByAbbrev} categories={categories} selectedAbbrev={state.code} onStateClick={code => setSelected(code)} /></div><div className="mt-5"><label htmlFor="state-search" className="text-xs font-semibold text-neutral-600">Find a state</label><input id="state-search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="State name or abbreviation" className="block mt-1 w-full rounded border border-neutral-300 p-2 text-sm" /><div className="flex flex-wrap gap-1.5 mt-2 max-h-32 overflow-auto">{data.states.filter(s => `${s.name} ${s.code}`.toLowerCase().includes(filter.toLowerCase())).map(s => <button key={s.code} onClick={() => setSelected(s.code)} className={`text-xs rounded px-2 py-1 border ${s.code === state.code ? "bg-[#0b1d33] text-white" : "border-neutral-200"}`}>{s.code}</button>)}</div></div></section>
    <section className="viz-card p-5" aria-live="polite"><div className="eyebrow">{state.code} · {categories[categoryByAbbrev[state.code]]?.label}</div><h2 className="text-2xl font-semibold mt-2 text-[#0b1d33]">{state.name}</h2><p className="font-semibold mt-5">{state.framework}</p><p className="text-sm text-neutral-700 leading-relaxed mt-2">{state.analysis}</p><h3 className="font-semibold text-sm mt-5">Oversight</h3><p className="text-sm text-neutral-700 mt-1">{state.oversight}</p><h3 className="font-semibold text-sm mt-6 border-t border-neutral-200 pt-5">Policy history</h3>{history.length ? state.code === "CA" ? <div className="space-y-7 mt-3">{[
      { label: "DMV · vehicle testing and deployment", items: history.filter(e => e.id.startsWith("ca-dmv")) },
      { label: "CPUC · passenger service", items: history.filter(e => e.id.startsWith("ca-cpuc")) },
      { label: "State law", items: history.filter(e => !e.id.startsWith("ca-dmv") && !e.id.startsWith("ca-cpuc")) },
    ].map(group => <div key={group.label}><h4 className="text-sm font-semibold text-[#0b1d33] mb-3">{group.label}</h4><div className="space-y-4">{group.items.map(item => <StateHistoryEvent key={item.id} item={item} />)}</div></div>)}</div> : <div className="space-y-4 mt-3">{history.map(item => <StateHistoryEvent key={item.id} item={item} />)}</div> : <p className="text-sm text-neutral-600 mt-2">No enacted AV-specific statute or executive order has been identified in the reviewed sources. General vehicle law still applies.</p>}
    <p className="text-xs text-neutral-500 mt-6">Reviewed {state.verified_at} · {source === "R2" ? "R2 live record" : "reviewed site snapshot"}. <Link href="/deployment" className="underline">See deployment separately →</Link></p></section></div><LegislativeBillsPanel jurisdiction={state.code} /><p className="text-xs text-neutral-500 mt-4">Classification is a research index, not an operating authorization. <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/policy_tracker.json`} className="underline">Download all policy records as JSON ↗</a></p></main>;
}

export function CityTracker() {
  const { data, source } = usePolicyData();
  const [selected, setSelected] = useState("New York City");
  const places = [...new Set(data.city_events.map(e => e.jurisdiction))].sort();
  const events = data.city_events.filter(e => e.jurisdiction === selected).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return <main className="max-w-6xl px-8 py-8"><Intro level="Cities" description="City policies can involve test permits, street and curb rules, safety coordination, or a state-led approval process. The entries distinguish those roles and show their primary city sources." /><PolicyNav active="cities" /><div className="grid lg:grid-cols-[.65fr_1.35fr] gap-3"><section className="viz-card p-5"><h2 className="font-semibold">City research index</h2><div className="mt-3 space-y-1">{places.map(place => <button onClick={() => setSelected(place)} key={place} className={`w-full text-left rounded px-3 py-2 text-sm ${place === selected ? "bg-[#0b1d33] text-white" : "hover:bg-neutral-100"}`}>{place}<span className="float-right opacity-60">{data.city_events.filter(e => e.jurisdiction === place)[0].state}</span></button>)}</div><p className="text-xs text-neutral-500 mt-4">Six initial cities with documented policy or oversight actions. More cities can be added as verified events in the same schema.</p></section><section className="viz-card p-5" aria-live="polite"><div className="eyebrow">Municipal policy</div><h2 className="text-2xl font-semibold mt-2">{selected}</h2><div className="space-y-5 mt-5">{events.map(item => <article key={item.id} className="border-t border-neutral-200 pt-4"><div className="text-xs uppercase tracking-wide text-neutral-500">{item.instrument} · {displayDate(item.date)} · {item.status.replaceAll("_", " ")}</div><h3 className="font-semibold mt-2">{item.title}</h3><p className="text-sm leading-relaxed text-neutral-700 mt-2">{item.summary}</p><a className="text-sm underline text-[#184f95] inline-block mt-3" href={item.source_url} target="_blank" rel="noreferrer">City source ↗</a></article>)}</div><p className="text-xs text-neutral-500 mt-6">Reviewed {data.as_of} · {source === "R2" ? "R2 live record" : "reviewed site snapshot"}. <Link href="/policy/states" className="underline">See the state framework →</Link></p></section></div></main>;
}
