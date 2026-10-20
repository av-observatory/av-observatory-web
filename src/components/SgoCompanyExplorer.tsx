"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_PROPS, GRID_PROPS, LEGEND_PROPS, SERIES, TOOLTIP_PROPS } from "@/lib/chartTheme";
import { useMonthAxis } from "@/components/MonthAxis";
import { isCompleteSgoMonth } from "@/lib/safety";
import { monthLabel } from "@/lib/activity";
import type { SgoIncidentRow } from "@/components/SgoDeepDive";
import type { SeriousCrash } from "@/components/SgoSeriousCrashList";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
// Co-reporting suppliers and fleet partners; the crash is attributed to the ADS developer or operator.
const PARTNERS = new Set(["General Motors", "Ford Motor Company", "PACCAR", "Transdev", "Transdev Alternative Services"]);
const TOP_CHIPS = 12;

type Row = SgoIncidentRow & { company: string; ym: number };

export function companyName(entities: string) {
  const names = entities.split(";").map(e => e.trim()).filter(Boolean).map(e =>
    e.replace(/,?\s*(LLC|Inc\.?|Corp\.?|Corporation|Incorporated|Operations|Auto)\b.*$/i, "").replace(/,\s*$/, "").trim());
  return names.find(n => !PARTNERS.has(n)) ?? names[0] ?? "Unknown";
}

function parseYm(raw: string) {
  const m = /^([A-Z]{3})-(\d{4})$/i.exec(raw || "");
  const i = m ? MONTHS.indexOf(m[1].toUpperCase()) : -1;
  return m && i >= 0 ? Number(m[2]) * 12 + i : null;
}

function severityBucket(raw: string) {
  const s = raw.toLowerCase();
  if (s.startsWith("fatal")) return "Fatal";
  if (s.startsWith("serious")) return "Serious";
  if (s.startsWith("moderate")) return "Moderate";
  if (s.startsWith("minor")) return "Minor";
  if (/^(no injur|property damage|no injured)/.test(s)) return "No injury";
  return "Unknown";
}
const SEVERITY_ORDER = ["No injury", "Minor", "Moderate", "Serious", "Fatal", "Unknown"];

function oddBucket(raw: string) {
  if (/^\[?REDACTED/i.test(raw)) return "Redacted";
  if (/^Yes/i.test(raw)) return "Within ODD";
  if (/^No/i.test(raw)) return "Outside ODD";
  return "Unknown";
}

function share(rows: Row[], pick: (r: Row) => string, order?: string[], limit = 7) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = pick(r) || "Unknown"; m.set(k, (m.get(k) ?? 0) + 1); }
  const keys = order ?? Array.from(m).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k);
  return { keys, pct: (k: string) => rows.length ? (m.get(k) ?? 0) / rows.length * 100 : 0, count: (k: string) => m.get(k) ?? 0 };
}

function vehicleName(make: string, model: string) {
  const titled = (v: string) => v.trim().toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  let mk = titled(make), md = /^i[- ]?pace$/i.test(model.trim()) ? "I-PACE" : titled(model);
  if (mk === "Jlr") mk = "Jaguar";
  if (mk && mk.toLowerCase() === md.toLowerCase()) return mk;
  return [mk, md].filter(Boolean).join(" ") || "Unknown";
}

function injuryRate(rows: Row[]) {
  const known = rows.filter(r => severityBucket(r.highest_injury_severity) !== "Unknown");
  const hurt = known.filter(r => !["No injury"].includes(severityBucket(r.highest_injury_severity)));
  return known.length ? hurt.length / known.length * 100 : 0;
}

export type Filing = { id: string; v: string; type: string; filed: string; vin: string; year: string; eng: string; op: string; time: string; ent: string; bag: string };

