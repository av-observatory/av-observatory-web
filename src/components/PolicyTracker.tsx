"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MapCategory } from "@/components/UsStateMap";
import { StateTileMap } from "@/components/StateTileMap";
import { PolicyNav } from "@/components/PolicyNav";
import { LegislativeBillsPanel } from "@/components/LegislativeBillsPanel";
import { displayDate, usePolicyData, type PolicyEvent } from "@/lib/policyTracker";

function Intro({ level, description }: { level: string; description: string }) {
  return <><p className="eyebrow mb-3">Policy Trackers / {level}</p><h1 className="text-4xl font-semibold tracking-tight text-[#0b1d33]">{level === "Federal Rules" ? "Federal Regulations and Rules" : level === "State Regulations" ? "State Regulations" : "City Policy"}</h1><p className="mt-3 text-base leading-relaxed text-neutral-600 max-w-3xl">{description}</p></>;
}

const categories: Record<string, MapCategory> = {
  both: { label: "Legislation and Executive Order", color: "#5547a3" },
  law: { label: "Legislation Only", color: "#2b77bc" },
  order: { label: "Executive Order Only", color: "#db9b38" },
  none: { label: "No AV Actions", color: "#e6e5e0" },
};

function statusLabel(status: string) { return status === "historical_status_unverified" ? "Current Status Not Confirmed" : status.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
function historyRank(status: string) { return ["in_effect", "current", "in_effect_as_amended"].includes(status) ? 0 : 1; }
function sortHistory(a: PolicyEvent, b: PolicyEvent) {
  return historyRank(a.status) - historyRank(b.status) || (b.date ?? "").localeCompare(a.date ?? "") || a.title.localeCompare(b.title);
}
function datedStatus(item: PolicyEvent) { return [displayDate(item.date), statusLabel(item.status)].filter(Boolean).join(" · "); }

const fmvssStages = ["Proposal", "Comments", "Agency Review", "Final Rule", "In Effect"] as const;
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

function FmvssExplorer({ events }: { events: FmvssItem[] }) {
  const [selectedId, setSelectedId] = useState("fmvss-204-2026");
  const [view, setView] = useState<"all" | "effective" | "proposal">("all");
  const visible = events.filter(item => view === "all" || (view === "effective" ? item.status === "effective" : item.status !== "effective"));
  const item = visible.find(rule => rule.id === selectedId) ?? visible[0];
  return <div className="grid lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] gap-3 mt-4 items-start">
    <div className="viz-card p-4 min-w-0">
      <div className="flex flex-wrap gap-2 mb-4" aria-label="Filter FMVSS rules">
        {([ ["all", "All", events.length], ["effective", "In Effect", events.filter(x => x.status === "effective").length], ["proposal", "Proposed", events.filter(x => x.status !== "effective").length] ] as const).map(([key, label, count]) => <button key={key} type="button" onClick={() => setView(key)} aria-pressed={view === key} className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${view === key ? "bg-[#123b69] border-[#123b69] text-white" : "bg-white border-neutral-200 text-neutral-700 hover:border-[#80a9d0]"}`}>{label} <span className="opacity-75">{count}</span></button>)}
      </div>
      <div className="max-h-[560px] overflow-y-auto divide-y divide-neutral-200" role="list" aria-label="FMVSS standards and rulemakings">
        {visible.map(rule => <div role="listitem" key={rule.id}><button type="button" onClick={() => setSelectedId(rule.id)} aria-pressed={item.id === rule.id} className={`text-left w-full px-3 py-3 rounded-md transition-colors ${item.id === rule.id ? "bg-[#eaf2fa] border-l-4 border-[#123b69]" : "hover:bg-neutral-50 border-l-4 border-transparent"}`}>
          <span className="flex justify-between items-baseline gap-3"><span className="font-semibold text-[#0b1d33] text-sm">{rule.title}</span><span className="shrink-0 text-sm text-neutral-500">{(rule.date ?? "").slice(0, 4)}</span></span>
          <span className="block mt-1 text-sm leading-snug text-neutral-700">{rule.takeaway ?? rule.summary.split(". ")[0]}</span>
          <span className="block mt-1.5 text-sm text-neutral-500">{rule.status === "effective" ? "In Effect" : "Under Review"}{"rulemaking_id" in rule ? " · 2022 ADS rule" : ""}</span>
        </button></div>)}
      </div>
    </div>
    <article className="viz-card p-5 min-w-0" aria-live="polite" key={item.id}>
      <div className="flex flex-wrap justify-between gap-2 items-center"><span className="eyebrow">FMVSS {item.fmvss.join(" · ")}</span><span className={`text-sm font-semibold rounded-full px-3 py-1 ${item.status === "effective" ? "bg-[#dcefe9] text-[#145c48]" : "bg-[#fff1d9] text-[#76500d]"}`}>{item.status === "effective" ? "In Effect" : "Under Review"}</span></div>
      <h3 className="text-xl font-semibold text-[#0b1d33] mt-3">{item.title}</h3>
      <p className="text-sm text-neutral-700 mt-3 leading-relaxed">{item.summary}</p>
      {"rulemaking_id" in item && <p className="text-sm text-neutral-500 mt-2">Part of the 2022 occupant protection rulemaking.</p>}
      <FmvssTimeline item={item} />
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5 border-t border-neutral-200 pt-4 text-sm"><a href={item.source_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">{item.status === "effective" ? "Final rule" : "Proposed rule"} ↗</a>{"proposal_url" in item && item.proposal_url && <a href={item.proposal_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">Original proposal ↗</a>}{"comment_extension_url" in item && item.comment_extension_url && <a href={item.comment_extension_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">Comment extension ↗</a>}</div>
    </article>
  </div>;
}

type OversightItem = ReturnType<typeof usePolicyData>["data"]["federal_oversight"][number];
function OversightHistory({ events }: { events: OversightItem[] }) {
  return <div className="grid md:grid-cols-2 gap-3 mt-3">{[...events].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).map(item => <article key={item.id} className="viz-card p-4"><div className="text-xs text-[#184f95] uppercase font-semibold">{displayDate(item.date)} · {statusLabel(item.status)}</div><h3 className="font-semibold mt-2">{item.title}</h3><p className="text-sm text-neutral-700 mt-2">{item.summary}</p><a className="text-sm text-[#184f95] underline inline-block mt-2" href={item.source_url} target="_blank" rel="noreferrer">NHTSA / Federal Register ↗</a></article>)}</div>;
}

function StateHistoryExplorer({ history, stateCode }: { history: PolicyEvent[]; stateCode: string }) {
  const [group, setGroup] = useState("All");
  const [selectedId, setSelectedId] = useState<string | undefined>(history[0]?.id);
  const groups = stateCode === "CA" && history.some(entry => entry.id.startsWith("ca-dmv") || entry.id.startsWith("ca-cpuc")) ? ["All", "DMV", "CPUC", "State Law"] : ["All"];
  const visible = history.filter(item => group === "All" || (group === "DMV" ? item.id.startsWith("ca-dmv") : group === "CPUC" ? item.id.startsWith("ca-cpuc") : !item.id.startsWith("ca-dmv") && !item.id.startsWith("ca-cpuc")));
  return <div className="mt-3">
    {groups.length > 1 && <div className="flex flex-wrap gap-1.5 mb-3" aria-label="Policy history categories">{groups.map(name => <button key={name} type="button" onClick={() => setGroup(name)} aria-pressed={group === name} className={`text-sm px-3 py-1.5 rounded-full border ${group === name ? "bg-[#123b69] text-white border-[#123b69]" : "bg-white text-neutral-700 border-neutral-200"}`}>{name}</button>)}</div>}
    <div className="border-y border-neutral-200 divide-y divide-neutral-200" aria-label="State policy history">
      {visible.map(entry => {
        const expanded = entry.id === selectedId;
        const takeaway = entry.takeaway ?? entry.summary.split(". ")[0];
        return <article key={entry.id} className={`${expanded ? "bg-[#f4f8fc] border-l-4 border-[#123b69]" : "border-l-4 border-transparent"}`}>
          <button type="button" onClick={() => setSelectedId(expanded ? undefined : entry.id)} aria-expanded={expanded} className="w-full text-left px-4 py-3 hover:bg-[#eaf2fa]">
            <span className="block font-semibold text-[#0b1d33]">{entry.title}</span>
            <span className="block text-sm text-neutral-700 mt-1">{takeaway}</span>
            <span className="block text-sm text-neutral-500 mt-1">{datedStatus(entry)}</span>
          </button>
          {expanded && <div className="px-4 pb-4 text-sm leading-relaxed text-neutral-700">
            {entry.summary.trim() !== takeaway.trim() && <p>{entry.summary}</p>}
            {entry.status === "historical_status_unverified" && <p className="mt-2">Its present legal effect has not been confirmed. Check the linked state source before treating it as current authority.</p>}
            <a href={entry.source_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline inline-block mt-2">{entry.source_label ?? "Source Text"} ↗</a>
            {entry.source_tier === "secondary" && <p className="text-amber-800 mt-2">Secondary survey; primary legislation link pending review.</p>}
          </div>}
        </article>;
      })}
    </div>
  </div>;
}

export function FederalTracker() {
  const { data, source } = usePolicyData();
  const events = data.federal.filter(item => item.fmvss.length && !["fmvss-2020-nprm", "fmvss-2022-final"].includes(item.id)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.fmvss[0].localeCompare(b.fmvss[0], undefined, { numeric: true }));
  const early = data.federal.filter(item => !item.fmvss.length);
  return <main className="max-w-6xl px-8 py-8">
    <Intro level="Federal Rules" description="Track NHTSA oversight and verified FMVSS amendments that explicitly address ADS vehicle design, plus related steering-control changes. Each rulemaking links to its proposal and final text where available." />
    <PolicyNav active="federal" />
    <div className="grid lg:grid-cols-2 gap-3">
      <section className="viz-card p-5"><div className="eyebrow">The Regulator</div><h2 className="text-xl font-semibold mt-2">NHTSA Oversight</h2><p className="text-sm leading-relaxed mt-3 text-neutral-700">The National Highway Traffic Safety Administration administers federal vehicle safety law. It can investigate safety defects, require recalls, review petitions for exemptions, and collect specified ADS crash reports under its Standing General Order. These tools apply beyond the text of any one safety standard.</p><p className="text-sm leading-relaxed mt-3 text-neutral-700">NHTSA has said there is currently no federal ADS driving-competency standard. State and local rules also shape where and how an AV can operate.</p><a className="text-sm underline text-[#184f95] inline-block mt-4" href="https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting" target="_blank" rel="noreferrer">Crash reporting order ↗</a><span className="mx-2 text-neutral-300">·</span><a className="text-sm underline text-[#184f95]" href="https://www.nhtsa.gov/speeches-presentations/ces-road-rules-governing-global-shift-autonomy" target="_blank" rel="noreferrer">NHTSA on ADS standards ↗</a></section>
      <section className="viz-card p-5"><div className="eyebrow">The Standards</div><h2 className="text-xl font-semibold mt-2">FMVSS</h2><p className="text-sm leading-relaxed mt-3 text-neutral-700">Federal Motor Vehicle Safety Standards are requirements for new motor vehicles and equipment, codified in 49 CFR Part 571. AV-specific modernization adapts standards written around steering wheels, pedals, displays, and human drivers to vehicles with automated driving systems.</p><p className="text-sm leading-relaxed mt-3 text-neutral-700">The 2022 ADS occupant protection rule and the separate 2026 FMVSS 204 rule are in effect. Other 2026 ADS design amendments below remain proposals.</p><a className="text-sm underline text-[#184f95] inline-block mt-4" href="https://www.nhtsa.gov/laws-regulations" target="_blank" rel="noreferrer">NHTSA laws and standards ↗</a></section>
    </div>
    <section className="mt-7"><h2 className="text-xl font-semibold">NHTSA Oversight History</h2><p className="text-sm text-neutral-600 mt-1">Crash reporting and ADS oversight proposals sit outside the FMVSS vehicle design rules.</p><OversightHistory events={data.federal_oversight} /></section>
    <section className="mt-7"><div className="flex flex-wrap justify-between items-end gap-2"><div><h2 className="text-xl font-semibold">FMVSS Change History</h2><p className="text-sm text-neutral-600 mt-1">ADS design rulemakings and a related steering-control change. The numbers list every standard amended by each tracked final rule; one rulemaking may amend several standards.</p></div><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/policy_tracker.json`} className="text-sm text-[#184f95] underline">Download JSON ↗</a></div>
      <StageGuide />
      <FmvssExplorer events={events} />
      <details className="viz-card p-5 mt-3"><summary className="font-semibold cursor-pointer">Earlier Requests for Comment ({early.length})</summary><p className="text-sm text-neutral-600 mt-2">These notices sought input before specific proposed amendments; they did not change a standard.</p><div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">{early.map(item => <a key={item.id} href={item.source_url} target="_blank" rel="noreferrer" className="text-sm text-[#184f95] underline">{displayDate(item.date)} · {item.title} ↗</a>)}</div></details>
    </section>
    <div className="mt-6 text-xs text-neutral-500">Reviewed {data.as_of} · Data source: {source === "R2" ? "R2 live record" : "reviewed site snapshot"}. <Link href="/policy/federal-legislation" className="underline">Continue to federal legislation →</Link></div>
  </main>;
}

export function StateTracker() {
  const { data, source } = usePolicyData();
  const [selected, setSelected] = useState("CA");
  const [filter, setFilter] = useState("");
  const [section, setSection] = useState<"regulations" | "legislation">("regulations");
  const state = data.states.find(s => s.code === selected) ?? data.states[0];
  const categoryByAbbrev = useMemo(() => Object.fromEntries(data.states.map(s => [s.code, s.enacted_legislation ? (s.executive_order_history ? "both" : "law") : (s.executive_order_history ? "order" : "none")])), [data]);
  const regulatoryEvents = data.state_events.filter(e => e.state === state.code && !["legislation", "executive_order"].includes(e.instrument));
  const history = data.state_events.filter(e => e.state === state.code && ["legislation", "executive_order"].includes(e.instrument)).sort(sortHistory);
  return <main className="max-w-7xl px-5 sm:px-8 py-8">
    <p className="eyebrow">Policy Trackers / State</p>
    <h1 className="text-4xl font-semibold mt-3 text-[#0b1d33]">State Policies</h1>
    <p className="mt-3 text-base text-neutral-600 max-w-3xl">Select a state to explore its AV operating framework, agency oversight, laws and executive orders, and bills under consideration.</p>
    <PolicyNav active="states" />
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="min-w-0">
        <section className="viz-card p-5">
          <div className="eyebrow">AV Policy Map · 50 States + D.C.</div>
          <p className="mt-2 text-sm text-neutral-600">Colors show enacted legislation and executive order history. An earlier action may no longer be in force.</p>
          <div className="mt-5"><StateTileMap states={data.states} categoryByAbbrev={categoryByAbbrev} categories={categories} selectedAbbrev={state.code} onStateClick={setSelected} /></div>
          <label className="block text-sm font-semibold mt-5" htmlFor="state-policy-search">Find a State</label>
          <input id="state-policy-search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="State name or abbreviation" className="block mt-2 w-full rounded border border-neutral-300 p-2 text-sm" />
          {filter.trim() && <div className="flex flex-wrap gap-1.5 mt-3 max-h-28 overflow-y-auto">{data.states.filter(s => `${s.name} ${s.code}`.toLowerCase().includes(filter.toLowerCase())).map(s => <button key={s.code} type="button" onClick={() => { setSelected(s.code); setFilter(""); }} aria-pressed={state.code === s.code} className={`rounded px-2.5 py-1.5 text-sm border ${state.code === s.code ? "bg-[#123b69] text-white" : "border-neutral-200"}`}>{s.name}</button>)}</div>}
        </section>
      </div>
      <div className="min-w-0">
        <div className="flex gap-2 mb-4" role="tablist" aria-label={`${state.name} policy information`}>
          {([ ["regulations", "Regulations"], ["legislation", "Legislation & Orders"] ] as const).map(([key, label]) =>
            <button key={key} type="button" role="tab" id={`state-${key}-tab`} aria-selected={section === key} aria-controls={`state-${key}-panel`} onClick={() => setSection(key)} className={`rounded-lg px-5 py-3 text-sm font-semibold border transition-colors ${section === key ? "bg-[#123b69] border-[#123b69] text-white" : "bg-white border-neutral-200 text-[#123b69] hover:border-[#80a9d0]"}`}>{label}</button>
          )}
        </div>
        {section === "regulations" ? <section id="state-regulations-panel" role="tabpanel" aria-labelledby="state-regulations-tab" className="viz-card p-6 sm:p-7" aria-live="polite">
          <p className="eyebrow">{state.code} · Regulatory Framework</p>
          <h2 className="text-2xl font-semibold mt-2">{state.name}</h2>
          <p className="mt-4 font-semibold text-[#123b69]">{state.framework}</p>
          <p className="text-sm leading-relaxed text-neutral-700 mt-2">{state.analysis}</p>
          <h3 className="font-semibold mt-5">Responsible Authority</h3>
          <p className="text-sm text-neutral-700 mt-2">{state.oversight}</p>
          {regulatoryEvents.length > 0 && <div className="border-t border-neutral-200 mt-5 pt-4"><h3 className="font-semibold">Agency Rules and Decisions</h3>{regulatoryEvents.map(event => <div key={event.id} className="mt-4"><p className="font-medium text-sm">{event.title}</p><p className="text-sm text-neutral-600 mt-1">{event.takeaway ?? event.summary}</p><a className="text-sm underline text-[#184f95]" href={event.source_url} target="_blank" rel="noreferrer">Agency Record ↗</a></div>)}</div>}
        </section> : <div id="state-legislation-panel" role="tabpanel" aria-labelledby="state-legislation-tab" className="space-y-4" aria-live="polite"><section className="viz-card p-6 sm:p-7">
          <p className="eyebrow">Legislation and Executive Orders</p>
          <h2 className="text-xl font-semibold mt-2">{state.name} · Policy History</h2>
          <p className="text-sm text-neutral-600 mt-3">{history.length} indexed {history.length === 1 ? "action" : "actions"}. Current or in-effect actions appear first, followed by the rest from newest to oldest. This history is selective. “Current Status Not Confirmed” means an action is documented but its present legal effect has not been checked.</p>
          {history.length ? <StateHistoryExplorer key={state.code} stateCode={state.code} history={history} /> : <p className="text-sm text-neutral-600 mt-4">No statewide AV-specific law or executive order identified in this review.</p>}
          <p className="text-sm text-neutral-500 mt-6">Reviewed {state.verified_at} · {source === "R2" ? "R2 Live Record" : "Reviewed Site Snapshot"}. <a className="underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/policy_tracker.json`}>Download JSON ↗</a></p>
        </section><LegislativeBillsPanel jurisdiction={state.code} /></div>}
      </div>
    </div>
  </main>;
}

// Keep the old URL usable for previously shared links.
export function StateLegislationTracker() { return <StateTracker />; }

export function CityTracker() {
  const { data, source } = usePolicyData();
  const [selected, setSelected] = useState("New York City");
  const places = [...new Set(data.city_events.map(e => e.jurisdiction))].sort();
  const events = data.city_events.filter(e => e.jurisdiction === selected).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return <main className="max-w-6xl px-8 py-8"><Intro level="Cities" description="City policies can involve test permits, street and curb rules, safety coordination, or a state-led approval process. The entries distinguish those roles and show their primary city sources." /><PolicyNav active="cities" /><div className="grid lg:grid-cols-[.65fr_1.35fr] gap-3"><section className="viz-card p-5"><h2 className="font-semibold">City Research Index</h2><div className="mt-3 space-y-1">{places.map(place => <button onClick={() => setSelected(place)} key={place} className={`w-full text-left rounded px-3 py-2 text-sm ${place === selected ? "bg-[#0b1d33] text-white" : "hover:bg-neutral-100"}`}>{place}<span className="float-right opacity-60">{data.city_events.filter(e => e.jurisdiction === place)[0].state}</span></button>)}</div><p className="text-xs text-neutral-500 mt-4">Six initial cities with documented policy or oversight actions. More cities can be added as verified events in the same schema.</p></section><section className="viz-card p-5" aria-live="polite"><div className="eyebrow">Municipal Policy</div><h2 className="text-2xl font-semibold mt-2">{selected}</h2><div className="space-y-5 mt-5">{events.map(item => <article key={item.id} className="border-t border-neutral-200 pt-4"><div className="text-xs uppercase tracking-wide text-neutral-500">{[statusLabel(item.instrument), displayDate(item.date), statusLabel(item.status)].filter(Boolean).join(" · ")}</div><h3 className="font-semibold mt-2">{item.title}</h3><p className="text-sm leading-relaxed text-neutral-700 mt-2">{item.summary}</p><a className="text-sm underline text-[#184f95] inline-block mt-3" href={item.source_url} target="_blank" rel="noreferrer">City source ↗</a></article>)}</div><p className="text-xs text-neutral-500 mt-6">Reviewed {data.as_of} · {source === "R2" ? "R2 live record" : "reviewed site snapshot"}. <Link href="/policy/states" className="underline">See the state framework →</Link></p></section></div></main>;
}
