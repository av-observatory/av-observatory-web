"use client";

import { useMemo, useState } from "react";
import { displayDate, usePolicyData } from "@/lib/policyTracker";
import { useLegislationData, type Bill } from "@/lib/legislationTracker";

const TILE_POSITIONS: Record<string,[number,number]> = {
  ME:[1,11], VT:[2,10], NH:[2,11],
  WA:[3,1], ID:[3,2], MT:[3,3], ND:[3,4], MN:[3,5], WI:[3,6], MI:[3,7], NY:[3,9], MA:[3,10], RI:[3,11],
  OR:[4,1], NV:[4,2], WY:[4,3], SD:[4,4], IA:[4,5], IL:[4,6], IN:[4,7], OH:[4,8], PA:[4,9], NJ:[4,10], CT:[4,11],
  CA:[5,1], UT:[5,2], CO:[5,3], NE:[5,4], MO:[5,5], KY:[5,6], WV:[5,7], VA:[5,8], MD:[5,9], DE:[5,10],
  AZ:[6,2], NM:[6,3], KS:[6,4], AR:[6,5], TN:[6,6], NC:[6,7], SC:[6,8], DC:[6,9],
  OK:[7,4], LA:[7,5], MS:[7,6], AL:[7,7], GA:[7,8],
  TX:[8,4], FL:[8,9], AK:[9,1], HI:[9,2],
};

const ACTIVE_STATUSES = new Set(["introduced","engrossed","enrolled","pending","pending_carryover","to_governor","passed","signed","enacted","chaptered"]);
const CURRENT_LAW_STATUSES = new Set(["in_effect","current","in_effect_as_amended"]);

function statusLabel(status:string) {
  return status.replaceAll("_"," ").replace(/\b\w/g, c => c.toUpperCase());
}
function billStageLabel(bill:Bill) {
  if(["signed","enacted","chaptered"].includes(bill.status)) return "Enacted";
  if(bill.status === "to_governor") return "To Governor";
  if(bill.status === "passed") return "Passed Legislature";
  return statusLabel(bill.status);
}
function billStatusTone(status:string) {
  if(["signed","enacted","chaptered"].includes(status)) return "bg-[#dcefe9] text-[#145c48]";
  if(["to_governor","passed","enrolled"].includes(status)) return "bg-[#fff1d9] text-[#76500d]";
  return "bg-[#e8f0fa] text-[#123b69]";
}

