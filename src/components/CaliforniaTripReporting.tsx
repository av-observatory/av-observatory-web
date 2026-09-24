"use client";

import { useMemo, useState } from "react";
import { ActivityMonthlyRow, monthLabel } from "@/lib/activity";
import { ActivityExplorer } from "@/components/ActivityExplorer";
import { CaCrashRates, type CaCrashRateDataset } from "@/components/CaCrashRates";
import { ActivityCompositeStats, ActivityWaitingTime, ActivityVmtUtilization, ActivityParkingEstimate } from "@/components/ActivityEfficiency";

const NAMES: Record<string, string> = { PSG0038152: "Waymo", PSG0039080: "Cruise" };
const PROGRAMS: Record<string, string> = { driverless: "Driverless", drivered_pilot: "Drivered Pilot", unspecified: "Program Unspecified" };

export function CaliforniaTripReporting({ rows, waymoRates }: { rows: ActivityMonthlyRow[]; waymoRates: CaCrashRateDataset }) {
  const companies = useMemo(() => [...new Set(rows.map(row => row.operator_tcpid))].sort((a, b) =>
    (NAMES[a] ?? a).localeCompare(NAMES[b] ?? b)), [rows]);
  const [companyId, setCompanyId] = useState(companies.includes("PSG0038152") ? "PSG0038152" : companies[0] ?? "");
  const company = NAMES[companyId] ?? companyId;
  const programs = useMemo(() => [...new Set(rows.filter(row => row.operator_tcpid === companyId && row.total_trips !== null)
    .map(row => row.program))].sort((a, b) => a === "driverless" ? -1 : b === "driverless" ? 1 : a.localeCompare(b)), [rows, companyId]);
  const [chosenProgram, setChosenProgram] = useState("");
  const program = programs.includes(chosenProgram) ? chosenProgram : programs[0] ?? "";
  const selectedRows = useMemo(() => rows.filter(row => row.operator_tcpid === companyId && row.program === program && row.total_trips !== null), [rows, companyId, program]);
  const latest = [...selectedRows].sort((a, b) => b.calendar_year - a.calendar_year || b.calendar_month - a.calendar_month)[0];

  return <>
    <div className="viz-card p-4 mt-6 flex flex-wrap items-end gap-4">
      <label className="filter-label flex-1 min-w-[220px]">Company
        <select className="filter-select" value={companyId} onChange={e => { setCompanyId(e.target.value); setChosenProgram(""); }}>
          {companies.map(id => <option key={id} value={id}>{NAMES[id] ?? id}</option>)}
        </select>
      </label>
      {programs.length > 1 && <label className="filter-label flex-1 min-w-[220px]">Program
        <select className="filter-select" value={program} onChange={e => setChosenProgram(e.target.value)}>
          {programs.map(id => <option key={id} value={id}>{PROGRAMS[id] ?? id}</option>)}
        </select>
      </label>}
      <p className="text-sm text-neutral-600">{latest ? `Latest Reported Month: ${monthLabel(latest.calendar_year, latest.calendar_month)} · ${PROGRAMS[program] ?? program}` : "No reported trip records for this company."}</p>
    </div>

    {selectedRows.length > 0 && <>
      <section className="mt-5"><ActivityCompositeStats rows={selectedRows} company={company} /></section>
      {companyId === "PSG0038152" && program === "driverless" && <CaCrashRates data={waymoRates} />}
      <section className="mt-7"><div className="flex items-baseline justify-between gap-3 mb-2"><h2 className="text-xl font-semibold tracking-tight">Passenger Activity</h2><span className="text-sm text-neutral-500">{company} · {PROGRAMS[program] ?? program}</span></div><div className="viz-card p-4"><ActivityExplorer rows={selectedRows} /></div></section>
      <section className="mt-7"><h2 className="text-xl font-semibold tracking-tight mb-2">Waiting Time</h2><ActivityWaitingTime rows={selectedRows} /></section>
      <section className="mt-7"><h2 className="text-xl font-semibold tracking-tight mb-2">VMT and Utilization</h2><ActivityVmtUtilization rows={selectedRows} /></section>
      <section className="mt-7"><h2 className="text-xl font-semibold tracking-tight mb-2">Estimated Stationary Time</h2><ActivityParkingEstimate rows={selectedRows} /></section>
    </>}
    <div className="mt-5 text-sm text-neutral-500 max-w-4xl leading-relaxed">
      CPUC Periods: P1 = unassigned after a trip and before accepting the next trip; P2 = en route to pickup after accepting a trip; P3 = passenger aboard.
      Non-passenger VMT is P1 + P2. Estimated stationary P1 time uses a 14 mph assumed average moving speed and is not directly reported by CPUC.
    </div>
  </>;
}
