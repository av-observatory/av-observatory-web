"use client";

import { useState } from "react";
import { displayDate } from "@/lib/policyTracker";
import { useLegislationData, type Bill } from "@/lib/legislationTracker";

const tracked = new Set(["introduced", "engrossed", "enrolled", "pending", "pending_carryover", "to_governor", "passed", "vetoed", "failed", "signed", "enacted", "chaptered"]);
const stages = [
  ["introduced", "Introduced"], ["committee", "Committee"], ["floor", "Floor Action"],
  ["passed_legislature", "Passed"], ["executive", "Executive Action"], ["law", "Enacted"],
] as const;
type Stage = typeof stages[number][0];
type ProcessBill = Omit<Bill, "progress_stage" | "stage_dates" | "hearings"> & { progress_stage?: Stage; stage_dates?: Partial<Record<Stage, string>>; hearings?: {date:string; time?:string; description?:string; source_url:string}[] };

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function LegislativeTimeline({ bill, asOf }: { bill: Bill; asOf: string }) {
  const record = bill as unknown as ProcessBill;
  const stage = record.progress_stage ?? (bill.status === "to_governor" ? "executive" : "introduced");
  const current = stages.findIndex(([key]) => key === stage);
  const hearing = record.hearings?.[0];
  const terminal = bill.status === "vetoed" || bill.status === "failed";
  return <div className="mt-5 border-t border-neutral-200 pt-4">
    <div className="flex flex-wrap justify-between gap-2"><h5 className="text-sm font-semibold text-[#0b1d33]">Path to law</h5><span className="text-sm text-neutral-600">{terminal ? bill.status === "vetoed" ? "Vetoed" : "Failed" : `At: ${stages[current]?.[1] ?? "Introduced"}`}</span></div>
    <ol className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3" aria-label={`Legislative progress: ${stages[current]?.[1] ?? "Introduced"}`}>
      {stages.map(([key, label], index) => <li key={key} aria-current={index === current && !terminal ? "step" : undefined} className="min-w-0">
        <div className={`h-2 rounded-sm ${index === current && !terminal ? "bg-[#123b69]" : index < current ? "bg-[#80a9d0]" : "bg-neutral-200"}`} />
        <div className={`mt-2 text-sm leading-tight ${index === current && !terminal ? "font-semibold text-[#123b69]" : index < current ? "text-neutral-700" : "text-neutral-500"}`}>{label}</div>
        {record.stage_dates?.[key] && <div className="text-sm text-neutral-600 mt-1">{displayDate(record.stage_dates[key] ?? null)}</div>}
        {key === "committee" && hearing && <a href={hearing.source_url} target="_blank" rel="noreferrer" className="block text-sm text-[#184f95] underline mt-1">{hearing.date >= asOf ? "Hearing listed" : "Past hearing listed"} · {displayDate(hearing.date)} ↗</a>}
      </li>)}
    </ol>
    {hearing?.description && <p className="text-sm text-neutral-600 mt-3">{hearing.description}{hearing.time ? ` · ${hearing.time}` : ""}. Check the linked bill record for changes.</p>}
    <p className="text-sm text-neutral-600 mt-3">Committee hearings and floor debates or votes appear only when verified. Passed means final legislative approval (both chambers where applicable). Enacted means it became law; an effective date may be later.</p>
  </div>;
}

function ResolutionTimeline({ bill }: { bill: Bill }) {
  const current = bill.status === "passed" ? 2 : bill.progress_stage === "committee" ? 1 : 0;
  const labels = ["Introduced", "Committee", "Adopted"];
  return <div className="mt-5 border-t border-neutral-200 pt-4"><h5 className="text-sm font-semibold text-[#0b1d33]">Resolution Progress</h5><ol className="grid grid-cols-3 gap-2 mt-3" aria-label={`Resolution progress: ${labels[current]}`}>{labels.map((label, index) => <li key={label} aria-current={index === current ? "step" : undefined}><div className={`h-2 rounded-sm ${index === current ? "bg-[#123b69]" : index < current ? "bg-[#80a9d0]" : "bg-neutral-200"}`} /><div className={`mt-2 text-sm ${index === current ? "font-semibold text-[#123b69]" : "text-neutral-600"}`}>{label}</div></li>)}</ol><p className="text-sm text-neutral-600 mt-3">This House resolution would direct a study. It does not go to the governor or become a statute.</p></div>;
}

