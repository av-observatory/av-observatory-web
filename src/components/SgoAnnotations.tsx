import { ReferenceLine } from "recharts";
import analysis from "../../public/data/sgo_shift_analysis.json";
import trendEvents from "../../public/data/sgo_trend_events.json";
import { monthLabel } from "@/lib/activity";

type Break = { month: string; period_end: string; direction: string; headline: string; note: string; service: string[]; odd: string[]; fleet: string[] };
type Series = { breaks: Break[] };
export type Annotation = { month: string; short: string; kind: "event" | "break"; category: string; detail: string; url?: string; source?: string; evidence?: Break };

const COLORS: Record<string, string> = { service: "#184f95", odd: "#b8741a", fleet: "#2a8a5a", break: "#3d4651" };
const NAMES: Record<string, string> = { service: "Expanded service", odd: "Operating domain", fleet: "Fleet", break: "Trend change" };

export function annotationsFor(name: string, months: Set<string>): Annotation[] {
  const series = (analysis.series as unknown as Record<string, Series>)[name];
  const out: Annotation[] = [];
  for (const e of trendEvents.events) {
    if (e.category === "rule") continue;
    if (!(name === "All companies" ? e.national : e.companies.includes(name))) continue;
    const [y, m] = e.month.split("-").map(Number);
    const month = monthLabel(y, m);
    if (months.has(month)) out.push({ month, short: e.short, kind: "event", category: e.category, detail: `${e.title}. ${e.text}`, url: e.source_url, source: e.source_label });
  }
  for (const b of series?.breaks ?? []) {
    if (months.has(b.month)) out.push({ month: b.month, short: `${b.direction === "faster" ? "▲ Faster" : "▼ Slower"} · ${b.note}`, kind: "break", category: "break", detail: b.headline, evidence: b });
  }
  const order = (m: string) => Date.parse(`1 ${m}`);
  return out.sort((a, b) => order(a.month) - order(b.month) || (a.kind === "break" ? -1 : 1));
}

const LANES = 6;
const textWidth = (t: string) => Math.min(t.length * 5.4 + 12, 240);

function Pill({ viewBox, text, color, row, anchorRight }: { viewBox?: { x?: number }; text: string; color: string; row: number; anchorRight: boolean }) {
  const x = viewBox?.x ?? 0;
  const w = textWidth(text);
  const left = Math.max(2, anchorRight ? x - w + 3 : x - 3);
  const y = 2 + row * 17;
  const shown = w >= 240 ? text.slice(0, 42) + "…" : text;
  return <g>
    <line x1={x} x2={x} y1={y + 14} y2={y + 17} stroke={color} />
    <rect x={left} y={y} width={w} height={14} rx={3} fill="#fff" stroke={color} strokeWidth={1} />
    <text x={left + 6} y={y + 10.5} fontSize={9.5} fontWeight={600} fill={color}>{shown}</text>
  </g>;
}

/** Recharts needs ReferenceLine elements as direct chart children, so this returns an array.
 *  Labels are packed into lanes by estimated pixel position so they do not overlap; a label
 *  that finds no free lane keeps its line and is listed below the chart instead. */
export function annotationLines(list: Annotation[], months: string[], width: number) {
  const plotLeft = 68, plot = Math.max(200, (width || 700) - plotLeft - 16);
  const xOf = (m: string) => plotLeft + (months.indexOf(m) + 0.5) * plot / Math.max(months.length, 1);
  const lanes: number[] = Array(LANES).fill(-1e9);
  return list.map(a => {
    const x = xOf(a.month), w = textWidth(a.short);
    const anchorRight = x + w > plotLeft + plot + 10;
    const from = anchorRight ? x - w : x - 3, to = anchorRight ? x + 3 : x + w;
    const lane = lanes.findIndex(end => end < from);
    if (lane >= 0) lanes[lane] = to + 4;
    return <ReferenceLine key={a.month + a.short} x={a.month} stroke={COLORS[a.category]} strokeOpacity={a.kind === "break" ? 0.9 : 0.55} strokeDasharray={a.kind === "break" ? "0" : "3 3"}
      label={lane < 0 ? undefined : (p: { viewBox?: { x?: number } }) => <Pill viewBox={p.viewBox} text={a.short} color={COLORS[a.category]} row={lane} anchorRight={anchorRight} />} />;
  });
}

export function AnnotationLegend({ list }: { list: Annotation[] }) {
  if (list.length === 0) return <p className="text-sm text-neutral-600 mt-2">No material change in trend and no sourced milestones for this period.</p>;
  return <div className="mt-3 border-t border-[#dce5ec] pt-3">
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">{Object.entries(NAMES).map(([k, n]) => <span key={k}><span className="inline-block h-2 w-2 rounded-full mr-1 align-middle" style={{ background: COLORS[k] }} />{n}</span>)}</div>
    <ul className="mt-2 space-y-1.5 text-sm">{list.map(a => <li key={a.month + a.short} className="flex gap-2">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[a.category] }} />
      <span><strong className="text-[#152b45]">{a.month} · {a.short}.</strong>{" "}
        {a.kind === "event" ? <><span className="text-neutral-700">{a.detail}</span> <a href={a.url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">{a.source} ↗</a></>
          : <details className="inline"><summary className="inline cursor-pointer text-[#184f95]">Evidence from the reports</summary>
            <div className="mt-1 text-neutral-700">{a.detail}
              {(["service", "odd", "fleet"] as const).map(g => a.evidence && a.evidence[g].length > 0 && <div key={g} className="mt-1"><span className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS[g] }}>{NAMES[g]}</span>
                <ul className="list-disc pl-5">{a.evidence[g].map(f => <li key={f}>{f}</li>)}</ul></div>)}</div></details>}
      </span></li>)}</ul>
    <p className="text-xs text-neutral-500 mt-2">Solid lines mark where the slope of monthly reports changes, found by fitting straight-line segments to the data. Dashed lines mark sourced public milestones. Milestones are context, not proven causes. The newest months can be undercounted because about 8% of crashes are filed a month late.</p>
  </div>;
}
