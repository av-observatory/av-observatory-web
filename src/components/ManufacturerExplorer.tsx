"use client";

import { useState } from "react";
import Link from "next/link";
import type { CompanyProfile, Development } from "@/lib/manufacturers";

const trucking = new Set(["Aurora", "Gatik", "Kodiak AI", "PlusAI", "Torc", "Waabi"]);
const domains: Record<string, string> = { Waymo: "waymo.com", Zoox: "zoox.com", Tesla: "tesla.com", Motional: "motional.com", Avride: "avride.ai", Beep: "ridebeep.com", "May Mobility": "maymobility.com", Nuro: "nuro.ai", WeRide: "weride.ai", Mobileye: "mobileye.com", "MOIA America": "moia.io", Aurora: "aurora.tech", Gatik: "gatik.ai", "Kodiak AI": "kodiak.ai", PlusAI: "plus.ai", Torc: "torc.ai", Waabi: "waabi.ai" };

export function ManufacturerExplorer({ companies }: { companies: CompanyProfile[] }) {
  const [selected, setSelected] = useState(companies.find(c => c.name === "Waymo")?.slug ?? companies[0]?.slug);
  const company = companies.find(c => c.slug === selected) ?? companies[0];
  if (!company) return <p>No current operator profiles are available.</p>;
  return <div className="mt-6">
    <div className="viz-card p-4 sm:p-5">
      <h2 className="text-xl font-semibold text-[#0b1d33]">Choose a company</h2>
      {[{ title: "Passenger, delivery and shuttle", items: companies.filter(c => !trucking.has(c.name)) }, { title: "Autonomous trucking", items: companies.filter(c => trucking.has(c.name)) }].map(group => group.items.length > 0 && <section key={group.title} className="mt-5"><h3 className="text-sm font-semibold text-neutral-600 mb-2">{group.title}</h3><div className="flex flex-wrap gap-2">{group.items.map(c => <button type="button" key={c.slug} onClick={() => setSelected(c.slug)} aria-pressed={company.slug === c.slug} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${company.slug === c.slug ? "border-[#123b69] bg-[#eaf2fa] text-[#0b1d33] ring-1 ring-[#123b69]" : "border-neutral-200 bg-white text-neutral-700 hover:border-[#7ca7d0]"}`}>{domains[c.name] ? <img src={`https://www.google.com/s2/favicons?domain=${domains[c.name]}&sz=64`} alt="" className="w-7 h-7 object-contain" /> : <span aria-hidden="true" className="w-7 h-7 rounded bg-neutral-100 flex items-center justify-center">{c.name[0]}</span>}{c.name}</button>)}</div></section>)}
    </div>
    <article className="viz-card p-5 sm:p-7 mt-4" aria-live="polite" key={company.slug}>
      <div className="flex flex-wrap justify-between items-start gap-3"><div><div className="eyebrow">Operator profile</div><h2 className="text-2xl font-semibold mt-2 text-[#0b1d33]">{company.name}</h2><p className="text-base text-neutral-700 mt-3 max-w-3xl">{company.service}</p></div><Link href={`/manufacturers/${company.slug}/developments`} className="rounded-md bg-[#123b69] px-4 py-2 text-sm font-semibold text-white hover:bg-[#184f95]">Company developments →</Link></div>
      <div className="grid md:grid-cols-2 gap-5 mt-6 border-t border-neutral-200 pt-5"><div><h3 className="font-semibold text-[#0b1d33]">Approach</h3><p className="text-base text-neutral-700 mt-2">{company.approach}</p></div><div><h3 className="font-semibold text-[#0b1d33]">Partnerships</h3><p className="text-base text-neutral-700 mt-2">{company.partnerships}</p></div></div>
      {company.source && <a href={company.source} target="_blank" rel="noreferrer" className="inline-block mt-5 text-sm text-[#184f95] underline">Profile source ↗</a>}
    </article>
  </div>;
}

export function DevelopmentsExplorer({ items }: { items: Development[] }) {
  const [selected, setSelected] = useState(0);
  const item = items[selected] ?? items[0];
  if (!item) return <p className="viz-card p-5 mt-4 text-base">No verified announcement or media item has been indexed for this company yet.</p>;
  return <div className="grid md:grid-cols-[.8fr_1.2fr] gap-3 mt-4 items-start"><div className="viz-card p-2 max-h-96 overflow-y-auto" aria-label="Select a development">{items.map((entry, index) => <button type="button" key={entry.source + entry.headline} aria-pressed={item === entry} onClick={() => setSelected(index)} className={`w-full text-left p-3 border-l-4 rounded-md ${item === entry ? "bg-[#eaf2fa] border-[#123b69]" : "border-transparent hover:bg-neutral-50"}`}><span className="block text-sm text-neutral-600">{entry.date} · {entry.kind}</span><span className="block text-sm font-semibold text-[#0b1d33] mt-1">{entry.headline}</span></button>)}</div><article className="viz-card p-5" key={item.source} aria-live="polite"><div className="eyebrow">{item.date} · {item.kind} · {item.publisher}</div><h3 className="text-xl font-semibold mt-3">{item.headline}</h3><p className="text-base text-neutral-700 mt-3">{item.summary}</p><a href={item.source} target="_blank" rel="noreferrer" className="inline-block mt-4 text-sm underline text-[#184f95]">Original source ↗</a></article></div>;
}
