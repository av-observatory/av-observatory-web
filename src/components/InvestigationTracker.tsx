"use client";
import {useMemo,useState} from "react";
import {useInvestigationsData} from "@/lib/investigations";
import recallSnapshot from "../../public/data/nhtsa_av_recalls.json";
import {nhtsaCardSummary,nhtsaCardTitle,nhtsaCompany} from "@/lib/nhtsaEditorial";

type Recall = (typeof recallSnapshot.recalls)[number];
type Investigation = ReturnType<typeof useInvestigationsData>["data"]["investigations"][number] & {related_recalls?:string[]};
function formatDate(value:string|null|undefined) {
  if (!value) return "Not recorded";
  return new Date(value+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
}
export default function InvestigationTracker(){
  const {data,source}=useInvestigationsData();
  const investigations:Investigation[] = useMemo(()=>data.investigations.map(r=>({...r,company:nhtsaCompany(r.company,r.product,r.subject),summary:nhtsaCardSummary(r.summary,r.subject,"investigation")})),[data.investigations]);
  const recalls:Recall[] = useMemo(()=>recallSnapshot.recalls.map(r=>({...r,summary:nhtsaCardSummary(r.summary,r.subject,"recall")})),[]);
  const [category,setCategory]=useState<"Investigations"|"Recalls">("Investigations");
  const [company,setCompany]=useState("All");
  const [status,setStatus]=useState("All");
  const [sortOrder,setSortOrder]=useState<"newest"|"oldest">("newest");
  const companies=["All",...Array.from(new Set([...investigations,...recalls].map(x=>x.company))).sort()];
  const investigationRows=useMemo(()=>investigations
    .filter(x=>(company==="All"||x.company===company)&&(status==="All"||x.status===status))
    .sort((a,b)=>sortOrder==="newest"?b.opened.localeCompare(a.opened):a.opened.localeCompare(b.opened)),[investigations,company,status,sortOrder]);
  const recallRows=useMemo(()=>recalls.filter(x=>company==="All"||x.company===company)
    .sort((a,b)=>sortOrder==="newest"?b.reported.localeCompare(a.reported):a.reported.localeCompare(b.reported)),[recalls,company,sortOrder]);
  const open=investigations.filter(x=>x.status==="Open").length;
  const closed=investigations.filter(x=>x.status==="Closed").length;
  const investigationIds=new Set(investigations.map(x=>x.id));
  const recallIds=new Set(recalls.map(x=>x.id));
  return <div className="mt-6">
    <div className="grid sm:grid-cols-3 gap-3">
      <div className="viz-card p-4"><div className="text-xs text-neutral-500">Investigations indexed</div><div className="text-3xl font-semibold mt-1">{investigations.length}</div></div>
      <div className="viz-card p-4"><div className="text-xs text-neutral-500">Open / closed investigations</div><div className="text-3xl font-semibold mt-1">{open} / {closed}</div></div>
      <div className="viz-card p-4"><div className="text-xs text-neutral-500">Recall campaigns indexed</div><div className="text-3xl font-semibold mt-1">{recalls.length}</div></div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Federal oversight category">
      {(["Investigations","Recalls"] as const).map(value=><button key={value} type="button" onClick={()=>setCategory(value)} aria-pressed={category===value} className={`px-4 py-2 rounded-lg border font-semibold text-sm ${category===value?"bg-[#123b69] border-[#123b69] text-white":"bg-white border-neutral-200 text-[#123b69]"}`}>{value}</button>)}
    </div>
    <div className="viz-card p-4 mt-3 flex flex-wrap items-end gap-3">
      <label className="text-sm"><span className="block text-xs text-neutral-500 mb-1">Company</span><select value={company} onChange={e=>setCompany(e.target.value)} className="border border-[#cfd9e3] rounded px-3 py-2 bg-white">{companies.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      {category==="Investigations" && <label className="text-sm"><span className="block text-xs text-neutral-500 mb-1">Investigation status</span><select value={status} onChange={e=>setStatus(e.target.value)} className="border border-[#cfd9e3] rounded px-3 py-2 bg-white">{["All","Open","Closed"].map(v=><option key={v} value={v}>{v}</option>)}</select></label>}
      <label className="text-sm"><span className="block text-xs text-neutral-500 mb-1">Chronological order</span><select value={sortOrder} onChange={e=>setSortOrder(e.target.value as "newest"|"oldest")} className="border border-[#cfd9e3] rounded px-3 py-2 bg-white"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      <span className="text-xs text-neutral-500 pb-2">{category==="Investigations"?investigationRows.length:recallRows.length} records shown</span>
    </div>
    <div className="grid gap-3 mt-4">
      {category==="Investigations" ? investigationRows.map(r=><article key={r.id} className="viz-card p-5">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold rounded-full px-2 py-1 ${r.status==="Open"?"bg-[#e8f4ed] text-[#236b4b]":"bg-[#eef1f4] text-neutral-700"}`}>{r.status}</span>
            <span className="text-xs text-neutral-500">{r.action}</span><span className="text-xs font-mono">{r.id}</span>
          </div>
          <h2 className="text-xl font-semibold text-[#0b1d33] mt-2">{r.company} · {nhtsaCardTitle(r.subject,r.source_detail)}</h2>
          <p className="text-sm text-neutral-700 mt-2 leading-relaxed line-clamp-5">{r.summary}</p>
          </div><a className="text-sm text-[#184f95] underline" href={r.source} target="_blank" rel="noreferrer">{r.source_label??"NHTSA"} ↗</a>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
          <div><span className="text-xs text-neutral-500">Opened</span><div className="font-semibold">{formatDate(r.opened)}</div></div>
          <div><span className="text-xs text-neutral-500">Closed</span><div className="font-semibold">{r.status==="Open"?"Still open":formatDate(r.closed)}</div></div>
          <div><span className="text-xs text-neutral-500">Product / system</span><div>{r.product}</div></div>
        </div>
        {r.related_recalls && r.related_recalls.length>0 && <div className="mt-3 border-t border-neutral-200 pt-3 text-sm"><strong>Associated NHTSA recall{r.related_recalls.length===1?"":"s"}:</strong> {r.related_recalls.map((id,i)=><span key={id}>{i?", ":""}{recallIds.has(id)?<button type="button" onClick={()=>{setCategory("Recalls");setCompany("All")}} className="text-[#184f95] underline">{id} (view recalls)</button>:id}</span>)}</div>}
      </article>) : recallRows.map(r=><article key={r.id} className="viz-card p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div><div className="flex flex-wrap gap-2 items-center"><span className="rounded-full bg-[#fff1d9] text-[#76500d] px-2 py-1 text-xs font-semibold">Safety Recall</span><span className="text-xs font-mono">{r.id}</span></div><h2 className="text-xl font-semibold text-[#0b1d33] mt-2">{r.company} · {nhtsaCardTitle(r.subject,r.source_detail)}</h2></div>
          <a href={r.source} target="_blank" rel="noreferrer" className="text-sm text-[#184f95] underline">{r.source_label} ↗</a>
        </div>
        <p className="text-sm text-neutral-700 mt-2 leading-relaxed line-clamp-5">{r.summary}</p>
        <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
          <div><span className="text-xs text-neutral-500">Reported to NHTSA</span><div className="font-semibold">{formatDate(r.reported)}</div></div>
          <div><span className="text-xs text-neutral-500">Recall / remedy</span><div>{r.status}</div></div>
          <div><span className="text-xs text-neutral-500">Remedy</span><div>{r.remedy||"See official record"}</div></div>
        </div>
        {(r.related_investigations?.length??0)>0 && <div className="mt-3 border-t border-neutral-200 pt-3 text-sm"><strong>Related investigations:</strong> {r.related_investigations.map((id,i)=><span key={id}>{i?", ":""}{investigationIds.has(id)?<button type="button" onClick={()=>{setCategory("Investigations");setCompany("All");setStatus("All")}} className="text-[#184f95] underline">{id} (view investigations)</button>:id}</span>)}</div>}
      </article>)}
    </div>
    <p className="text-xs text-neutral-500 mt-4 leading-relaxed">
      Sources: NHTSA ODI investigations and NHTSA recall campaign records. Investigations and recalls are different regulatory actions; an open case is not a finding of a defect. Investigation dates and statuses are taken from NHTSA opening and closing records. Recall remedies are not equivalent to an investigation being closed. Cases are connected only where NHTSA identifies an associated campaign. Investigation feed: {source==="R2"?"R2":"site snapshot"} · {data.observed_at}. Recall feed: {recallSnapshot.observed_at}. {recallSnapshot.coverage}
    </p>
  </div>;
}
