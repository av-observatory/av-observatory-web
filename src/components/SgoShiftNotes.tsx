import analysis from "../../public/data/sgo_shift_analysis.json";
import trendEvents from "../../public/data/sgo_trend_events.json";
import { monthLabel } from "@/lib/activity";

type Ev = { category: string; month: string; title: string; text: string; source_label: string; source_url: string };
type Break = { month: string; period_end: string; direction: string; headline: string; service: string[]; odd: string[]; fleet: string[]; coincident_events: Ev[] };
type Series = { breaks: Break[]; segments: { start: string; end: string; avg_per_month: number }[] };

const GROUPS = [
  { key: "service", title: "Expanded service" },
  { key: "odd", title: "Operating domain (ODD)" },
  { key: "fleet", title: "Fleets" },
] as const;

export function shiftSeries(name: string): Series | undefined {
  return (analysis.series as unknown as Record<string, Series>)[name];
}

export function shiftMarkers(name: string) {
  return (shiftSeries(name)?.breaks ?? []).map((b, i) => ({ label: b.month, text: String(i + 1) }));
}

function publicEvents(name: string) {
  return trendEvents.events.filter(e => e.category !== "rule" && (name === "All companies" ? e.national : e.companies.includes(name)))
    .map(e => { const [y, m] = e.month.split("-").map(Number); return { ...e, label: monthLabel(y, m) }; });
}

export function SgoShiftNotes({ name }: { name: string }) {
  const s = shiftSeries(name);
  if (!s) return <p className="text-sm text-neutral-600 mt-2">Too few reports for a trend analysis.</p>;
  const used = new Set(s.breaks.flatMap(b => b.coincident_events.map(e => e.title)));
  const others = publicEvents(name).filter(e => !used.has(e.title));
  return <div className="mt-3 border-t border-[#dce5ec] pt-3">
    <div className="text-sm font-semibold text-[#152b45]">What explains the shifts</div>
    <p className="text-xs text-neutral-500 mt-0.5">Breaks are where the slope of monthly reports changes, found by fitting straight-line segments to the data through {analysis.complete_through}. Each break is explained only by expanded service, the operating domain and fleets, using facts computed from the SGO reports and public mileage on this site. Public events are context, not proven causes. The newest months can be undercounted because about 8% of crashes are filed a month late.</p>
    {s.breaks.length === 0
      ? <p className="text-sm text-neutral-700 mt-2">No material change in trend: reports average {s.segments[0]?.avg_per_month ?? 0} a month between {s.segments[0]?.start} and {s.segments[s.segments.length - 1]?.end}, so there is no shift to explain.</p>
      : <ol className="mt-2 space-y-4">{s.breaks.map((b, i) => <li key={b.month} className="flex gap-2.5 text-sm">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#123b69] text-xs font-bold text-white">{i + 1}</span>
        <div><strong className="text-[#152b45]">{b.month} to {b.period_end} · Reports {b.direction === "faster" ? "begin growing faster" : "stop growing or turn down"}.</strong>
          <p className="mt-1 text-neutral-700">{b.headline}</p>
          {GROUPS.map(g => {
            const facts = b[g.key];
            const events = b.coincident_events.filter(e => e.category === g.key);
            if (facts.length === 0 && events.length === 0) return null;
            return <div key={g.key} className="mt-2"><div className="text-xs font-semibold uppercase tracking-wide text-[#123b69]">{g.title}</div>
              <ul className="mt-0.5 list-disc pl-5 space-y-1 text-neutral-700">{facts.map(f => <li key={f}>{f}</li>)}
                {events.map(e => <li key={e.title}><span className="font-semibold text-[#152b45]">Coincides with {e.month}: </span>{e.title}. {e.text} <a href={e.source_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">{e.source_label} ↗</a></li>)}</ul></div>;
          })}
        </div></li>)}</ol>}
    {others.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer text-[#184f95] font-semibold">Other public milestones for context ({others.length})</summary>
      <ul className="mt-2 space-y-1.5 text-neutral-700">{others.map(e => <li key={e.month + e.title}><strong>{e.label} · {e.title}.</strong> {e.text} <a href={e.source_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">{e.source_label} ↗</a></li>)}</ul></details>}
  </div>;
}
