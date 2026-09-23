import Link from "next/link";
import { notFound } from "next/navigation";
import { currentCompanyProfiles } from "@/lib/companyData";
import { DevelopmentsExplorer } from "@/components/ManufacturerExplorer";
export async function generateStaticParams() { return (await currentCompanyProfiles()).map(c => ({ slug:c.slug })); }
export default async function DevelopmentsPage({params}: {params:Promise<{slug:string}>}) {
  const {slug} = await params;
  const company = (await currentCompanyProfiles()).find(c => c.slug === slug);
  if (!company) notFound();
  const coverage = company.developments.filter(item => item.kind !== "activity evidence").sort((a,b)=>b.date.localeCompare(a.date));
  const evidence = company.developments.filter(item => item.kind === "activity evidence").sort((a,b)=>b.date.localeCompare(a.date));
  return <div className="max-w-4xl px-8 py-8">
    <Link href="/manufacturers" className="text-sm underline text-[#184f95]">← All manufacturers</Link>
    <p className="eyebrow mt-8">Company developments</p><h1 className="text-4xl font-semibold tracking-tight text-[#0b1d33] mt-3">{company.name}</h1>
    <p className="text-base text-neutral-600 mt-3">Company-specific operating, product, regulatory, and partnership developments from announcements, filings, and media. Each item identifies the source type and links to the original.</p>
    <h2 className="text-xl font-semibold mt-8">Developments</h2>
    <DevelopmentsExplorer items={coverage} />
    <details className="viz-card p-5 mt-7"><summary className="font-semibold cursor-pointer">Operating evidence ({evidence.length})</summary><p className="text-sm text-neutral-600 mt-2">These dated records document markets in the Observatory. Their dates are source or verification dates, not necessarily service launch dates.</p><ul className="mt-3 divide-y divide-neutral-200">{evidence.map(item => <li key={item.source+item.headline} className="py-3 text-sm"><div className="text-neutral-500">{item.date}</div><a href={item.source} target="_blank" rel="noreferrer" className="underline text-[#184f95]">{item.headline} ↗</a></li>)}</ul></details>
    <p className="mt-7 text-sm text-neutral-500">This is a curated chronology through September 2026, not a live or exhaustive news feed. Announcements and reported future plans do not establish that a service is operating.</p>
  </div>;
}
