"use client";
import {useMemo,useState} from "react";

type Inv={
  id:string; company:string; status:"Open"|"Closed"; action:string; opened:string; closed?:string;
  subject:string; product:string; population?:string; summary:string; source:string; sourceLabel:string;
};

const investigations:Inv[]=[
  {
    id:"AQ-2026-Cybercab",company:"Tesla",status:"Open",action:"Audit Query",opened:"2026-09-04",
    subject:"Cybercab self-certification",product:"Tesla Cybercab",population:"Not stated",
    summary:"NHTSA opened an Audit Query to examine the basis for Tesla's self-certification that Cybercab complies with applicable FMVSS, including requirements written around vehicles with traditional human controls.",
    source:"https://www.nhtsa.gov/press-releases/investigation-tesla-cybercab-self-certification",sourceLabel:"NHTSA"
  },
  {
    id:"PE25012",company:"Tesla",status:"Open",action:"Preliminary Evaluation",opened:"2025-10-07",
    subject:"Traffic-safety violations with FSD engaged",product:"Tesla vehicles equipped with FSD (Supervised) or FSD (Beta)",population:"2,882,566 estimated",
    summary:"ODI is examining reports of FSD-commanded traffic-law violations, including proceeding against red signals, entering opposing lanes, and using incorrect lanes at intersections.",
    source:"https://static.nhtsa.gov/odi/inv/2025/INOA-PE25012-19171.pdf",sourceLabel:"ODI opening resume"
  },
  {
    id:"EA26002",company:"Tesla",status:"Open",action:"Engineering Analysis",opened:"2026-03-18",
    subject:"FSD collisions in reduced roadway visibility",product:"2016–2026 Model S/X; 2017–2026 Model 3; 2020–2026 Model Y; 2023–2026 Cybertruck with FSD",population:"3,203,754 estimated",
    summary:"ODI upgraded its reduced-visibility investigation to an Engineering Analysis focused on whether FSD detects degraded roadway-visibility conditions and warns drivers with sufficient time to respond.",
    source:"https://static.nhtsa.gov/odi/inv/2026/INOA-EA26002-10023.pdf",sourceLabel:"ODI opening resume"
  },
  {
    id:"PE24016",company:"Waymo",status:"Open",action:"Preliminary Evaluation",opened:"2024-05-13",
    subject:"Unexpected ADS behavior",product:"Waymo 5th Generation ADS",population:"444 estimated",
    summary:"ODI opened the evaluation after reports of single-party crashes and potential traffic-law violations, including collisions with stationary objects, driving into opposing lanes, and entering construction zones.",
    source:"https://static.nhtsa.gov/odi/inv/2024/INOA-PE24016-12382.pdf",sourceLabel:"ODI opening resume"
  },
  {
    id:"PE24015",company:"Zoox",status:"Open",action:"Preliminary Evaluation",opened:"2024-05-10",
    subject:"Unexpected ADS braking",product:"Zoox ADS-equipped passenger vehicles",population:"Not stated",
    summary:"ODI opened the evaluation after two reported rear-end collisions in which Zoox ADS-equipped vehicles braked unexpectedly in response to nearby road users.",
    source:"https://static.nhtsa.gov/odi/inv/2024/INIM-PE24015-13296.pdf",sourceLabel:"ODI information request"
  },
  {
    id:"AQ23001",company:"Zoox",status:"Closed",action:"Audit Query",opened:"2023-03-03",closed:"2025-08-04",
    subject:"Purpose-built vehicle certification",product:"Zoox purpose-built vehicles",population:"64",
    summary:"NHTSA examined the process and technical basis for Zoox's self-certification. The AQ closed after Zoox sought and received a demonstration exemption from applicable FMVSS for the subject vehicles.",
    source:"https://static.nhtsa.gov/odi/inv/2023/INCLA-AQ23001-11826.pdf",sourceLabel:"ODI closing resume"
  },
  {
    id:"PE23018",company:"Cruise",status:"Closed",action:"Preliminary Evaluation",opened:"2023-10-16",
    subject:"ADS behavior around pedestrians",product:"Cruise ADS-equipped vehicles",population:"Not stated",
    summary:"ODI examined whether Cruise ADS-equipped vehicles exercised appropriate caution around pedestrians. The evaluation closed after a related recall and after Cruise ceased public-road ADS operations.",
    source:"https://static.nhtsa.gov/odi/inv/2023/INCLA-PE23018-11022.pdf",sourceLabel:"ODI closing resume"
  },
  {
    id:"PE22014",company:"Cruise",status:"Closed",action:"Preliminary Evaluation",opened:"2022-12-12",closed:"2024-08-20",
    subject:"Hard braking and immobilizations",product:"Cruise ADS",population:"Not stated",
    summary:"ODI assessed unexpected hard braking and vehicle immobilizations. The evaluation closed after Cruise filed recall 24E-067 and software remedies reduced hard-braking incidents.",
    source:"https://static.nhtsa.gov/odi/inv/2022/INCLA-PE22014-10746.pdf",sourceLabel:"ODI closing resume"
  },
  {
    id:"EA22002",company:"Tesla",status:"Closed",action:"Engineering Analysis",opened:"2022-06-08",closed:"2024-04-25",
    subject:"Autopilot driver engagement and misuse",product:"Tesla vehicles equipped with Autopilot",population:"Not stated",
    summary:"ODI examined Autopilot crashes, driver-engagement controls, and foreseeable misuse. The analysis closed after Tesla recall 23V838, while NHTSA stated the investigation identified a safety gap between driver expectations and system capabilities.",
    source:"https://static.nhtsa.gov/odi/inv/2022/INCLA-EA22002-14498.pdf",sourceLabel:"ODI closing resume"
  }
];

function dateLabel(x:string){return new Date(x+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});}

export default function InvestigationTracker(){
  const [company,setCompany]=useState("All");
  const [status,setStatus]=useState("All");
  const companies=["All",...Array.from(new Set(investigations.map(x=>x.company))).sort()];
  const rows=useMemo(()=>investigations.filter(x=>(company==="All"||x.company===company)&&(status==="All"||x.status===status)),[company,status]);
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
      <div className="text-xs text-neutral-500 pb-2">{rows.length} record{rows.length===1?"":"s"} shown</div>
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
          <a href={r.source} className="text-sm text-[#184f95] underline whitespace-nowrap">{r.sourceLabel} ↗</a>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-sm">
          <div><div className="text-xs text-neutral-500">Opened</div><div className="font-medium mt-1">{dateLabel(r.opened)}</div></div>
          <div><div className="text-xs text-neutral-500">Closed</div><div className="font-medium mt-1">{r.closed?dateLabel(r.closed):"—"}</div></div>
          <div><div className="text-xs text-neutral-500">Product / system</div><div className="font-medium mt-1">{r.product}</div></div>
          <div><div className="text-xs text-neutral-500">Population</div><div className="font-medium mt-1">{r.population??"Not stated"}</div></div>
        </div>
      </article>)}
    </div>

    <p className="text-xs leading-relaxed text-neutral-500 mt-4">
      Tracker scope: NHTSA Office of Defects Investigation matters and related audit queries materially involving ADS, FSD, Autopilot, or purpose-built automated vehicles. Status reflects the latest NHTSA opening/closing material indexed here; an open record should not be read as a finding of defect or noncompliance.
    </p>
  </div>;
}