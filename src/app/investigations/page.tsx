import InvestigationTracker from "../../components/InvestigationTracker";

export default function InvestigationsPage(){
  return <main className="max-w-6xl px-5 sm:px-8 py-8">
    <p className="eyebrow">Federal Oversight</p>
    <h1 className="text-4xl font-semibold text-[#0b1d33] mt-2">NHTSA Investigations and Voluntary Recalls</h1>
    <p className="text-base leading-relaxed text-neutral-600 mt-3 max-w-4xl">
      Search NHTSA investigations and safety recalls involving automated driving. Investigations and recalls are separate categories, organized chronologically, with official records and linked cases where available.
    </p>
    <InvestigationTracker />
  </main>;
}