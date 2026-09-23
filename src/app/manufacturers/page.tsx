import Link from "next/link";
import { currentCompanyProfiles } from "@/lib/companyData";
export default async function ManufacturersPage() {
  const companies = await currentCompanyProfiles();
  return <div className="max-w-6xl px-8 py-8">
    <p className="eyebrow">U.S. operator directory</p><h1 className="text-4xl font-semibold tracking-tight text-[#0b1d33] mt-3">Manufacturers and operators</h1>
    <p className="mt-3 text-base text-neutral-600 max-w-3xl">Companies with current U.S. deployment evidence in the Observatory. The directory includes passenger and freight services; a testing permit alone does not qualify. Profiles distinguish documented partnerships from research still pending.</p>
    <div className="grid md:grid-cols-2 gap-3 mt-7">{companies.map(c => <article className="viz-card p-5" key={c.slug}>
      <div className="flex justify-between gap-4"><h2 className="text-xl font-semibold text-[#0b1d33]">{c.name}</h2><Link href={`/manufacturers/${c.slug}/developments`} className="text-sm text-[#184f95] underline shrink-0">Developments →</Link></div>
      <dl className="mt-4 text-sm space-y-3"><div><dt className="font-semibold">Service</dt><dd className="text-neutral-700 mt-1">{c.service}</dd></div><div><dt className="font-semibold">Approach</dt><dd className="text-neutral-700 mt-1">{c.approach}</dd></div><div><dt className="font-semibold">Partnerships</dt><dd className="text-neutral-700 mt-1">{c.partnerships}</dd></div></dl>
      {c.source && <a href={c.source} target="_blank" rel="noreferrer" className="block mt-4 text-sm text-[#184f95] underline">Profile source ↗</a>}
    </article>)}</div>
    <p className="mt-5 text-sm text-neutral-600">For testing-only companies and permit holders, see <Link href="/deployment" className="underline text-[#184f95]">Deployment and permits</Link>. This directory is tied to current evidence in the Observatory, not a complete census of every U.S. AV manufacturer.</p>
  </div>;
}