export function SgoCompanyExplorer({ rows, serious, filings }: { rows: SgoIncidentRow[]; serious: SeriousCrash[]; filings: Record<string, Filing[]> }) {
  const all = useMemo<Row[]>(() => rows.flatMap(r => {
    const ym = parseYm(r.incident_date);
    if (ym === null || r.automation_system_engaged !== "ADS") return [];
    if (!isCompleteSgoMonth(Math.floor(ym / 12), (ym % 12) + 1)) return [];
    return [{ ...r, company: companyName(r.reporting_entities || r.reporting_entity || ""), ym }];
  }), [rows]);

  // The newest month is still being filed. It is kept out of the totals and comparisons but shown on the chart.
  const partial = useMemo<Row[]>(() => rows.flatMap(r => {
    const ym = parseYm(r.incident_date);
    if (ym === null || r.automation_system_engaged !== "ADS" || isCompleteSgoMonth(Math.floor(ym / 12), (ym % 12) + 1)) return [];
    return [{ ...r, company: companyName(r.reporting_entities || r.reporting_entity || ""), ym }];
  }), [rows]);
  const partialYm = partial.length ? Math.max(...partial.map(r => r.ym)) : null;

  const companies = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of all) m.set(r.company, [...(m.get(r.company) ?? []), r]);
    return Array.from(m, ([name, list]) => ({ name, rows: list })).sort((a, b) => b.rows.length - a.rows.length);
  }, [all]);

  const [selected, setSelected] = useState(companies[0]?.name ?? "");
  const [picked, setPicked] = useState<{ company: string; ym: number } | null>(null);
  const current = companies.find(c => c.name === selected) ?? companies[0];
  const mine = current?.rows ?? [];
  const mineAll = useMemo(() => [...mine, ...partial.filter(r => r.company === current?.name && r.ym === partialYm)], [mine, partial, current, partialYm]);

  const months = useMemo(() => {
    if (!all.length) return [] as number[];
    const lo = Math.min(...all.map(r => r.ym)), hi = Math.max(...all.map(r => r.ym));
    return Array.from({ length: hi - lo + 1 + (partialYm !== null && partialYm > hi ? partialYm - hi : 0) }, (_, i) => lo + i);
  }, [all, partialYm]);
  const label = (ym: number) => monthLabel(Math.floor(ym / 12), (ym % 12) + 1);

  const monthly = useMemo(() => months.map(ym => ({ ym, label: label(ym), crashes: mineAll.filter(r => r.ym === ym).length })), [months, mineAll]);
  const monthlyAxis = useMonthAxis(monthly.length);
  const lastComplete = Math.max(...months.filter(m => m !== partialYm));
  const peak = useMemo(() => monthly.filter(m => m.ym !== partialYm).reduce((a, m) => (m.crashes > a.crashes ? m : a), { label: "", crashes: 0 }), [monthly]);


  if (!current) return null;
  const activeYm = picked && picked.company === current.name ? picked.ym : null;
  const chips = companies.slice(0, TOP_CHIPS);
  const rest = companies.slice(TOP_CHIPS);
  const sevMine = share(mine, r => severityBucket(r.highest_injury_severity), SEVERITY_ORDER);
  const sevAll = share(all, r => severityBucket(r.highest_injury_severity), SEVERITY_ORDER);
  const withMine = share(mine, r => r.crash_with, undefined, 8);
  const withAll = share(all, r => r.crash_with);
  const roadMine = share(mine, r => r.roadway_type, undefined, 7);
  const roadAll = share(all, r => r.roadway_type);
  const bagKeys = ["Deployed", "No Deployment Reported", "Unknown"];
  const bag = (r: Row) => (/^deployed/i.test(r.air_bag_deployment) ? "Deployed" : /^no deployment/i.test(r.air_bag_deployment) ? "No Deployment Reported" : "Unknown");
  const bagMine = share(mine, bag, bagKeys);
  const bagAll = share(all, bag, bagKeys);
  const oddMine = share(mine, r => oddBucket(r.within_odd), ["Within ODD", "Outside ODD", "Unknown", "Redacted"]);
  const oddAll = share(all, r => oddBucket(r.within_odd), ["Within ODD", "Outside ODD", "Unknown", "Redacted"]);
  const cities = Array.from(mine.reduce((m, r) => m.set(`${r.city || "Unknown"}, ${r.state || "—"}`, (m.get(`${r.city || "Unknown"}, ${r.state || "—"}`) ?? 0) + 1), new Map<string, number>())).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const vehicles = Array.from(mine.reduce((m, r) => { const k = vehicleName(r.make, r.model); return m.set(k, (m.get(k) ?? 0) + 1); }, new Map<string, number>())).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const seriousMine = serious.filter(c => companyName(c.reporting_entities) === current.name).sort((a, b) => (parseYm(b.incident_date) ?? 0) - (parseYm(a.incident_date) ?? 0));
  const recent = mine.filter(r => r.ym > lastComplete - 12).length;
  const prior = mine.filter(r => r.ym <= lastComplete - 12 && r.ym > lastComplete - 24).length;
  const industryRecent = all.filter(r => r.ym > lastComplete - 12).length;
  const myShare = mine.length / all.length * 100;
  const recentShare = industryRecent ? recent / industryRecent * 100 : 0;
  const pct = (v: number) => `${v.toFixed(1)}%`;

  return <section className="mt-7" aria-label="Company analysis">
    <p className="eyebrow">NHTSA SGO · ADS Crashes By Company</p>
    <h2 className="text-xl font-semibold tracking-tight mt-2">Company Analysis</h2>
    <p className="text-sm text-neutral-600 mt-2 max-w-4xl">Select a company to see its reported ADS crashes against the industry. Counts are SGO reports, not verified at-fault crashes, and are not adjusted for how many miles each company drives. A company that operates more vehicles will report more crashes. Crashes are attributed to the ADS developer or operator when a supplier or fleet partner co-reports.</p>

    <div className="viz-card p-4 mt-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Select a company">{chips.map(c => <button key={c.name} type="button" aria-pressed={c.name === current.name} onClick={() => setSelected(c.name)}
        className={`rounded-lg border px-3 py-2 text-sm font-medium ${c.name === current.name ? "border-[#123b69] bg-[#eaf2fa] text-[#0b1d33] ring-1 ring-[#123b69]" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}>{c.name} <span className="text-neutral-500 font-normal tabular-nums">{c.rows.length.toLocaleString()}</span></button>)}
        {rest.length > 0 && <select aria-label="More companies" className="filter-select max-w-[220px]" value={rest.some(c => c.name === current.name) ? current.name : ""} onChange={e => e.target.value && setSelected(e.target.value)}>
          <option value="">More companies ({rest.length})</option>{rest.map(c => <option key={c.name} value={c.name}>{c.name} ({c.rows.length})</option>)}</select>}
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3">
      {[[mine.length.toLocaleString(), "Reported crashes", `${pct(myShare)} of all ADS crashes`],
        [pct(injuryRate(mine)), "Crashes with any injury", `Industry ${pct(injuryRate(all))}; excludes unknown severity`],
        [String(seriousMine.length), "Serious or fatal", `${all.filter(r => ["Serious", "Fatal"].includes(severityBucket(r.highest_injury_severity))).length} industry-wide`],
        [`${recent.toLocaleString()}`, "Last 12 months", prior ? `${recent >= prior ? "+" : ""}${Math.round((recent - prior) / prior * 100)}% vs prior 12; ${pct(recentShare)} of industry` : `${pct(recentShare)} of industry`]
      ].map(([v, l, c]) => <div key={l} className="viz-card p-3 sm:p-4"><strong className="block text-2xl sm:text-3xl text-[#123b69] tabular-nums">{v}</strong><span className="text-sm text-neutral-700">{l}</span><span className="block text-xs text-neutral-500 mt-0.5">{c}</span></div>)}
    </div>

    <div className="viz-card p-4 mt-3"><div className="font-semibold">{current.name}: reported crashes by incident month</div><div className="text-sm text-neutral-500">Select a bar to see that month's crashes below; select it again to close.{partialYm !== null && ` The lighter bar, ${label(partialYm)}, is a partial month: reports are still being filed.`}</div>
      <ResponsiveContainer width="100%" height={260} onResize={monthlyAxis.onResize}>
        <BarChart data={monthly} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}><CartesianGrid {...GRID_PROPS} /><XAxis dataKey="label" {...monthlyAxis.axis} /><YAxis {...AXIS_PROPS} allowDecimals={false} />
          <Tooltip {...TOOLTIP_PROPS} /><Bar dataKey="crashes" name="Reported crashes" cursor="pointer" onClick={(_d, i) => setPicked(activeYm === monthly[i].ym ? null : { company: current.name, ym: monthly[i].ym })}>
            {monthly.map(m => <Cell key={m.ym} fill={m.ym === activeYm ? "#0b2f5f" : m.ym === partialYm ? "#9db8d9" : SERIES.blue} stroke={m.ym === partialYm ? SERIES.blue : undefined} strokeDasharray={m.ym === partialYm ? "3 2" : undefined} fillOpacity={activeYm === null || m.ym === activeYm ? 1 : 0.55} />)}</Bar></BarChart>
      </ResponsiveContainer>
    </div>

    {activeYm !== null && <MonthDetail company={current.name} ym={activeYm} rows={mineAll} monthAvg={mine.length / Math.max(1, new Set(mine.map(r => r.ym)).size)} label={label} filings={filings} partial={activeYm === partialYm} onClose={() => setPicked(null)} />}

    <div className="grid lg:grid-cols-2 gap-3 mt-3">
      <Compare title="Injury severity" subtitle={`${current.name} vs all ADS crashes`} keys={sevMine.keys} mine={sevMine.pct} all={sevAll.pct} name={current.name} />
      <Compare title="What it collided with" subtitle="Party collided with, per the SGO crash-with field" keys={withMine.keys} mine={withMine.pct} all={withAll.pct} name={current.name} />
      <Compare title="Roadway type" subtitle="Reported roadway classification" keys={roadMine.keys} mine={roadMine.pct} all={roadAll.pct} name={current.name} />
      <Compare title="Air bag deployment" subtitle="Subject vehicle or crash partner; Unknown includes incomplete reports" keys={bagMine.keys} mine={bagMine.pct} all={bagAll.pct} name={current.name} />
      <Compare title="Reported ODD status" subtitle="Unknown and redacted answers limit what can be learned" keys={oddMine.keys} mine={oddMine.pct} all={oddAll.pct} name={current.name} />
    </div>

    <div className="grid lg:grid-cols-2 gap-3 mt-3">
      <div className="viz-card p-4"><div className="font-semibold">Where crashes were reported</div>
        <table className="w-full text-sm mt-2"><tbody>{cities.map(([k, n]) => <tr key={k} className="border-t border-[#e6edf3]"><td className="py-1.5">{k}</td><td className="py-1.5 text-right tabular-nums">{n.toLocaleString()}</td><td className="py-1.5 pl-3 text-right text-neutral-500 tabular-nums w-16">{pct(n / mine.length * 100)}</td></tr>)}</tbody></table></div>
      <div className="viz-card p-4"><div className="font-semibold">Vehicle platforms</div>
        <table className="w-full text-sm mt-2"><tbody>{vehicles.map(([k, n]) => <tr key={k} className="border-t border-[#e6edf3]"><td className="py-1.5">{k}</td><td className="py-1.5 text-right tabular-nums">{n.toLocaleString()}</td><td className="py-1.5 pl-3 text-right text-neutral-500 tabular-nums w-16">{pct(n / mine.length * 100)}</td></tr>)}</tbody></table></div>
    </div>

  </section>;
}

function Compare({ title, subtitle, keys, mine, all, name }: { title: string; subtitle: string; keys: string[]; mine: (k: string) => number; all: (k: string) => number; name: string }) {
  const data = keys.map(k => ({ name: k, [name]: Number(mine(k).toFixed(1)), "All ADS crashes": Number(all(k).toFixed(1)) }));
  return <div className="viz-card p-4"><div className="font-semibold">{title}</div><div className="text-sm text-neutral-500">{subtitle}</div>
    <ResponsiveContainer width="100%" height={Math.max(240, keys.length * 44 + 60)}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 15, bottom: 5, left: 30 }}><CartesianGrid {...GRID_PROPS} /><XAxis type="number" {...AXIS_PROPS} tickFormatter={v => `${v}%`} /><YAxis type="category" dataKey="name" {...AXIS_PROPS} width={120} tick={{ fontSize: 11 }} />
        <Tooltip {...TOOLTIP_PROPS} formatter={v => `${Number(v).toFixed(1)}%`} /><Legend {...LEGEND_PROPS} /><Bar dataKey={name} fill={SERIES.blue} /><Bar dataKey="All ADS crashes" fill="#b9c4d0" /></BarChart>
    </ResponsiveContainer></div>;
}

function clock(t: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

function tally(rows: Row[], pick: (r: Row) => string) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = pick(r) || "Unknown"; m.set(k, (m.get(k) ?? 0) + 1); }
  return Array.from(m).sort((a, b) => b[1] - a[1]);
}

function MonthDetail({ company, ym, rows, monthAvg, label, filings, partial: partialLabel, onClose }: { partial: boolean; onClose: () => void; company: string; ym: number; rows: Row[]; monthAvg: number; label: (ym: number) => string; filings: Record<string, Filing[]> }) {
  const list = rows.filter(r => r.ym === ym);
  const sorted = [...list].sort((a, b) => {
    const order = ["Fatal", "Serious", "Moderate", "Minor", "No injury", "Unknown"];
    return order.indexOf(severityBucket(a.highest_injury_severity)) - order.indexOf(severityBucket(b.highest_injury_severity)) || a.city.localeCompare(b.city);
  });
  const hurt = list.filter(r => !["No injury", "Unknown"].includes(severityBucket(r.highest_injury_severity))).length;
  const blocks: [string, [string, number][]][] = [
    ["Injury severity", tally(list, r => severityBucket(r.highest_injury_severity))],
    ["Collided with", tally(list, r => r.crash_with).slice(0, 5)],
    ["Roadway", tally(list, r => r.roadway_type).slice(0, 5)],
    ["City", tally(list, r => `${r.city || "Unknown"}, ${r.state || "—"}`).slice(0, 5)],
  ];
  return <div className="viz-card p-4 sm:p-5 mt-3" aria-live="polite">
    <div className="flex items-start justify-between gap-3"><p className="eyebrow">Selected month</p><button type="button" onClick={onClose} className="text-sm text-[#184f95] underline">Close</button></div>
    <h3 className="text-lg font-semibold tracking-tight mt-1">{company} · {label(ym)}</h3>
    <p className="text-sm text-neutral-600 mt-1">{partialLabel && <strong className="text-[#98601d]">Partial month: reports are still being filed. </strong>}{list.length.toLocaleString()} reported {list.length === 1 ? "crash" : "crashes"} ({list.length >= monthAvg ? "above" : "below"} its monthly average of {monthAvg.toFixed(1)}); {hurt} with a reported injury.</p>
    {list.length === 0 ? <p className="text-sm text-neutral-600 mt-3">No crashes reported this month.</p> : <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">{blocks.map(([title, items]) => <div key={title}><div className="text-xs font-semibold uppercase tracking-wide text-[#123b69]">{title}</div>
        <ul className="mt-1 text-sm space-y-0.5">{items.map(([k, n]) => <li key={k} className="flex justify-between gap-2"><span>{k}</span><span className="tabular-nums text-neutral-600">{n}</span></li>)}</ul></div>)}</div>
      <div className="overflow-x-auto mt-4"><table className="w-full text-sm min-w-[820px]"><thead><tr className="text-left text-xs text-neutral-500"><th className="py-1.5 pr-3">When and where</th><th className="pr-3">Outcome</th><th className="pr-3">Vehicle</th><th className="pr-3">Road and ODD</th><th>SGO filing</th></tr></thead>
        <tbody>{sorted.map(r => {
          const fl = [...(filings[r.incident_id || r.report_id] ?? [])].sort((a, b) => Number(b.v) - Number(a.v) || a.id.localeCompare(b.id));
          const f = fl[0];
          const odd = oddBucket(r.within_odd);
          const bag = (r.air_bag_deployment || f?.bag || "Unknown");
          return <tr key={r.incident_id || r.report_ids} className="border-t border-[#e6edf3] align-top">
            <td className="py-2 pr-3"><div className="font-medium">{r.city || "Unknown"}, {r.state || "—"}</div><div className="text-neutral-600">{f?.time ? clock(f.time) : "Time not reported"}</div></td>
            <td className="pr-3"><div className="font-medium">{r.highest_injury_severity || "Unknown"}</div><div className="text-neutral-600">Hit {r.crash_with || "not reported"}</div><div className="text-neutral-600">Air bags: {bag}</div></td>
            <td className="pr-3"><div className="font-medium">{[f?.year, vehicleName(r.make, r.model)].filter(Boolean).join(" ")}</div>{f?.vin && f.vin.length > 3 && <div className="text-neutral-600">{f.vin}</div>}<div className="text-neutral-600">{f?.op ? `Operated by ${f.op}` : r.reporting_entities}</div>{f?.eng && <div className="text-neutral-600">{f.eng}</div>}</td>
            <td className="pr-3"><div className="font-medium">{r.roadway_type || "Unknown"}</div><div className="text-neutral-600">{odd === "Within ODD" ? "Within ODD" : odd === "Outside ODD" ? "Outside ODD" : `ODD ${odd.toLowerCase()}`}</div></td>
            <td>{fl.length === 0 ? <span className="font-mono text-xs">{r.report_ids}</span> : fl.map(x => <div key={x.id + x.v} className="text-xs"><span className="font-mono">{x.id}</span> v{x.v} · {x.type || "Report"}{x.filed ? ` · filed ${x.filed}` : ""}{fl.length > 1 && x.ent ? ` · ${x.ent}` : ""}</div>)}</td></tr>;
        })}</tbody></table></div>
      <p className="text-xs text-neutral-500 mt-2">Fields come from the latest SGO submissions. Severity is reported or alleged and does not establish fault.</p></>}
  </div>;
}
