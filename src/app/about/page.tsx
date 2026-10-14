export default function AboutPage() {
  return (
    <div className="max-w-3xl px-8 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">About AV Observatory</h1>
      <p className="mt-6 text-neutral-700 leading-relaxed">
        AV Observatory is an independent national resource for understanding
        autonomous vehicle deployment and impacts in the United States. It
        brings together fragmented federal, state, local, and operator data
        into durable, reproducible measures of AV activity, deployment,
        safety, and community exposure.
      </p>
      <p className="mt-4 text-neutral-700 leading-relaxed">
        Coverage is designed to be national even when the underlying public
        data are not. Federal sources provide a common backbone; state-level
        systems add detail where reporting exists. California is currently
        the most data-rich state for passenger-service activity, while the
        Observatory's deployment and safety work spans the country.
      </p>
      <p className="mt-4 text-neutral-700 leading-relaxed">
        Every Observatory metric has a documented definition, formula, and
        source. Datasets are versioned and citable. Public government data is
        never gated — the Observatory's role is standardization,
        integration, and methodological rigor, not restricting access to
        public facts.
      </p>

      <section className="viz-card p-6 mt-8">
        <h2 className="text-xl font-semibold text-[#0b1d33]">Interested in funding this work?</h2>
        <p className="mt-3 text-neutral-700 leading-relaxed">
          We are looking for sponsors to expand AV Observatory into survey and research domains.
          <a href="/contact/" className="ml-1 font-semibold text-[#184f95] underline underline-offset-2">Get in touch.</a>
        </p>
      </section>
      <section className="mt-9">
        <p className="text-neutral-700 leading-relaxed">
          This site is managed by Dr. Matthew Raifman. Dr. Raifman is a multidisciplinary researcher and product manager working at the intersection of sustainable transportation, public health, and autonomous vehicle policy. He currently serves as the <strong>Research Lead for Policy and Autonomous Vehicles</strong> at UC Berkeley, where his research evaluates the real-world health and safety outcomes of emerging transportation technologies, infrastructure design, and infrastructure equity.
        </p>
        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          <a href="https://www.linkedin.com/in/mraifman" target="_blank" rel="noopener noreferrer" className="text-[#184f95] underline underline-offset-2">LinkedIn ↗</a>
          <a href="https://curvesahead.substack.com/" target="_blank" rel="noopener noreferrer" className="text-[#184f95] underline underline-offset-2">Curves Ahead · Substack ↗</a>
        </p>
        <p className="mt-4 text-sm text-neutral-600 leading-relaxed font-semibold">
          This website is not affiliated with the University of California, and his title is used here only for identification purposes.
        </p>
        <p className="mt-4 text-neutral-700 leading-relaxed">
          Prior to his time at UC Berkeley, his professional background bridged the gap between public policy, corporate technology, and international development. He served as a Senior Manager for City Solutions at Ford Smart Mobility, senior advisor at Johns Hopkins University, a Science and Technology Policy Fellow for the U.S. Department of Energy, the transportation lead within the Maryland Governor’s Office, and as a performance management lead in the President’s Office at the World Bank Group.
        </p>
        <p className="mt-4 text-neutral-700 leading-relaxed">
          Dr. Raifman holds a PhD in Environmental Health from the Boston University School of Public Health, a Master in Public Policy from the Harvard Kennedy School, and a Bachelor of Arts in Economics from Tufts University.
        </p>
      </section>
    </div>
  );
}
