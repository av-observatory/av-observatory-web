import Link from "next/link";
import type { S2Geojson } from "@/components/CompanyDeploymentExplorer";

type Vintage = { vintage_end: string; cumulative_miles: number };

function marketFor(state: string, county: string) {
  if (state === "Arizona" && county === "Maricopa") return "Phoenix";
  if (state === "California" && ["San Francisco", "San Mateo", "Santa Clara"].includes(county)) return "San Francisco Bay Area";
  if (state === "California" && county === "Los Angeles") return "Los Angeles";
  if (state === "Texas" && county === "Travis") return "Austin";
  if (state === "Georgia" && ["Fulton", "DeKalb"].includes(county)) return "Atlanta";
  return county + ", " + state;
}

export function WaymoMileageOverview({ vintages, cells }: { vintages: Vintage[]; cells: S2Geojson }) {
  const max = Math.max(...vintages.map(v => v.cumulative_miles));
  const x = (i: number) => 44 + i * 500 / (vintages.length - 1);
  const y = (miles: number) => 147 - miles / max * 115;
  const totals = new Map<string, number>();
  for (const feature of cells.features) {
    const p = feature.properties;
    const market = marketFor(String(p.state ?? ""), String(p.county ?? ""));
    totals.set(market, (totals.get(market) ?? 0) + Number(p.waymo_ro_miles || 0));
  }
  const markets = [...totals].sort((a, b) => b[1] - a[1]);
  const marketMax = markets[0]?.[1] || 1;
  return <>
    <section className="viz-card p-5 mt-5">
      <div className="flex flex-wrap justify-between gap-3"><div><p className="eyebrow">Waymo S2 Release History · United States</p><h2 className="text-xl font-semibold mt-2">Cumulative U.S. S2 Miles</h2></div><span className="text-sm text-neutral-600">Millions of miles · by release</span></div>
      <svg viewBox="0 0 580 185" role="img" aria-label={"Cumulative Waymo S2 miles across reported U.S. cells; latest " + Math.round(max).toLocaleString() + " miles"} className="w-full h-auto mt-3">
        <path d="M44 147H556M44 90H556M44 32H556" stroke="#dce5ec" />
        <text x="38" y="35" textAnchor="end" fill="#536273" fontSize="11">{(max / 1e6).toFixed(0)}M</text><text x="38" y="149" textAnchor="end" fill="#536273" fontSize="11">0</text>
        <polyline points={vintages.map((v, i) => x(i) + "," + y(v.cumulative_miles)).join(" ")} fill="none" stroke="#2166a8" strokeWidth="3" strokeLinejoin="round" />
        {vintages.map((v, i) => <g key={v.vintage_end}><circle cx={x(i)} cy={y(v.cumulative_miles)} r="3" fill="#2166a8"><title>{v.vintage_end.slice(0, 4) + "–" + v.vintage_end.slice(4)} · {Math.round(v.cumulative_miles).toLocaleString()} miles</title></circle>{(i === 0 || i === vintages.length - 1 || i % 2 === 0) && <text x={x(i)} y="173" fill="#536273" fontSize="10" textAnchor="middle">{v.vintage_end.slice(0, 4) + "–" + v.vintage_end.slice(4)}</text>}</g>)}
      </svg>
      <p className="text-sm text-neutral-600 mt-1">Each point is a published S2 release, not one month of driving. The total includes all U.S. cells in the release; markets without S2 coverage are absent. Operational miles include travel without passengers. <Link href="/downloads" className="underline text-[#184f95]">Download release data →</Link></p>
    </section>
    <section className="viz-card p-5 mt-4"><h2 className="text-xl font-semibold">Cumulative S2 Miles by Market</h2><p className="text-sm text-neutral-600 mt-1">Latest release · all observed miles through the release date</p>
      <div className="grid gap-3 mt-5">{markets.map(([market, miles]) => <div key={market} className="grid sm:grid-cols-[185px_1fr_90px] gap-2 items-center text-sm"><span className="font-medium text-[#152b45]">{market}</span><div className="h-4 rounded-sm bg-[#e8eef4]"><div className="h-4 rounded-sm bg-[#2c76bf]" style={{ width: (100 * miles / marketMax) + "%" }} /></div><span className="sm:text-right tabular-nums">{(miles / 1e6).toFixed(1)}M mi</span></div>)}</div>
      <p className="text-sm text-neutral-600 mt-5">Bay Area combines San Francisco, San Mateo, and Santa Clara counties; Atlanta combines Fulton and DeKalb. These county groupings are analytical, not official service boundaries. Cities without published S2 mileage are not counted here.</p>
    </section>
  </>;
}
