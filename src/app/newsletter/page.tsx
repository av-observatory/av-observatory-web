import Link from "next/link";

const subscribeHref = "https://avobservatory.substack.com/subscribe";

export default function NewsletterPage() {
  return <main className="max-w-4xl px-5 sm:px-8 py-9">
    <p className="eyebrow">Newsletter</p>
    <h1 className="text-4xl font-semibold text-[#0b1d33] mt-2">AV Observatory Brief</h1>
    <p className="text-lg leading-relaxed text-neutral-600 mt-4 max-w-3xl">
      A concise update on the policies, safety evidence, and operating data shaping autonomous vehicles in the United States.
    </p>

    <section className="mt-7 grid md:grid-cols-[1.1fr_.9fr] gap-4">
      <div className="viz-card p-6 bg-[#eef6fd]">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#527493]">What you’ll get</p>
        <h2 className="text-2xl font-semibold text-[#0b1d33] mt-2">The Observatory, distilled.</h2>
        <div className="grid gap-3 mt-5 text-sm text-neutral-700">
          <p><strong>Policy.</strong> Significant federal and state regulatory and legislative changes.</p>
          <p><strong>Safety.</strong> New crash reporting, NHTSA investigations, and resident-reporting signals.</p>
          <p><strong>Operations.</strong> Material changes in public trip, mileage, and deployment data.</p>
          <p><strong>Data notes.</strong> New datasets, revisions, and methodology changes published by the Observatory.</p>
        </div>
      </div>

      <div className="viz-card p-6 bg-[#0b1d33] text-white">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#8fc2e8]">Join the list</p>
        <h2 className="text-2xl font-semibold mt-2">Get the Brief by email.</h2>
        <p className="text-sm leading-relaxed text-slate-300 mt-3">
          Subscription is free. Subscribe on the AV Observatory Substack.
        </p>
        <a href={subscribeHref} target="_blank" rel="noreferrer" className="inline-block mt-5 rounded-md bg-[#83c6e3] text-[#082039] px-4 py-2.5 text-sm font-bold hover:bg-white">
          Join the newsletter →
        </a>
        <p className="text-xs text-slate-400 mt-3">No advertising. Unsubscribe at any time.</p>
      </div>
    </section>

    <section className="viz-card p-6 mt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Archive</p>
          <h2 className="text-2xl font-semibold text-[#0b1d33] mt-2">Issues</h2>
        </div>
        <span className="text-sm text-neutral-500">First issue in preparation</span>
      </div>
      <p className="text-sm text-neutral-600 mt-3 max-w-2xl">
        Each issue will remain available here as a permanent web archive, with direct links back to the underlying Observatory data and primary sources.
      </p>
      <div className="mt-5 rounded-lg border border-dashed border-neutral-300 p-5">
        <strong className="text-[#0b1d33]">AV Observatory Brief · Issue 001</strong>
        <p className="text-sm text-neutral-600 mt-1">A first digest of policy, safety, and operations updates is being prepared.</p>
      </div>
    </section>

    <p className="mt-6 text-sm text-neutral-600">
      Questions or corrections? <Link href="/contact" className="text-[#184f95] underline">Contact the Observatory →</Link>
    </p>
  </main>;
}
