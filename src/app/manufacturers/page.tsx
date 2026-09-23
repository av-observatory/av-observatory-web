import Link from "next/link";
import { currentCompanyProfiles } from "@/lib/companyData";
import { ManufacturerExplorer } from "@/components/ManufacturerExplorer";
export default async function ManufacturersPage() {
  const companies = await currentCompanyProfiles();
  return <main className="max-w-6xl px-8 py-8">
    <p className="eyebrow">U.S. operator directory</p><h1 className="text-4xl font-semibold tracking-tight text-[#0b1d33] mt-3">Manufacturers and operators</h1>
    <p className="mt-3 text-base text-neutral-600 max-w-3xl">Select an operator for its service, approach, partnerships, and sourced developments. Profiles cover current U.S. deployment evidence; a testing permit alone does not qualify.</p>
    <a className="inline-block mt-3 text-sm text-[#184f95] underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/manufacturer_profiles.json`}>Download Profile and Development Data ↗</a>
    <ManufacturerExplorer companies={companies} />
    <p className="mt-5 text-sm text-neutral-600">For testing-only companies and permit holders, see <Link href="/deployment" className="underline text-[#184f95]">Deployment and permits</Link>. This directory is tied to current evidence in the Observatory, not a complete census of every U.S. AV manufacturer.</p>
  </main>;
}
