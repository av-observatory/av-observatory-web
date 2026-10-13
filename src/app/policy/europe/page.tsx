import { promises as fs } from "fs";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Europe Policy Tracker | AV Observatory", description: "Country-level testing, deployment, incident, periodic-reporting and data-access requirements." };
import path from "path";
import { EuropePolicyExplorer } from "@/components/EuropePolicyExplorer";

async function loadJson<T>(filename:string):Promise<T>{
  const file=path.join(process.cwd(),"public","data",filename);
  return JSON.parse(await fs.readFile(file,"utf-8"));
}

type CountryRow={
  country:string; iso2:string; eu:boolean; evidence:string; scope:string; summary:string;
  incident_reporting:number; periodic_reporting:number; exposure_reporting:number; event_data:number;
  regulator_access:number; public_access:number; fixed_deadline:number; permit_specific:number; eu_type_approval_layer:number;
  sources:string[];
  open_data:number|null; avs_authorized:number|null; authorization_evidence:string; authorization_note:string; open_data_note:string;
};
type Dataset={
  dataset:string; research_cutoff:string; methodology:string;
  common_eu_layer:{source:string;[key:string]:string|number};
  dimensions:{key:string;label:string;description?:string}[];
  policy_elements:{key:string;label:string;description?:string}[];
  countries:CountryRow[];
};

export default async function EuropePolicyPage(){
  const data=await loadJson<Dataset>("europe_av_policy.json");
  const primary=data.countries.filter(c=>c.evidence.startsWith("A")).length;
  const incident=data.countries.filter(c=>c.incident_reporting===1).length;
  const exposure=data.countries.filter(c=>c.exposure_reporting===1).length;

  return <div className="max-w-7xl px-4 sm:px-8 py-6">
    <p className="eyebrow mb-3">Europe · Policy tracker</p>
    <h1 className="text-4xl font-semibold tracking-tight max-w-4xl">Europe Policy Tracker</h1>
    <p className="mt-2 text-sm text-neutral-600 max-w-4xl">
      Country-level testing, deployment, incident, periodic-reporting and data-access requirements.
    </p>

    <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2.5">
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Jurisdictions tracked</div><div className="text-2xl font-semibold mt-1">{data.countries.length}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Primary-source evidence</div><div className="text-2xl font-semibold mt-1">{primary}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Incident reporting established</div><div className="text-2xl font-semibold mt-1">{incident}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Exposure reporting established</div><div className="text-2xl font-semibold mt-1">{exposure}</div></div>
    </div>

    <section className="mt-6">
      <EuropePolicyExplorer data={data}/>
    </section>

    <section className="mt-5">
      <div className="viz-card p-4">
        <div className="eyebrow">Common EU layer</div>
        <h2 className="text-xl font-semibold mt-1">Regulation (EU) 2022/1426</h2>
        <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
          For vehicles within the covered fully automated ADS type-approval route, the EU layer adds manufacturer safety-critical occurrence notification, periodic reporting, exposure-normalized safety information and supporting-data access. It is approval-linked and does not replace national testing or service-authorisation rules.
        </p>
        <a href={data.common_eu_layer.source} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm underline">EU regulation source →</a>
      </div>

    </section>
  </div>;
}
