import Link from "next/link";
import { notFound } from "next/navigation";
import { currentCompanyProfiles } from "@/lib/companyData";
export async function generateStaticParams() { return (await currentCompanyProfiles()).map(c => ({ slug:c.slug })); }
export default async function DevelopmentsPage({params}: {params:Promise<{slug:string}>}) {
  const {slug} = await params;
  const company = (await currentCompanyProfiles()).find(c => c.slug === slug);
  if (!company) notFound();
  const coverage = company.developments.filter(item => item.kind !== "deployment evidence").sort((a,b)=>b.date.localeCompare(a.date));
  const evidence = company.developments.filter(item => item.kind === "deployment evidence").sort((a,b)=>b.date.localeCompare(a.date));
  return <div className="max-w-4xl px-8 py-8">
    <Link href="/manufacturers" className="text-sm underline text-[#184f95]">← All manufacturers</Link>
    <p className="eyebrow mt-8">Company developments</p><h1 className="text-4xl font-semibold tracking-tight text-[#0b1d33] mt-3">{company.name}</h1>
    <p className="text-base text-neutral-600 mt-3">Company-specific operating, product, regulatory, and partnership developments from announcements, filings, and media. Each item identifies the source type and links to the original.</p>
    <h2 className="text-xl font-semibold mt-8">Developments</h2>
    {coverage.length ? <ol className="mt-4 border-l-2 border-[#cde2fb] ml-2 space-y-4">{coverage.map(item => <li className="pl-5 relative" key={item.source}><span className="absolute -left-[6px] top-3 h-2.5 w-2.5 bg-[#256abf] rounded-full" /><article className="viz-card p-5"><div className="eyebrow">{item.date} · {item.kind} · {item.publisher}</div><h3 className="text-xl font-semibold mt-2">{item.headline}</h3><p className="text-sm text-neutral-700 mt-2">{item.summary}</p><a href={item.source} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm underline text-[#184f95]">Original source ↗</a></article></li>)}</ol> : <p className="viz-card p-5 text-sm mt-4">No verified announcement or media item has been indexed for this company yet.</p>}
    <details className="viz-card p-5 mt-7"><summary className="font-semibold cursor-pointer">Operating evidence ({evidence.length})</summary><p className="text-sm text-neutral-600 mt-2">These dated records document markets in the Observatory. Their dates are source or verification dates, not necessarily service launch dates.</p><ul className="mt-3 divide-y divide-neutral-200">{evidence.map(item => <li key={item.source+item.headline} className="py-3 text-sm"><div className="text-neutral-500">{item.date}</div><a href={item.source} target="_blank" rel="noreferrer" className="underline text-[#184f95]">{item.headline} ↗</a></li>)}</ul></details>
    <p className="mt-7 text-sm text-neutral-500">This is a curated chronology through September 2026, not a live or exhaustive news feed. Announcements and reported future plans do not establish that a service is operating.</p>
  </div>;
}
