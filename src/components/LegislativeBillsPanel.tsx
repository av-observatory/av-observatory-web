"use client";

import { useState } from "react";
import { displayDate } from "@/lib/policyTracker";
import { useLegislationData, type Bill } from "@/lib/legislationTracker";

const active = new Set(["introduced", "engrossed", "enrolled", "pending", "pending_carryover", "to_governor"]);

function BillCard({ bill }: { bill: Bill }) {
  return <article className="rounded-lg border border-neutral-200 p-4 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong className="text-[#184f95]">{bill.number}</strong><span className="rounded-full bg-[#e8f0fa] px-2.5 py-1 font-medium capitalize text-[#123b69]">{bill.status.replaceAll("_", " ")}</span></div>
    <h4 className="font-semibold mt-2 text-[#0b1d33]">{bill.title}</h4>
    <p className="mt-2 text-sm text-neutral-700 leading-relaxed">{bill.summary}</p>
    {!bill.summary_reviewed_at && <p className="mt-1 text-sm text-neutral-500">Machine-indexed description; verify against bill text.</p>}
    <p className="mt-3 text-sm text-neutral-600"><strong>Latest indexed action · {displayDate(bill.last_action_date)}</strong><br />{bill.last_action}</p>
    <div className="flex flex-wrap gap-4 mt-3 text-sm"><a href={bill.source_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">Bill and actions ↗</a><a href={bill.repository_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">Source index ↗</a></div>
  </article>;
}

export function LegislativeBillsPanel({ jurisdiction }: { jurisdiction: string }) {
  const { data, source } = useLegislationData();
  const [selectedId, setSelectedId] = useState("");
  const federal = jurisdiction === "US";
  const bills = (federal ? data.federal : data.state_bills.filter(b => b.jurisdiction === jurisdiction))
    .filter(b => active.has(b.status)).sort((a, b) => b.last_action_date.localeCompare(a.last_action_date));
  const selectedBill = bills.find(b => b.id === selectedId) ?? bills[0];
  const state = data.states.find(s => s.code === jurisdiction);
  return <section className="viz-card p-5 mt-6" aria-label={`${federal ? "Federal" : state?.name ?? jurisdiction} legislative bill tracker`}>
    <div className="flex flex-wrap justify-between items-start gap-3"><div><div className="eyebrow">Separate legislative tracker · {federal ? "Congress" : state?.name ?? jurisdiction}</div><h2 className="text-xl font-semibold mt-2 text-[#0b1d33]">Bills in the legislature</h2></div><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/legislation_tracker.json`} className="text-sm underline text-[#184f95]">Download bill data ↗</a></div>
    <p className="mt-3 text-sm text-neutral-700">Introduced proposals and their latest indexed actions. A bill is not enacted policy. {federal ? "119th Congress." : "State records are indexed from NCSL's 2026 AV bill database."}</p>
    {bills.length ? <div className={`grid gap-3 mt-4 ${federal ? "md:grid-cols-[.8fr_1.2fr]" : "xl:grid-cols-[.8fr_1.2fr]"}`}>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-neutral-200 divide-y divide-neutral-200" aria-label="Select a bill">{bills.map(bill => <button key={bill.id} type="button" onClick={() => setSelectedId(bill.id)} aria-pressed={selectedBill.id === bill.id} className={`w-full text-left px-3 py-3 border-l-4 ${selectedBill.id === bill.id ? "bg-[#eaf2fa] border-[#123b69]" : "bg-white border-transparent hover:bg-neutral-50"}`}><span className="block text-sm font-semibold text-[#0b1d33]">{bill.number} · {bill.title}</span><span className="block text-sm text-neutral-700 mt-1 leading-snug">{bill.takeaway ?? bill.summary}</span><span className="block text-sm text-neutral-500 mt-1 capitalize">{bill.status.replaceAll("_", " ")} · {displayDate(bill.last_action_date)}</span></button>)}</div>
      <div aria-live="polite" key={selectedBill.id}><BillCard bill={selectedBill} /></div>
    </div> : <div className="rounded-lg border border-dashed border-neutral-300 p-4 mt-4 text-sm text-neutral-700">No pending AV bill indexed for {state?.name ?? jurisdiction} in this reviewed snapshot. This does not establish that the legislature has none. <a href={state?.repository_url ?? "https://www.congress.gov/"} className="underline text-[#184f95]" target="_blank" rel="noreferrer">Search the source repository ↗</a></div>}
    <p className="mt-4 text-sm text-neutral-500">{source === "R2" ? `Live index refreshed ${data.as_of}` : `Reviewed snapshot ${data.as_of}; state index last reviewed ${data.state_index_reviewed}`}. Follow each bill link for changes after that date.</p>
  </section>;
}
