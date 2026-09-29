"use client";
import {useMemo,useState} from "react";
import {useInvestigationsData} from "@/lib/investigations";

function dateLabel(x:string|null|undefined){
  if(!x) return "—";
  return new Date(x+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
}

export default function InvestigationTracker(){
  const {data,source}=useInvestigationsData();
  const investigations=data.investigations;
  const [company,setCompany]=useState("All");
  const [status,setStatus]=useState("All");
  const companies=["All",...Array.from(new Set(investigations.map(x=>x.company))).sort()];
  const rows=useMemo(()=>investigations.filter(x=>(company==="All"||x.company===company)&&(status==="All"||x.status===status)),[investigations,company,status]);
  const open=investigations.filter(x=>x.status==="Open").length;
  const tesla=investigations.filter(x=>x.company==="Tesla").length;

  return <div className="mt-7">
    <div className="grid sm:grid-cols-3 gap-3">
      <div className="viz-card p-4"><div className="text-xs text-neutral-500">Investigations indexed</div><div className="text-3xl font-semibold mt-1">{investigations.length}</div></div>
      <div className="viz-card p-4"><div className="text-xs text-neutral-500">Open</div><div className="text-3xl font-semibold mt-1">{open}</div></div>
      <div className="viz-card p-4"><div className="text-xs text-neutral-500">Tesla records</div><div className="text-3xl font-semibold mt-1">{tesla}</div></div>
    </div>

    <div className="viz-card p-4 mt-4 flex flex-wrap gap-3 items-end">
      <label className="text-sm"><span className="block text-xs text-neutral-500 mb-1">Company</span><select value={company} onChange={e=>setCompany(e.target.value)} className="border border-[#cfd9e3] rounded px-3 py-2 bg-white">{companies.map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="text-sm"><span className="block text-xs text-neutral-500 mb-1">Status</span><select value={status} onChange={e=>setStatus(e.target.value)} className="border border-[#cfd9e3] rounded px-3 py-2 bg-white">{["All","Open","Closed"].map(x=><option key={x}>{x}</option>)}</select></label>
      <div className="text-xs text-neutral-500 pb-2">{rows.length} record{rows.length===1?"":"s"} shown · {source==="R2"?"live R2 feed":"site cache"}</div>
    </div>

    <div className="grid gap-3 mt-4">
      {rows.map(r=><article key={r.id} className="viz-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-semibold rounded-full px-2 py-1 ${r.status==="Open"?"bg-[#e8f4ed] text-[#236b4b]":"bg-[#eef1f4] text-neutral-600"}`}>{r.status}</span>
              <span className="text-xs text-neutral-500">{r.action}</span>
              <span className="text-xs font-mono text-[#345b7b]">{r.id}</span>
            </div>
            <h2 className="text-xl font-semibold text-[#0b1d33] mt-2">{r.company} · {r.subject}</h2>
            <p className="text-sm text-neutral-600 mt-2 max-w-4xl">{r.summary}</p>
          </div>
          <a href={r.source} className="text-sm text-[#184f95] underline whitespace-nowrap">{("source_label" in r && r.source_label) ? r.source_label : "NHTSA"} ↗</a>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-sm">
          <div><div className="text-xs text-neutral-500">Opened</div><div className="font-medium mt-1">{dateLabel(r.opened)}</div></div>
          <div><div className="text-xs text-neutral-500">Closed</div><div className="font-medium mt-1">{dateLabel(r.closed)}</div></div>
          <div><div className="text-xs text-neutral-500">Product / system</div><div className="font-medium mt-1">{r.product}</div></div>
          <div><div className="text-xs text-neutral-500">NHTSA ID</div><div className="font-medium mt-1">{r.id}</div></div>
        </div>
      </article>)}
    </div>

    <p className="text-xs leading-relaxed text-neutral-500 mt-4">
      The live tracker is derived from NHTSA investigation data stored in append-only R2 history. The checked-in JSON is only a fallback cache for site availability. An open investigation is not a finding of defect or noncompliance.
    </p>
  </div>;
}
