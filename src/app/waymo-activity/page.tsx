import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { WaymoS2Explorer } from "@/components/WaymoS2Explorer";

async function load<T>(name:string):Promise<T>{
  return JSON.parse(await fs.readFile(path.join(process.cwd(),"public/data",name),"utf8"));
}

export default async function WaymoActivityPage(){
  const [cells,vintages,census,marketHistory,operational,geometries]=await Promise.all([
    load<any>("waymo_s2_latest.geojson"),
    load<any>("waymo_s2_vintage_summary.json"),
    load<any>("waymo_s2_census_2024.json"),
    load<any>("waymo_s2_market_history.json"),
    load<any>("operational_domains.json"),
    load<any>("odd_current_geometries.geojson"),
  ]);

  const uniqueCells=new Set(cells.features.map((f:any)=>String(f.properties.s2_cell)));
  const total=[...uniqueCells].reduce((sum,id)=>{
    const rows=cells.features.filter((f:any)=>String(f.properties.s2_cell)===id);
    return sum+rows.reduce((s:number,f:any)=>s+Number(f.properties.waymo_ro_miles||0),0);
  },0);
  const base=process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return <main className="max-w-7xl px-5 sm:px-8 py-8">
    <p className="eyebrow">Operations / Waymo Activity</p>
    <h1 className="text-4xl font-semibold text-[#0b1d33] mt-3">Waymo S2 Data Explorer</h1>
    <p className="text-base leading-relaxed text-neutral-600 mt-3 max-w-4xl">
      Explore Waymo&apos;s published S2 operational mileage by market and release, see where mileage is growing, and compare the operating footprint with Census estimates of resident demographics and household income.
    </p>

    <div className="grid sm:grid-cols-3 gap-3 mt-6">
      <div className="viz-card p-5"><p className="text-sm text-neutral-600">Published S2 cells</p><strong className="block mt-2 text-2xl text-[#123b69]">{uniqueCells.size.toLocaleString()}</strong></div>
      <div className="viz-card p-5"><p className="text-sm text-neutral-600">Cumulative miles in latest release</p><strong className="block mt-2 text-2xl text-[#123b69]">{Math.round(total).toLocaleString()}</strong></div>
      <div className="viz-card p-5"><p className="text-sm text-neutral-600">Latest release</p><strong className="block mt-2 text-2xl text-[#123b69]">{vintages.latest_vintage.slice(0,4)}–{vintages.latest_vintage.slice(4)}</strong></div>
    </div>

    <p className="mt-4 text-sm text-neutral-600 max-w-5xl">
      Waymo&apos;s S2 releases report cumulative operational mileage, including travel without passengers. S2 cells are an observed reporting footprint, not an official service-area boundary. Census layers are spatial estimates for residents within that footprint; they do not describe Waymo riders or individual exposure.
    </p>

    <WaymoS2Explorer
      summary={vintages}
      geojson={cells}
      serviceGeojson={geometries}
      locations={operational.locations}
      census={census}
      marketHistory={marketHistory}
    />

    <div className="flex gap-x-6 gap-y-2 flex-wrap mt-5 text-sm text-[#184f95] underline">
      <a href={base+"/data/waymo_s2_explorer.csv"}>Download S2 map CSV ↗</a>
      <a href={base+"/data/waymo_s2_latest.geojson"}>Download latest S2 GeoJSON ↗</a>
      <a href={base+"/data/waymo_s2_bg_crosswalk_2024.csv"}>Download S2 ↔ Census block-group crosswalk ↗</a>
      <a href={base+"/data/waymo_s2_census_2024.json"}>Download S2 Census estimates ↗</a>
      <a href={base+"/data/waymo_s2_market_history.json"}>Download market history ↗</a>
      <Link href="/manufacturers">Compare Manufacturers →</Link>
    </div>
  </main>;
}