function BillCard({ bill, asOf }: { bill: Bill; asOf: string }) {
  return <article className="rounded-lg border border-neutral-200 p-4 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong className="text-[#184f95]">{bill.number}</strong><span className="rounded-full bg-[#e8f0fa] px-2.5 py-1 font-medium text-[#123b69]">{statusLabel(bill.status)}</span></div>
    <h4 className="font-semibold mt-2 text-[#0b1d33]">{bill.title}</h4>
    <p className="mt-2 text-sm text-neutral-700 leading-relaxed">{bill.summary}</p>
    {!bill.summary_reviewed_at && <p className="mt-1 text-sm text-neutral-500">Machine-indexed description; verify against bill text.</p>}
    {bill.measure_type === "resolution" ? <ResolutionTimeline bill={bill} /> : <LegislativeTimeline bill={bill} asOf={asOf} />}
    <p className="mt-3 text-sm text-neutral-600"><strong>Latest Indexed Action · {displayDate(bill.last_action_date)}</strong><br />{bill.last_action}</p>
    <div className="flex flex-wrap gap-4 mt-3 text-sm"><a href={bill.source_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">Bill and actions ↗</a><a href={bill.repository_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">Source index ↗</a></div>
  </article>;
}

export function LegislativeBillsPanel({ jurisdiction }: { jurisdiction: string }) {
  const { data, source } = useLegislationData();
  const [selectedId, setSelectedId] = useState("");
  const federal = jurisdiction === "US";
  const bills = (federal ? data.federal : data.state_bills.filter(b => b.jurisdiction === jurisdiction))
    .filter(b => tracked.has(b.status)).sort((a, b) => b.last_action_date.localeCompare(a.last_action_date));
  const selectedBill = bills.find(b => b.id === selectedId) ?? bills[0];
  const state = data.states.find(s => s.code === jurisdiction);
  return <section className="viz-card p-5 mt-6" aria-label={`${federal ? "Federal" : state?.name ?? jurisdiction} legislative bill tracker`}>
    <div className="flex flex-wrap justify-between items-start gap-3"><div><div className="eyebrow">Separate legislative tracker · {federal ? "Congress" : state?.name ?? jurisdiction}</div><h2 className="text-xl font-semibold mt-2 text-[#0b1d33]">Legislative Bills</h2></div><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/legislation_tracker.json`} className="text-sm underline text-[#184f95]">Download bill data ↗</a></div>
    <p className="mt-3 text-sm text-neutral-700">Proposals and their latest indexed actions. The tracker distinguishes passage from becoming law. {federal ? "119th Congress." : "State records are indexed from NCSL's 2026 AV bill database."}</p>
    {bills.length ? <div className={`grid gap-3 mt-4 ${federal ? "md:grid-cols-[.8fr_1.2fr]" : "xl:grid-cols-[.8fr_1.2fr]"}`}>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-neutral-200 divide-y divide-neutral-200" aria-label="Select a bill">{bills.map(bill => <button key={bill.id} type="button" onClick={() => setSelectedId(bill.id)} aria-pressed={selectedBill.id === bill.id} className={`w-full text-left px-3 py-3 border-l-4 ${selectedBill.id === bill.id ? "bg-[#eaf2fa] border-[#123b69]" : "bg-white border-transparent hover:bg-neutral-50"}`}><span className="block text-sm font-semibold text-[#0b1d33]">{bill.number} · {bill.title}</span><span className="block text-sm text-neutral-700 mt-1 leading-snug">{bill.takeaway ?? bill.summary}</span><span className="block text-sm text-neutral-500 mt-1">{statusLabel(bill.status)} · {displayDate(bill.last_action_date)}</span></button>)}</div>
      <div aria-live="polite" key={selectedBill.id}><BillCard bill={selectedBill} asOf={data.as_of} /></div>
    </div> : <div className="rounded-lg border border-dashed border-neutral-300 p-4 mt-4 text-sm text-neutral-700">No AV bill indexed for {state?.name ?? jurisdiction} in this reviewed snapshot. This does not establish that the legislature has none. <a href={state?.repository_url ?? "https://www.congress.gov/"} className="underline text-[#184f95]" target="_blank" rel="noreferrer">Search the source repository ↗</a></div>}
    <p className="mt-4 text-sm text-neutral-500">{source === "R2" ? `Live index refreshed ${data.as_of}` : `Reviewed snapshot ${data.as_of}; state index last reviewed ${data.state_index_reviewed}`}. Follow each bill link for changes after that date.</p>
  </section>;
}
