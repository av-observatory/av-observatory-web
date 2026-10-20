import analysis from "../../public/data/sgo_shift_analysis.json";
import trendEvents from "../../public/data/sgo_trend_events.json";
import { monthLabel } from "@/lib/activity";

type Break = { month: string; period_end: string; direction: string; evidence: string[]; coincident_events: { month: string; title: string; text: string; source_label: string; source_url: string }[] };
type Series = { breaks: Break[]; rule_effects: { month: string; text: string }[]; segments: { start: string; end: string; avg_per_month: number }[] };

export function shiftSeries(name: string): Series | undefined {
  return (analysis.series as unknown as Record<string, Series>)[name];
}

export function shiftMarkers(name: string) {
  return (shiftSeries(name)?.breaks ?? []).map((b, i) => ({ label: b.month, text: String(i + 1) }));
}

function publicEvents(name: string) {
  return trendEvents.events.filter(e => name === "All companies" ? e.national : e.companies.includes(name))
    .map(e => { const [y, m] = e.month.split("-").map(Number); return { ...e, label: monthLabel(y, m) }; });
}

export function SgoShiftNotes({ name }: { name: string }) {
  const s = shiftSeries(name);
  if (!s) return <p className="text-sm text-neutral-600 mt-2">Too few reports for a trend analysis.</p>;
  const used = new Set(s.breaks.flatMap(b => b.coincident_events.map(e => e.title)));
  const others = publicEvents(name).filter(e => !used.has(e.title));
  return <div className="mt-3 border-t border-[#dce5ec] pt-3">
    <div className="text-sm font-semibold text-[#152b45]">What explains the shifts</div>
    <p className="text-xs text-neutral-500 mt-0.5">Breaks are where the slope of monthly reports changes, found by fitting straight-line segments to the data (analysis through {analysis.complete_through}). The evidence lists facts computed from the SGO reports and public mileage data on this site. Coincident events are context from public sources, not proven causes.</p>
    {s.breaks.length === 0
      ? <p className="text-sm text-neutral-700 mt-2">No material change in trend: reports average {s.segments[0]?.avg_per_month ?? 0} a month between {s.segments[0]?.start} and {s.segments[s.segments.length - 1]?.end}, so there is no shift to explain.</p>
      : <ol className="mt-2 space-y-3">{s.breaks.map((b, i) => <li key={b.month} className="flex gap-2.5 text-sm">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#123b69] text-xs font-bold text-white">{i + 1}</span>
        <div><strong className="text-[#152b45]">{b.month} to {b.period_end} · Reports {b.direction === "faster" ? "begin growing faster" : "stop growing or turn down"}.</strong>
          <ul className="mt-1 list-disc pl-5 space-y-1 text-neutral-700">{b.evidence.map(f => <li key={f}>{f}</li>)}</ul>
          {b.coincident_events.map(e => <p key={e.title} className="mt-1.5 text-neutral-700"><span className="font-semibold text-[#152b45]">Coincides with: </span>{e.title}. {e.text} <a href={e.source_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">{e.source_label} ↗</a></p>)}
        </div></li>)}</ol>}
    {s.rule_effects.length > 0 && <div className="mt-3"><div className="text-sm font-semibold text-[#152b45]">Reporting-rule changes</div>
      <ul className="mt-1 list-disc pl-5 space-y-1 text-sm text-neutral-700">{s.rule_effects.map(r => <li key={r.month}>{r.text}</li>)}</ul></div>}
    {others.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer text-[#184f95] font-semibold">Other public milestones for context ({others.length})</summary>
      <ul className="mt-2 space-y-1.5 text-neutral-700">{others.map(e => <li key={e.month + e.title}><strong>{e.label} · {e.title}.</strong> {e.text} <a href={e.source_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">{e.source_label} ↗</a></li>)}</ul></details>}
  </div>;
}