function StateTileMap({
  selected, onSelect, counts, names,
}:{
  selected:string|null;
  onSelect:(code:string|null)=>void;
  counts:Record<string,number>;
  names:Record<string,string>;
}) {
  const max = Math.max(1,...Object.values(counts));
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <button type="button" onClick={()=>onSelect(null)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${selected===null?"bg-[#123b69] border-[#123b69] text-white":"bg-white border-neutral-200 text-[#123b69]"}`}>All States</button>
      <span className="text-xs text-neutral-500">Darker tiles = more current-session AV measures</span>
    </div>
    <div className="overflow-x-auto pb-1">
      <div className="mx-auto grid w-max grid-cols-[repeat(12,44px)] grid-rows-[repeat(9,44px)] gap-1.5 px-1" aria-label="United States legislation tile map">
        {Object.entries(TILE_POSITIONS).map(([code,[row,col]])=>{
          const count=counts[code]??0;
          const intensity=count ? 0.16 + 0.68*Math.sqrt(count/max) : 0;
          const isSelected=selected===code;
          return <button
            key={code}
            type="button"
            onClick={()=>onSelect(isSelected?null:code)}
            title={`${names[code]??code}: ${count} current-session AV measure${count===1?"":"s"}`}
            aria-pressed={isSelected}
            className={`h-11 w-11 rounded-md border text-[12px] font-bold leading-none transition hover:-translate-y-0.5 hover:shadow-sm ${isSelected?"ring-2 ring-[#0b1d33] ring-offset-1":""} ${count===0?"text-neutral-500":"text-[#0b1d33]"}`}
            style={{
              gridRow:row, gridColumn:col,
              background:count? `rgba(42,120,214,${intensity})` : "#f1f0ec",
              borderColor:isSelected?"#0b1d33":"rgba(11,29,51,.12)",
            }}
          >
            <span className="block">{code}</span>
            {count>0 && <span className="mt-1 block text-[9px] font-medium opacity-75">{count}</span>}
          </button>;
        })}
      </div>
    </div>
  </div>;
}

function BillRow({bill}:{bill:Bill}) {
  return <article className="border-t border-neutral-200 py-4 first:border-t-0">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <div className="text-sm font-semibold text-[#184f95]">{bill.jurisdiction} · {bill.number}</div>
        <h3 className="font-semibold text-[#0b1d33] mt-1">{bill.title}</h3>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${billStatusTone(bill.status)}`}>{billStageLabel(bill)}</span>
    </div>
    <p className="text-sm leading-relaxed text-neutral-700 mt-2">{bill.takeaway ?? bill.summary}</p>
    <p className="text-sm text-neutral-500 mt-2"><strong>{displayDate(bill.last_action_date)}</strong> · {bill.last_action}</p>
    <div className="flex flex-wrap gap-4 mt-2 text-sm">
      <a href={bill.source_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">Official bill record ↗</a>
      {bill.repository_url && <a href={bill.repository_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">Open States record ↗</a>}
    </div>
  </article>;
}

export function StateLegislationPage() {
  const {data:legislation,source} = useLegislationData();
  const {data:policy} = usePolicyData();
  const [selected,setSelected] = useState<string|null>(null);

  const names = useMemo(()=>Object.fromEntries(legislation.states.map(s=>[s.code,s.name])),[legislation.states]);
  const currentBills = useMemo(()=>legislation.state_bills
    .filter(b=>ACTIVE_STATUSES.has(b.status))
    .sort((a,b)=>b.last_action_date.localeCompare(a.last_action_date)),[legislation.state_bills]);
  const proposedBills = useMemo(()=>currentBills.filter(b=>!["signed","enacted","chaptered"].includes(b.status)),[currentBills]);

  const counts = useMemo(()=>{
    const out:Record<string,number>={};
    for(const bill of currentBills) out[bill.jurisdiction]=(out[bill.jurisdiction]??0)+1;
    return out;
  },[currentBills]);

  const visibleBills = selected ? proposedBills.filter(b=>b.jurisdiction===selected) : currentBills;
  const enacted = selected ? policy.state_events
    .filter(e=>e.state===selected && e.instrument==="legislation" && CURRENT_LAW_STATUSES.has(e.status))
    .sort((a,b)=>(b.date??"").localeCompare(a.date??"")) : [];

  return <main className="max-w-7xl px-5 sm:px-8 py-8">
    <p className="eyebrow">Policy Trackers / State</p>
    <h1 className="text-4xl font-semibold mt-3 text-[#0b1d33]">State Legislation</h1>
    <p className="mt-3 text-base text-neutral-600 max-w-3xl">Current-session autonomous-vehicle legislation discovered through Open States, with enacted state AV laws shown when a state is selected.</p>
    <section className="viz-card p-4">
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="min-w-0">
          <div className="eyebrow">Legislation Tile Map · 50 States + D.C.</div>
          <div className="mt-3"><StateTileMap selected={selected} onSelect={setSelected} counts={counts} names={names}/></div>
        </div>
        <div className="min-w-0 border-t border-neutral-200 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="eyebrow">{selected ? names[selected] : "National View"}</div>
          <h2 className="text-2xl font-semibold mt-2 text-[#0b1d33]">{selected ? names[selected] : "All States"}</h2>
          <p className="text-sm leading-relaxed text-neutral-600 mt-2">{selected ? "Showing enacted AV legislation and current-session proposals for this state. Select the same state again to return to all states." : "Select a state on the tile map to filter enacted and proposed AV legislation."}</p>
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="text-2xl font-semibold text-[#0b1d33]">{selected ? currentBills.filter(b=>b.jurisdiction===selected).length : currentBills.length}</div>
              <div className="text-xs text-neutral-500 mt-1">Current-session measures</div>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="text-2xl font-semibold text-[#0b1d33]">{selected ? (counts[selected] ?? 0) : Object.values(counts).filter(Boolean).length}</div>
              <div className="text-xs text-neutral-500 mt-1">{selected ? "Indexed in this state" : "States with active measures"}</div>
            </div>
          </div>
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH??""}/data/legislation_tracker.json`} className="inline-block mt-5 text-sm text-[#184f95] underline">Download legislation data ↗</a>
        </div>
      </div>
    </section>

    {selected && <section className="viz-card p-5 mt-5">
      <div className="eyebrow">{names[selected]} · Enacted</div>
      <h2 className="text-xl font-semibold mt-2">Current AV Legislation</h2>
      {enacted.length ? <div className="mt-3 divide-y divide-neutral-200">{enacted.map(item=><article key={item.id} className="py-4">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold text-[#0b1d33]">{item.title}</h3><span className="text-xs rounded-full bg-[#dcefe9] text-[#145c48] px-2.5 py-1 font-semibold">In Effect</span></div>
        <p className="text-sm text-neutral-700 mt-2 leading-relaxed">{item.takeaway ?? item.summary}</p>
        <div className="text-sm mt-2"><a href={item.source_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">Primary source ↗</a></div>
      </article>)}</div> : <p className="text-sm text-neutral-600 mt-3">No current enacted AV-specific statute is identified in the reviewed state-law dataset.</p>}
    </section>}

    <section className="viz-card p-5 mt-5">
      <div className="flex flex-wrap justify-between gap-3 items-end">
        <div>
          <div className="eyebrow">{selected ? names[selected] : "All States"} · Current Session</div>
          <h2 className="text-xl font-semibold mt-2">{selected ? "Proposed Legislation" : "Current-Session Legislation"}</h2>
          <p className="text-sm text-neutral-600 mt-1">{visibleBills.length} indexed current-session AV measure{visibleBills.length===1?"":"s"}, newest action first.</p>
        </div>
        <span className="text-xs text-neutral-500">{source==="R2"?`Live Open States index · ${legislation.as_of}`:`Site snapshot · ${legislation.as_of}`}</span>
      </div>
      {visibleBills.length ? <div className="mt-3">{visibleBills.map(bill=><BillRow key={bill.id} bill={bill}/>)}</div> : <p className="text-sm text-neutral-600 mt-4">No current-session AV bill is indexed for this state.</p>}
    </section>

    <p className="mt-5 text-xs text-neutral-500">Bill discovery uses Open States API v3 across all 50 states and D.C. Bill status and actions are machine-indexed, while linked official legislature records remain the authority. Enacted-law summaries come from the separately reviewed state policy dataset.</p>
  </main>;
}
