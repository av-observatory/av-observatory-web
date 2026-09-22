const DOWNLOADS = [
  {
    title: "California AV Activity, Monthly (CPUC)",
    description: "Trips, VMT by period, waiting hours, PMT, WAV fulfillment -- monthly, by operator and program.",
    file: "cpuc_activity_monthly.csv",
    json: "cpuc_activity_monthly.json",
  },
  {
    title: "National ADS Incident Reports (NHTSA SGO)",
    description: "Standardized incident-level table: when, where, which operator/vehicle, engagement status.",
    file: "sgo_incidents.csv",
    json: "sgo_incidents_monthly.json",
  },
  {
    title: "Waymo S2-Cell Safety Benchmark",
    description: "State/county/S2-cell level Waymo reported miles and HPMS human-driving benchmark crash counts, across vintage snapshots.",
    file: "waymo_s2_benchmark.csv",
    json: "waymo_s2_state_summary.json",
  },
];

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function DownloadsPage() {
  return (
    <div className="px-8 py-8 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-[#0b1d33]">Downloads</h1>
      <p className="mt-2 text-neutral-600">
        Standardized datasets underlying the charts on this site. Raw source
        files and full provenance (source registry, hashes) are not yet
        published externally; these are the cleaned, analysis-ready tables.
      </p>

      <div className="mt-8 space-y-4">
        {DOWNLOADS.map((d) => (
          <div key={d.file} className="bg-white border border-neutral-200 rounded-lg p-5">
            <h2 className="font-semibold">{d.title}</h2>
            <p className="mt-1 text-sm text-neutral-600">{d.description}</p>
            <div className="mt-3 flex gap-4 text-sm">
              <a href={`${BASE_PATH}/data/${d.file}`} download className="text-[#0b1d33] font-medium underline">
                Download CSV
              </a>
              <a href={`${BASE_PATH}/data/${d.json}`} download className="text-[#0b1d33] font-medium underline">
                Download JSON
              </a>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-neutral-400">
        Datasets refresh when the Observatory's ingestion pipelines are run
        against newly released source data; see each dataset&apos;s parent page
        for source-specific caveats before reuse.
      </p>
    </div>
  );
}
