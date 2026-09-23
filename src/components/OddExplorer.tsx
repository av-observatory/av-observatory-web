"use client";

import { useMemo, useState } from "react";
import { UsStateMap } from "@/components/UsStateMap";

type OperationalLocation = {
  company: string;
  state: string;
  market: string;
  lat: number;
  lon: number;
  phase: string;
  status: string;
  mode: string;
  geometry_basis: string;
  source_url: string;
  source_date?: string;
  geometry_path?: string;
  note?: string;
};

const BASIS_LABELS: Record<string,string> = {
  official_polygon: "Official polygon",
  digitized_official_map: "Digitized official map",
  authorized_admin_area: "Authorized administrative area",
  observed_s2_footprint: "Observed S2 footprint",
  route_corridor: "Route corridor",
  city_point_only: "City point only",
};

export function OddExplorer({ locations }: { locations: OperationalLocation[] }) {
  const companies = useMemo(()=>Array.from(new Set(locations.map(d=>d.company))).sort(),[locations]);
  const states = useMemo(()=>Array.from(new Set(locations.map(d=>d.state))).sort(),[locations]);
  const modes = useMemo(()=>Array.from(new Set(locations.map(d=>d.mode))).sort(),[locations]);
  const phases = useMemo(()=>Array.from(new Set(locations.map(d=>d.phase))).sort(),[locations]);
  const [company,setCompany]=useState("ALL");
  const [state,setState]=useState("ALL");
  const [mode,setMode]=useState("ALL");
  const [phase,setPhase]=useState("deployment");

  const rows=useMemo(()=>locations.filter(d =>
    (company==="ALL"||d.company===company) &&
    (state==="ALL"||d.state===state) &&
    (mode==="ALL"||d.mode===mode) &&
    (phase==="ALL"||d.phase===phase)
  ),[locations,company,state,mode,phase]);

  const markers=rows.map(d=>({
    name:d.market,
    coordinates:[d.lon,d.lat] as [number,number],
    company:d.company,
    status:d.status,
    mode:d.mode,
  }));

  const polygonCount=rows.filter(d=>d.geometry_basis!=="city_point_only").length;

  return <div>
    <div className="viz-card p-4">
      <div className="grid md:grid-cols-4 gap-3">
        <label className="filter-label">Company
          <select className="filter-select" value={company} onChange={e=>setCompany(e.target.value)}>
            <option value="ALL">All companies</option>
            {companies.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="filter-label">State
          <select className="filter-select" value={state} onChange={e=>setState(e.target.value)}>
            <option value="ALL">All states</option>
            {states.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="filter-label">Phase
          <select className="filter-select" value={phase} onChange={e=>setPhase(e.target.value)}>
            <option value="ALL">Testing + deployment</option>
            {phases.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="filter-label">Mode
          <select className="filter-select" value={mode} onChange={e=>setMode(e.target.value)}>
            <option value="ALL">All modes</option>
            {modes.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
      </div>
    </div>

    <div className="grid lg:grid-cols-[1.55fr_.45fr] gap-3 mt-3">
      <div className="viz-card p-4">
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <h2 className="text-xl font-semibold">Operating markets</h2>
          <span className="text-sm text-neutral-500">{rows.length} markets</span>
        </div>
        <UsStateMap markers={markers} />
        <div className="text-xs text-neutral-500 mt-2">Orange points are market locations. Default view is deployment. Testing ODDs are kept separate and can be selected with the Phase filter.</div>
      </div>
      <div className="grid gap-3 content-start">
        <div className="viz-card p-4"><div className="text-3xl font-semibold tabular-nums">{new Set(rows.map(d=>d.company)).size}</div><div className="text-sm text-neutral-500">companies</div></div>
        <div className="viz-card p-4"><div className="text-3xl font-semibold tabular-nums">{new Set(rows.map(d=>d.state)).size}</div><div className="text-sm text-neutral-500">states</div></div>
        <div className="viz-card p-4"><div className="text-3xl font-semibold tabular-nums">{polygonCount}</div><div className="text-sm text-neutral-500">markets with non-point geometry identified</div></div>
      </div>
    </div>

    <div className="viz-card mt-3 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-left text-neutral-500"><tr><th>Company</th><th>Market</th><th>State</th><th>Phase</th><th>Status</th><th>Mode</th><th>Geometry</th><th>Source</th></tr></thead>
        <tbody>
          {rows.map((d,i)=><tr key={i} className="border-t border-neutral-100">
            <td className="font-medium">{d.company}</td>
            <td>{d.market}</td>
            <td>{d.state}</td>
            <td>{d.phase}</td>
            <td>{d.status.replaceAll("_"," ")}</td>
            <td>{d.mode}</td>
            <td>{BASIS_LABELS[d.geometry_basis] ?? d.geometry_basis}</td>
            <td><a href={d.source_url} target="_blank" rel="noreferrer" className="underline">source</a></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
