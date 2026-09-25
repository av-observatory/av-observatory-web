import InvestigationTracker from "../../components/InvestigationTracker";

export default function InvestigationsPage(){
  return <main className="max-w-6xl px-5 sm:px-8 py-8">
    <p className="eyebrow">Federal Oversight</p>
    <h1 className="text-4xl font-semibold text-[#0b1d33] mt-2">NHTSA Investigation Tracker</h1>
    <p className="text-base leading-relaxed text-neutral-600 mt-3 max-w-4xl">
      Track federal defect investigations, audit queries, and engineering analyses involving automated driving systems and advanced driver-assistance systems. Tesla is included alongside ADS operators because NHTSA investigations into FSD and Autopilot directly concern automated-driving safety and oversight.
    </p>
    <InvestigationTracker />
  </main>;
}