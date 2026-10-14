import Link from "next/link";

const focusAreas = [
  {
    number: "01",
    title: "Policy and oversight",
    description: "Federal and state rules, legislation, investigations, and the agencies responsible for AV oversight.",
  },
  {
    number: "02",
    title: "Safety and community impacts",
    description: "Public crash reporting, resident complaints, and evidence about the safety of emerging AV services.",
  },
  {
    number: "03",
    title: "Deployment and operations",
    description: "Where AV services operate, how vehicles are used, and what public reporting can tell us about their activity.",
  },
];

export default function AboutPage() {
  return (
    <main id="about-observatory-page" className="max-w-5xl px-5 sm:px-8 py-10 sm:py-14 pb-16">
      <div className="max-w-[760px]">
        <p className="eyebrow">About AV Observatory</p>
        <h1 className="mt-5 max-w-[740px] text-[clamp(2.15rem,4.4vw,3.45rem)] leading-[1.14] font-semibold tracking-[-0.045em] text-[#0b1d33]">
          Independent evidence for a rapidly changing transportation system.
        </h1>
        <p className="mt-6 max-w-[660px] text-lg sm:text-xl leading-[1.65] text-[#3e4e5b]">
          AV Observatory brings together fragmented federal, state, local, and operator data to help people understand autonomous vehicle deployment, safety, operations, and community impacts.
        </p>
      </div>

      <section className="mt-14 border-t border-[#dce3e9] pt-8" aria-labelledby="what-we-track">
        <h2 id="what-we-track" className="text-2xl font-semibold tracking-tight text-[#0b1d33]">What we track</h2>
        <div className="mt-7 grid gap-0 md:grid-cols-3 md:gap-8">
          {focusAreas.map((area) => (
            <div key={area.number} className="border-t border-[#e1e6eb] py-5 md:py-0 md:border-t-0">
              <h3 className="mt-3 text-lg font-semibold tracking-tight text-[#102c46]">{area.title}</h3>
              <p className="mt-2 text-[15px] leading-[1.75] text-[#52606b]">{area.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-[#dce3e9] pt-9" aria-labelledby="why-it-exists">
        <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
          <h2 id="why-it-exists" className="text-2xl font-semibold tracking-tight text-[#0b1d33]">Why it exists</h2>
          <div className="max-w-[66ch] space-y-5 text-[15px] sm:text-base leading-[1.8] text-[#46535e]">
            <p>
              Coverage is designed to be national even when the underlying public data are not. Federal sources provide a common backbone; state-level systems add detail where reporting exists. California is currently the most data-rich state for passenger-service activity, while the Observatory&apos;s deployment and safety work spans the country.
            </p>
            <p>
              Every Observatory metric has a documented definition, formula, and source. Datasets are versioned and citable. Public government data is never gated — the Observatory&apos;s role is standardization, integration, and methodological rigor, not restricting access to public facts.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-12 border-t border-[#dce3e9] pt-9" aria-labelledby="site-management">
        <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
          <div>
            <h2 id="site-management" className="text-2xl font-semibold tracking-tight text-[#0b1d33]">Matthew Raifman</h2>
            <p className="mt-2 text-sm text-[#768492]">Site management</p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
              <a href="https://www.linkedin.com/in/mraifman" target="_blank" rel="noopener noreferrer" className="text-[#184f95] hover:underline">LinkedIn ↗</a>
              <a href="https://curvesahead.substack.com/" target="_blank" rel="noopener noreferrer" className="text-[#184f95] hover:underline">Curves Ahead ↗</a>
            </div>
          </div>
          <div className="max-w-[66ch] space-y-5 text-[15px] sm:text-base leading-[1.8] text-[#46535e]">
            <p>
              This site is managed by Dr. Matthew Raifman. Dr. Raifman is a multidisciplinary researcher and product manager working at the intersection of sustainable transportation, public health, and autonomous vehicle policy. He currently serves as the Research Lead for Policy and Autonomous Vehicles at UC Berkeley, where his research evaluates the real-world health and safety outcomes of emerging transportation technologies, infrastructure design, and infrastructure equity.
            </p>
            <p>
              Prior to his time at UC Berkeley, his professional background bridged the gap between public policy, corporate technology, and international development. He served as a Senior Manager for City Solutions at Ford Smart Mobility, senior advisor at Johns Hopkins University, a Science and Technology Policy Fellow for the U.S. Department of Energy, the transportation lead within the Maryland Governor’s Office, and as a performance management lead in the President’s Office at the World Bank Group.
            </p>
            <p>
              Dr. Raifman holds a PhD in Environmental Health from the Boston University School of Public Health, a Master in Public Policy from the Harvard Kennedy School, and a Bachelor of Arts in Economics from Tufts University.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-14 rounded-xl border border-[#dce5ed] bg-[#f1f5f8] px-6 py-7 sm:px-9 sm:py-9" aria-labelledby="support-observatory">
        <div className="max-w-[670px]">
          <h2 id="support-observatory" className="text-2xl font-semibold tracking-tight text-[#0b1d33]">Interested in funding this work?</h2>
          <p className="mt-3 text-[15px] sm:text-base leading-[1.75] text-[#46535e]">
            We are looking for sponsors to expand AV Observatory into survey and research domains.
          </p>
          <Link href="/contact/" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#184f95] underline underline-offset-4">Get in touch ↗</Link>
        </div>
      </section>

      <p className="mt-12 max-w-[66ch] border-t border-[#e1e6eb] pt-6 text-xs leading-[1.7] text-[#77848f]">
        This website is not affiliated with the University of California, and his title is used here only for identification purposes.
      </p>
    </main>
  );
}
