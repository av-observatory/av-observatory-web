import { promises as fs } from "fs";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Europe Policy Tracker | AV Observatory", description: "Country-level testing, deployment, incident, periodic-reporting and data-access requirements." };
import path from "path";
import { EuropePolicyExplorer } from "@/components/EuropePolicyExplorer";

async function loadJson<T>(filename:string):Promise<T>{
  const file=path.join(process.cwd(),"public","data",filename);
  return JSON.parse(await fs.readFile(file,"utf-8"));
}

import type { CountryRow } from "@/components/EuropePolicyExplorer";
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
  const incident=data.countries.filter(c=>c.incident_reporting===1&&c.incident_primary).length;
  const exposure=data.countries.filter(c=>c.exposure_reporting===1).length;

  return <div className="max-w-7xl px-4 sm:px-8 py-6">
    <p className="eyebrow mb-3">Europe · Policy tracker</p>
    <h1 className="text-4xl font-semibold tracking-tight max-w-4xl">Europe Policy Tracker</h1>
    <p className="mt-2 text-sm text-neutral-600 max-w-4xl">
      Country-level testing, deployment, incident, periodic-reporting and data-access requirements.
    </p>

    <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2.5">
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Jurisdictions tracked</div><div className="text-2xl font-semibold mt-1">{data.countries.length}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Countries with primary sources</div><div className="text-2xl font-semibold mt-1">{primary}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Sourced incident-report duties</div><div className="text-2xl font-semibold mt-1">{incident}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Distance-reporting duties</div><div className="text-2xl font-semibold mt-1">{exposure}</div></div>
    </div>

    <section className="mt-6">
      <EuropePolicyExplorer data={data}/>
    </section>

    <section id="eu-authorization" className="mt-5 scroll-mt-8 viz-card p-5 sm:p-6">
      <div className="eyebrow">EU approval and national permission</div>
      <h2 className="text-2xl font-semibold mt-1">Does EU approval let an AV operate anywhere?</h2>
      <p className="mt-3 text-sm leading-relaxed max-w-4xl"><strong>No. EU type approval is not a fallback driverless operating permit.</strong> It addresses the vehicle and its automated driving system. A proposed test or service must also comply with the host country’s road-use and transport-service rules.</p>
      <div className="grid md:grid-cols-2 gap-4 mt-4 text-sm leading-relaxed">
        <div className="rounded-lg border p-4"><h3 className="font-semibold">1. Vehicle / system approval</h3><p className="mt-2 text-neutral-600">A national approval authority applies the EU technical framework. Regulation 2022/1426 covers the ADS of specified fully automated vehicles, within the wider vehicle-approval framework. Approval establishes conformity for the covered vehicle/system and its operating limits.</p></div>
        <div className="rounded-lg border p-4"><h3 className="font-semibold">2. Permission to use roads / run a service</h3><p className="mt-2 text-neutral-600">The host country determines applicable testing permissions, operating areas, supervision and transport-service conditions. Recital 7 expressly preserves national powers over circulation and operational safety, subject to EU law.</p></div>
      </div>
      <p className="mt-4 text-sm leading-relaxed"><strong>If there is no dedicated national AV law:</strong> existing traffic law and any exemption or testing route still need to permit the intended operation. Silence is neither automatic permission nor automatic prohibition. Approval in one country does not by itself authorize a driverless service in another.</p>
      <details className="mt-4 border-t pt-4"><summary className="cursor-pointer text-sm font-semibold">The separate EU reporting duties</summary><p className="mt-3 text-sm leading-relaxed text-neutral-600">For vehicles covered by the EU ADS approval route, Annex III Part 5 adds manufacturer reporting to approval authorities: safety-critical occurrence notification, short-term occurrence reports within one month, and periodic safety reporting with exposure-related information. These manufacturer duties can apply even where this tracker has no separate national operator-reporting rule. They are not a public host-country crash database and do not grant permission to operate.</p></details>
      <div className="mt-4 flex flex-wrap gap-4 text-sm"><a href={data.common_eu_layer.source} target="_blank" rel="noreferrer" className="underline">2022/1426: recital 7 and Annex III Part 5 ↗</a><a href="https://eur-lex.europa.eu/eli/reg/2018/858/oj/eng" target="_blank" rel="noreferrer" className="underline">EU vehicle-approval framework ↗</a></div>
    </section>

  </div>;
}
