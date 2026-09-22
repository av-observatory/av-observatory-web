export default function AboutPage() {
  return (
    <div className="max-w-3xl px-8 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">About AV Observatory</h1>
      <p className="mt-6 text-neutral-700 leading-relaxed">
        AV Observatory is an independent source of evidence on autonomous
        vehicle deployment and impacts in the United States. It integrates
        fragmented government and public datasets — CPUC, NHTSA, California
        DMV, Census, and others — into durable, reproducible measures of AV
        activity, deployment, safety, and community exposure.
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
