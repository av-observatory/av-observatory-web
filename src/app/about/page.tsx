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
    </div>
  );
}
