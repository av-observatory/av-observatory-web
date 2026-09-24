type Month = { month: string; cpuc_driverless_vmt: number; sgo_ads_crashes: number;
  sgo_serious_or_fatal_crashes: number; crashes_per_million_miles: number;
  serious_or_fatal_crashes_per_million_miles: number };
export type CaCrashRateDataset = { scope: string; limitations: string; monthly: Month[];
  numerator_source: string; denominator_source: string };

export function CaCrashRates({ data }: { data: CaCrashRateDataset }) {
  const rows = data.monthly;
  const miles = rows.reduce((sum, row) => sum + row.cpuc_driverless_vmt, 0);
  const crashes = rows.reduce((sum, row) => sum + row.sgo_ads_crashes, 0);
  const severe = rows.reduce((sum, row) => sum + row.sgo_serious_or_fatal_crashes, 0);
  const recent = rows.slice(-12);
  const max = Math.max(...recent.map(row => row.crashes_per_million_miles));
  const x = (i: number) => 32 + i * 520 / (recent.length - 1);
  const y = (rate: number) => 130 - rate / max * 105;
  return <section className="mt-7"><p className="eyebrow">CPUC Mileage × NHTSA SGO Crashes</p><h2 className="text-xl font-semibold tracking-tight mt-2">California Reported Crashes per Mile</h2>
    <p className="text-sm text-neutral-600 mt-1">Waymo · {rows[0].month}–{rows.at(-1)?.month} · matched incident months · rates per million CPUC miles</p>
    <div className="grid sm:grid-cols-3 gap-3 mt-4">
      <div className="viz-card p-5"><span className="text-sm text-neutral-600">Reported Crashes per Million Miles</span><strong className="block text-3xl text-[#123b69] mt-2">{(crashes / miles * 1e6).toFixed(2)}</strong><span className="text-sm text-neutral-500">{crashes.toLocaleString()} SGO incidents</span></div>
      <div className="viz-card p-5"><span className="text-sm text-neutral-600">Serious or Fatal Crashes per Million Miles</span><strong className="block text-3xl text-[#123b69] mt-2">{(severe / miles * 1e6).toFixed(3)}</strong><span className="text-sm text-neutral-500">{severe} crashes with serious or fatal injury alleged</span></div>
      <div className="viz-card p-5"><span className="text-sm text-neutral-600">Matched CPUC Miles</span><strong className="block text-3xl text-[#123b69] mt-2">{(miles / 1e6).toFixed(1)}M</strong><span className="text-sm text-neutral-500">Driverless P1 + P2 + P3</span></div>
    </div>
    <div className="viz-card p-5 mt-3"><h3 className="font-semibold text-[#152b45]">Reported Crashes per Million Miles</h3><p className="text-sm text-neutral-600">Most Recent 12 Matched Months</p>
      <svg viewBox="0 0 580 164" className="w-full h-auto mt-3" role="img" aria-label="Monthly reported Waymo California SGO crashes per million CPUC driverless miles in the 12 most recent matched months">
        <path d="M32 130H556M32 77H556M32 25H556" stroke="#dce5ec"/><text x="27" y="28" textAnchor="end" fill="#536273" fontSize="10">{max.toFixed(0)}</text><text x="27" y="132" textAnchor="end" fill="#536273" fontSize="10">0</text>
        <polyline points={recent.map((row, i) => x(i) + "," + y(row.crashes_per_million_miles)).join(" ")} fill="none" stroke="#2166a8" strokeWidth="3" />
        {recent.map((row, i) => <g key={row.month}><circle cx={x(i)} cy={y(row.crashes_per_million_miles)} r="3" fill="#2166a8"><title>{row.month}: {row.crashes_per_million_miles.toFixed(2)} per million · {row.sgo_ads_crashes} reports / {Math.round(row.cpuc_driverless_vmt).toLocaleString()} miles</title></circle>{(i === 0 || i === recent.length - 1 || i % 3 === 0) && <text x={x(i)} y="155" textAnchor="middle" fill="#536273" fontSize="10">{row.month}</text>}</g>)}
      </svg>
    </div>
    <p className="text-sm text-neutral-600 leading-relaxed mt-3 max-w-4xl"><strong>Interpretation:</strong> {data.limitations} Report ID updates are reduced to the latest version; records sharing NHTSA’s Same Incident ID count once within Waymo’s reports. Airbag and injury information is self-reported and may change with later updates.</p>
    <div className="mt-2 flex flex-wrap gap-4 text-sm"><a href={data.numerator_source} className="text-[#184f95] underline">NHTSA SGO source ↗</a><a href={data.denominator_source} className="text-[#184f95] underline">CPUC data source ↗</a><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/ca_waymo_sgo_rates.csv`} className="text-[#184f95] underline">Download monthly rates CSV ↗</a></div>
  </section>;
}
