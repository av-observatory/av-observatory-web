import Link from "next/link";
import { notFound } from "next/navigation";
import { currentCompanyProfiles } from "@/lib/companyData";
export async function generateStaticParams() { return (await currentCompanyProfiles()).map(c => ({ slug:c.slug })); }
export default async function DevelopmentsPage({params}: {params:Promise<{slug:string}>}) {
  const {slug} = await params;
  const company = (await currentCompanyProfiles()).find(c => c.slug === slug);
  if (!company) notFound();
  return <div className="max-w-4xl px-8 py-8">
    <Link href="/manufacturers" className="text-sm underline text-[#184f95]">← All manufacturers</Link>
    <p className="eyebrow mt-8">Company developments</p><h1 className="text-4xl font-semibold tracking-tight text-[#0b1d33] mt-3">{company.name}</h1>
    <p className="text-base text-neutral-600 mt-3">A dated record of company-specific operating, product, regulatory, and partnership developments. Each item links to its original announcement or filing; a company announcement is identified as such.</p>
    {company.developments.length ? <ol className="mt-8 border-l-2 border-[#cde2fb] ml-2 space-y-4">{company.developments.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(item => <li className="pl-5 relative" key={item.source}><span className="absolute -left-[6px] top-3 h-2.5 w-2.5 bg-[#256abf] rounded-full" /><article className="viz-card p-5"><div className="eyebrow">{item.date} · {item.kind} · {item.publisher}</div><h2 className="text-xl font-semibold mt-2">{item.headline}</h2><p className="text-sm text-neutral-700 mt-2">{item.summary}</p><a href={item.source} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm underline text-[#184f95]">Original source ↗</a></article></li>)}</ol> : <div className="viz-card p-6 mt-8"><h2 className="font-semibold">No indexed developments yet</h2><p className="text-sm text-neutral-600 mt-2">This company has a current deployment record, but its announcement and media chronology has not yet been researched. This page will fill as sourced items are added.</p></div>}
    <p className="mt-7 text-sm text-neutral-500">The chronology is curated and does not update automatically. Coverage is incomplete and source dates may describe announcements rather than service start dates.</p>
  </div>;
}
