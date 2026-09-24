"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GRID_PROPS, AXIS_PROPS, TOOLTIP_PROPS, SERIES } from "@/lib/chartTheme";

declare global {
  interface Window { L?: any; }
}

type S2Feature = {
  type: "Feature";
  properties: {
    vintage_end: string;
    state: string;
    county: string;
    s2_cell: string;
    waymo_ro_miles: number;
    incremental_miles: number;
    exposure_phase: string;
  };
  geometry: any;
};

type S2GeoJSON = {
  type: "FeatureCollection";
  metadata?: Record<string, unknown>;
  features: S2Feature[];
};

type ServiceFeature = {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry: any;
};

type ServiceGeoJSON = {
  type: "FeatureCollection";
  features: ServiceFeature[];
};

type MarketLocation = {
  company: string;
  market: string;
  state: string;
  lat: number | null;
  lon: number | null;
  evidence_status?: string;
  activity_type?: string;
  phase?: string;
  status?: string;
  source_url?: string;
};

type VintageSummary = {
  vintage_end: string;
  vintage_start: string | null;
  cell_count: number;
  cumulative_miles: number;
  incremental_miles_vs_prior_release: number;
  negative_revision_cells: number;
  states: { state:string; cumulative_miles:number; cell_count:number }[];
};

type S2Summary = {
  dataset: string;
  source: string;
  phase: string;
  latest_vintage: string;
  vintages: VintageSummary[];
};

type CensusCell = {
  s2_cell:string;
  market:string;
  state:string;
  counties:string;
  estimated_population:number;
  estimated_households:number;
  household_weighted_bg_median_income:number|null;
  pct_white_non_hispanic:number|null;
  pct_black_non_hispanic:number|null;
  pct_asian_non_hispanic:number|null;
  pct_aian_non_hispanic:number|null;
  pct_nhpi_non_hispanic:number|null;
  pct_other_non_hispanic:number|null;
  pct_multiracial_non_hispanic:number|null;
  pct_hispanic:number|null;
  contributing_block_groups:number;
  census_overlap_share_of_s2_area:number;
};

type CensusDataset = {
  census_vintage:string;
  geometry_vintage:string;
  methodology:Record<string,string>;
  cells:Record<string,CensusCell>;
};

type MarketHistory = {
  market_definition:Record<string,string>;
  vintages:string[];
  markets:Record<string,{vintage_end:string;cumulative_miles:number;incremental_miles_vs_prior_release:number;cell_count:number}[]>;
};

type Metric = "cumulative" | "incremental" | "miles_per_1000" | "income" | "hispanic" | "black" | "asian" | "white";

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const BLUE_RAMP = ["#edf4fd","#d5e7fb","#a9cef6","#78afea","#438ad8","#2468b7","#174b8a","#0b2f5f"];
const ORANGE_RAMP = ["#fff3e8","#fddfc6","#f8bd8e","#f29356","#df6c28","#b94b15","#8d3510","#63240c"];
const GREEN_RAMP = ["#eef7f0","#d6eadb","#b5d7bf","#8fc09e","#65a57a","#42875c","#286943","#15482d"];
const PURPLE_RAMP = ["#f3eff9","#e2d7f1","#c9b9e4","#ad96d4","#8e71c0","#6f50a7","#543b84","#39285d"];

function ensureLeafletCss() {
  if (document.querySelector('link[data-waymo-s2-leaflet="1"]')) return;
  const link=document.createElement("link");
  link.rel="stylesheet"; link.href=LEAFLET_CSS; link.crossOrigin="";
  link.dataset.waymoS2Leaflet="1"; document.head.appendChild(link);
}
function loadLeaflet():Promise<any> {
  if(window.L) return Promise.resolve(window.L);
  const existing=document.querySelector<HTMLScriptElement>('script[data-waymo-s2-leaflet="1"]');
  if(existing) return new Promise((resolve,reject)=>{
    existing.addEventListener("load",()=>resolve(window.L),{once:true});
    existing.addEventListener("error",reject,{once:true});
  });
  return new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src=LEAFLET_JS; script.crossOrigin=""; script.dataset.waymoS2Leaflet="1";
    script.onload=()=>resolve(window.L); script.onerror=reject; document.head.appendChild(script);
  });
}

function compactMiles(v:number) {
  const abs=Math.abs(v);
  if(abs>=1_000_000) return `${(v/1_000_000).toFixed(abs>=10_000_000?0:1)}M`;
  if(abs>=1_000) return `${(v/1_000).toFixed(abs>=100_000?0:1)}K`;
  return Math.round(v).toLocaleString();
}
function vintageLabel(v:string){return `${v.slice(0,4)}-${v.slice(4,6)}`;}
function percentile(sorted:number[],p:number){if(!sorted.length)return 0;return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];}
function quantileBreaks(values:number[]){
  const positive=values.filter(v=>v>0&&Number.isFinite(v)).sort((a,b)=>a-b);
  if(!positive.length)return [0,1,2,3,4,5,6,7];
  return [0.10,0.25,0.40,0.55,0.70,0.82,0.92,0.98].map(p=>percentile(positive,p));
}
function rampIndex(v:number,breaks:number[]){if(v<=0)return 0;for(let i=0;i<breaks.length;i++)if(v<=breaks[i])return i;return breaks.length-1;}
function escapeHtml(value:unknown){return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");}
function metricValue(p:S2Feature["properties"],metric:Metric,census:CensusDataset){
  const cell=census.cells[String(p.s2_cell)];
  if(metric==="cumulative")return Number(p.waymo_ro_miles||0);
  if(metric==="incremental")return Number(p.incremental_miles||0);
  if(metric==="miles_per_1000"){
    const pop=Number(cell?.estimated_population||0);
    return pop>0?Number(p.waymo_ro_miles||0)/pop*1000:null;
  }
  if(metric==="income")return cell?.household_weighted_bg_median_income??null;
  if(metric==="hispanic")return cell?.pct_hispanic??null;
  if(metric==="black")return cell?.pct_black_non_hispanic??null;
  if(metric==="asian")return cell?.pct_asian_non_hispanic??null;
  if(metric==="white")return cell?.pct_white_non_hispanic??null;
  return null;
}
function metricLabel(metric:Metric){
  if(metric==="cumulative")return "Operational miles per cell";
  if(metric==="incremental")return "Miles added per cell";
  if(metric==="miles_per_1000")return "Miles per 1,000 estimated residents";
  if(metric==="income")return "Household-weighted block-group median income";
  if(metric==="hispanic")return "Hispanic / Latino share";
  if(metric==="black")return "Black non-Hispanic share";
  if(metric==="asian")return "Asian non-Hispanic share";
  return "White non-Hispanic share";
}
function metricFormat(metric:Metric,value:number|null){
  if(value===null||!Number.isFinite(value))return "No estimate";
  if(metric==="income")return "$"+Math.round(value).toLocaleString();
  if(["hispanic","black","asian","white"].includes(metric))return value.toFixed(1)+"%";
  if(metric==="miles_per_1000")return compactMiles(value)+" mi / 1k";
  return compactMiles(value)+" miles";
}
function metricRamp(metric:Metric){
  if(metric==="incremental")return ORANGE_RAMP;
  if(metric==="income")return GREEN_RAMP;
  if(["hispanic","black","asian","white"].includes(metric))return PURPLE_RAMP;
  return BLUE_RAMP;
}

function geometryPoints(geometry:any,out:[number,number][]=[]){
  const walk=(x:any)=>{
    if(Array.isArray(x)&&typeof x[0]==="number"&&typeof x[1]==="number") out.push([x[0],x[1]]);
    else if(Array.isArray(x)) x.forEach(walk);
  };
  walk(geometry?.coordinates);
  return out;
}
function geometryCenter(geometry:any):[number,number]{
  const pts=geometryPoints(geometry);
  if(!pts.length)return [0,0];
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const [x,y] of pts){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  return [(minX+maxX)/2,(minY+maxY)/2];
}
function pointInRing([x,y]:[number,number],ring:number[][]){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    const intersects=((yi>y)!==(yj>y))&&(x<((xj-xi)*(y-yi))/(yj-yi+1e-15)+xi);
    if(intersects)inside=!inside;
  }
  return inside;
}
function pointInPolygon(point:[number,number],rings:number[][][]){
  if(!rings?.length||!pointInRing(point,rings[0]))return false;
  for(let i=1;i<rings.length;i++) if(pointInRing(point,rings[i])) return false;
  return true;
}
function pointInGeometry(point:[number,number],geometry:any){
  if(!geometry)return false;
  if(geometry.type==="Polygon") return pointInPolygon(point,geometry.coordinates);
  if(geometry.type==="MultiPolygon") return geometry.coordinates.some((poly:number[][][])=>pointInPolygon(point,poly));
  return false;
}

function convexHull(points:[number,number][]):[number,number][] {
  const unique=Array.from(new Map(points.map(p=>[`${p[0]}|${p[1]}`,p])).values())
    .sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(unique.length<=2)return unique;
  const cross=(o:[number,number],a:[number,number],b:[number,number]) =>
    (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lower:[number,number][]=[];
  for(const p of unique){
    while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();
    lower.push(p);
  }
  const upper:[number,number][]=[];
  for(let i=unique.length-1;i>=0;i--){
    const p=unique[i];
    while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  const hull=[...lower,...upper];
  if(hull.length)hull.push(hull[0]);
  return hull;
}

function derivedRegionFeature(name:string,state:string,cells:S2Feature[]):ServiceFeature|undefined {
  const pts=cells.flatMap(cell=>geometryPoints(cell.geometry));
  const hull=convexHull(pts);
  if(hull.length<4)return undefined;
  return {
    type:"Feature",
    properties:{
      company:"Waymo",
      market:name,
      state,
      geometry_basis:"derived_s2_reporting_region",
      geometry_precision:"analytical_envelope_not_official_service_boundary",
      note:"Derived from the outer envelope of published Waymo S2 cells. This is an Observatory analysis region, not an official Waymo service-area or ODD boundary.",
    },
    geometry:{type:"Polygon",coordinates:[hull]},
  };
}

type MarketFacet = {
  market:string;
  state:string;
  serviceFeature?:ServiceFeature;
  point?:[number,number];
  status?:string;
  source_url?:string;
  cells:S2Feature[];
};

function MarketMap({
  facet,metric,breaks,totalMiles,census,
}:{
  facet:MarketFacet; metric:Metric; breaks:number[]; totalMiles:number; census:CensusDataset;
}){
  const ref=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<any>(null);

  useEffect(()=>{
    let cancelled=false; ensureLeafletCss();
    loadLeaflet().then(L=>{
      if(cancelled||!ref.current)return;
      if(mapRef.current){mapRef.current.remove();mapRef.current=null;}
      const map=L.map(ref.current,{center:[37,-96],zoom:6,minZoom:3,maxZoom:16,zoomControl:true,scrollWheelZoom:true});
      mapRef.current=map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map);
      const bounds=L.latLngBounds([]);

      if(facet.serviceFeature){
        const service=L.geoJSON(facet.serviceFeature as any,{
          style:{color:"#174b8a",weight:2,opacity:0.9,fillColor:"#2a78d6",fillOpacity:facet.cells.length?0.04:0.18},
        }).addTo(map);
        try{const b=service.getBounds();if(b?.isValid())bounds.extend(b);}catch{}
      }

      if(facet.cells.length){
        L.geoJSON({type:"FeatureCollection",features:facet.cells} as any,{
          style:(feature:any)=>{
            const p=feature?.properties??{};
            const value=metricValue(p,metric,census);
            if(metric==="incremental"&&value!==null&&value<0)return{color:"#fff",weight:0.45,fillColor:"#d9474d",fillOpacity:0.86};
            const ramp=metricRamp(metric);
            const missing=value===null||!Number.isFinite(value); return{color:"rgba(255,255,255,.85)",weight:0.45,fillColor:missing?"#e5e5e3":ramp[rampIndex(Number(value),breaks)],fillOpacity:missing?0.25:0.86};
          },
          onEachFeature:(feature:any,layer:any)=>{
            const p=feature.properties??{};
            const cumulative=Number(p.waymo_ro_miles||0),added=Number(p.incremental_miles||0);
            const value=metricValue(p,metric,census);
            const share=totalMiles>0?cumulative/totalMiles*100:0;
            layer.bindTooltip(`<div style="font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;min-width:180px">
              <div style="font-weight:700">${escapeHtml(p.county||facet.market)}, ${escapeHtml(p.state||facet.state)}</div>
              <div style="font-size:15px;font-weight:700;margin-top:3px">${escapeHtml(metricFormat(metric,value))}</div>
              <div style="color:#666">Cumulative ${escapeHtml(compactMiles(cumulative))} · added ${escapeHtml(compactMiles(added))}</div>
              <div style="color:#666">${share.toFixed(2)}% of market-attributed miles · S2 ${escapeHtml(p.s2_cell)}</div>
            </div>`,{sticky:true,direction:"top",opacity:0.96});
          },
        }).addTo(map);
      } else if(facet.point){
        L.circleMarker([facet.point[1],facet.point[0]],{radius:6,color:"#fff",weight:1.5,fillColor:"#eb6834",fillOpacity:1}).addTo(map);
        bounds.extend([facet.point[1],facet.point[0]]);
      }

      if(bounds.isValid()) map.fitBounds(bounds.pad(0.08),{maxZoom:11,animate:false});
      else if(facet.point) map.setView([facet.point[1],facet.point[0]],9,{animate:false});
    });
    return()=>{cancelled=true;if(mapRef.current){mapRef.current.remove();mapRef.current=null;}};
  },[facet,metric,breaks,totalMiles,census]);

  return <div ref={ref} className="waymo-market-facet-map" />;
}

export function WaymoS2Explorer({
  summary,geojson,serviceGeojson,locations,census,marketHistory,
}:{
  summary:S2Summary;
  geojson:S2GeoJSON;
  serviceGeojson:ServiceGeoJSON;
  locations:MarketLocation[];
  census:CensusDataset;
  marketHistory:MarketHistory;
}){
  const [vintage,setVintage]=useState(summary.latest_vintage);
  const [mapData,setMapData]=useState<S2GeoJSON>(geojson);
  const [loading,setLoading]=useState(false);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [metric,setMetric]=useState<Metric>("cumulative");
  const [growthMarket,setGrowthMarket]=useState("San Francisco Bay Area");

  useEffect(()=>{
    if(vintage===summary.latest_vintage){setMapData(geojson);setLoadError(null);return;}
    let cancelled=false;setLoading(true);setLoadError(null);
    const base=window.location.pathname.startsWith("/av-observatory-web")?"/av-observatory-web":"";
    fetch(`${base}/data/waymo_s2_${vintage}.geojson`)
      .then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();})
      .then((d:S2GeoJSON)=>{if(!cancelled)setMapData(d);})
      .catch(err=>{if(!cancelled)setLoadError(String(err));})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[vintage,summary.latest_vintage,geojson]);

  const waymoService=useMemo(()=>serviceGeojson.features.filter(f=>{
    const p=f.properties??{};
    return String(p.company)==="Waymo"&&String(p.evidence_status??"current")==="current"&&String(p.activity_type??p.phase)==="deployment";
  }),[serviceGeojson]);

  const facets=useMemo<MarketFacet[]>(()=>{
    const map=new Map<string,MarketFacet>();

    // California is reported in the S2 data as two broad operational clusters.
    // Build explicit analytical envelopes around those reported cells so the facets
    // can show all observed VMT without clipping it to an older/smaller service polygon.
    const northCaCells=mapData.features.filter(f =>
      f.properties.state==="California" &&
      ["San Francisco","San Mateo","Santa Clara"].includes(f.properties.county)
    );
    const southCaCells=mapData.features.filter(f =>
      f.properties.state==="California" &&
      f.properties.county==="Los Angeles"
    );

    const northFeature=derivedRegionFeature("Northern California","CA",northCaCells);
    if(northFeature){
      map.set("Northern California|CA",{
        market:"Northern California",
        state:"CA",
        serviceFeature:northFeature,
        status:"observed_s2_reporting_region",
        cells:northCaCells,
      });
    }
    const southFeature=derivedRegionFeature("Southern California","CA",southCaCells);
    if(southFeature){
      map.set("Southern California|CA",{
        market:"Southern California",
        state:"CA",
        serviceFeature:southFeature,
        status:"observed_s2_reporting_region",
        cells:southCaCells,
      });
    }

    for(const f of waymoService){
      const p=f.properties??{};
      const market=String(p.market??"");
      const state=String(p.state??"");
      if(!market||!state)continue;

      // When S2 VMT exists for the broad California reporting region, that region
      // replaces the Bay Area/Los Angeles service polygon as the primary facet.
      if(state==="CA" && (
        (market==="San Francisco Bay Area" && northCaCells.length>0) ||
        (market==="Los Angeles" && southCaCells.length>0)
      )) continue;

      map.set(`${market}|${state}`,{
        market,state,serviceFeature:f,status:String(p.status??""),
        source_url:String(p.source_url??""),cells:[]
      });
    }

    for(const loc of locations){
      if(loc.company!=="Waymo")continue;
      if((loc.evidence_status??"current")!=="current"||(loc.activity_type??loc.phase)!=="deployment")continue;
      if(loc.state==="CA" && (
        (loc.market==="San Francisco Bay Area" && northCaCells.length>0) ||
        (loc.market==="Los Angeles" && southCaCells.length>0)
      )) continue;
      const key=`${loc.market}|${loc.state}`;
      if(!map.has(key)) map.set(key,{
        market:loc.market,state:loc.state,
        point:loc.lon!==null&&loc.lat!==null?[loc.lon,loc.lat]:undefined,
        status:loc.status,source_url:loc.source_url,cells:[]
      });
      else{
        const x=map.get(key)!;
        if(loc.lon!==null&&loc.lat!==null)x.point=[loc.lon,loc.lat];
        x.status=x.status||loc.status; x.source_url=x.source_url||loc.source_url;
      }
    }

    const cellCenters=mapData.features.map(cell=>({cell,center:geometryCenter(cell.geometry)}));
    for(const facet of map.values()){
      if(facet.cells.length||!facet.serviceFeature)continue;
      facet.cells=cellCenters.filter(({center})=>pointInGeometry(center,facet.serviceFeature!.geometry)).map(x=>x.cell);
    }
    return Array.from(map.values()).sort((a,b)=>a.state.localeCompare(b.state)||a.market.localeCompare(b.market));
  },[waymoService,locations,mapData]);

  const allValues=useMemo(()=>mapData.features
    .map(f=>metricValue(f.properties,metric,census))
    .filter((v):v is number=>v!==null&&Number.isFinite(v)),[mapData,metric,census]);
  const breaks=useMemo(()=>quantileBreaks(allValues),[allValues]);
  const ramp=metricRamp(metric);

  const growthSeries=marketHistory.markets[growthMarket]??[];
  const chartRows=growthSeries.map(v=>({
    vintage:vintageLabel(v.vintage_end),
    cumulative:Number((v.cumulative_miles/1_000_000).toFixed(1)),
    added:Number((v.incremental_miles_vs_prior_release/1_000_000).toFixed(1)),
  }));
  const marketsWithVmt=facets.filter(f=>f.cells.length>0).length;
  const marketsWithoutVmt=facets.length-marketsWithVmt;

  return <div>
    <div className="viz-card p-4">
      <div className="grid md:grid-cols-2 gap-3">
        <label className="filter-label">S2 release
          <select className="filter-select" value={vintage} onChange={e=>setVintage(e.target.value)}>
            {summary.vintages.slice().reverse().map(v=><option key={v.vintage_end} value={v.vintage_end}>{vintageLabel(v.vintage_end)}</option>)}
          </select>
        </label>
        <label className="filter-label">Cell measure
          <select className="filter-select" value={metric} onChange={e=>setMetric(e.target.value as Metric)}>
            <option value="cumulative">VMT by cell · cumulative miles</option>
            <option value="incremental">VMT added since prior release</option>
            <option value="miles_per_1000">VMT per 1,000 estimated residents</option>
            <option value="income">Household income context</option>
            <option value="hispanic">Hispanic / Latino share</option>
            <option value="black">Black non-Hispanic share</option>
            <option value="asian">Asian non-Hispanic share</option>
            <option value="white">White non-Hispanic share</option>
          </select>
        </label>
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-3">
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Waymo markets</div><div className="text-2xl font-semibold mt-1">{facets.length}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Markets with S2 VMT</div><div className="text-2xl font-semibold mt-1">{marketsWithVmt}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Boundary only / no VMT yet</div><div className="text-2xl font-semibold mt-1">{marketsWithoutVmt}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Published S2 cells</div><div className="text-2xl font-semibold mt-1">{mapData.features.length.toLocaleString()}</div></div>
    </div>

    <div className="mt-5 flex items-baseline justify-between gap-4">
      <div>
        <h3 className="text-xl font-semibold">Waymo Markets · VMT by Cell</h3>
        <p className="text-sm text-neutral-500 mt-1">
          Each market is shown separately. Where Waymo has published S2 mileage, cells replace the polygon as the primary deployment footprint; current service-area polygons provide context and fill gaps where S2 VMT is not yet published.
        </p>
      </div>
      <span className="text-sm text-neutral-500">{loading?"Loading…":vintageLabel(vintage)}</span>
    </div>

    <div className="mt-3 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
      {facets.map(facet=>{
        const total=facet.cells.reduce((s,f)=>s+Number(f.properties.waymo_ro_miles||0),0);
        const added=facet.cells.reduce((s,f)=>s+Number(f.properties.incremental_miles||0),0);
        return <div key={`${facet.market}|${facet.state}`} className="viz-card overflow-hidden">
          <div className="p-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-lg">{facet.market}</h4>
                <div className="text-sm text-neutral-500">{facet.state}</div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${facet.cells.length?"bg-blue-50 text-blue-800":"bg-neutral-100 text-neutral-600"}`}>
                {facet.cells.length?`${facet.cells.length} S2 cells`:"boundary only"}
              </span>
            </div>
            {String(facet.serviceFeature?.properties?.geometry_basis??"")==="derived_s2_reporting_region" && (
              <div className="mt-2 text-[11px] leading-snug text-neutral-500">
                Derived S2 reporting envelope — not an official Waymo service-area or ODD boundary.
              </div>
            )}
            <div className="mt-2 flex gap-4 text-xs text-neutral-600">
              {facet.cells.length>0 ? <>
                <span><strong className="text-neutral-900">{compactMiles(total)}</strong> cumulative mi</span>
                <span><strong className="text-neutral-900">{compactMiles(added)}</strong> added</span>
              </> : <span>No published S2 VMT attributed to this current service area in this release.</span>}
            </div>
          </div>
          <div className="px-3 pb-3">
            <MarketMap facet={facet} metric={metric} breaks={breaks} totalMiles={total} census={census} />
          </div>
        </div>;
      })}
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-xs font-medium text-neutral-600">{metricLabel(metric)}</span>
      {breaks.map((b,i)=><div key={i} className="flex items-center gap-1">
        <span className="inline-block w-4 h-3 rounded-sm" style={{background:ramp[i]}} />
        <span className="text-[10px] text-neutral-500">{i===0?`≤${metricFormat(metric,b)}`:`${metricFormat(metric,breaks[i-1])}–${metricFormat(metric,b)}`}</span>
      </div>)}
      {metric==="incremental"&&<div className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded-sm bg-[#d9474d]" /><span className="text-[10px] text-neutral-500">negative revision</span></div>}
    </div>

    {loadError&&<div className="text-xs text-red-700 mt-2">Could not load this vintage map: {loadError}</div>}

    <div className="viz-card p-4 mt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">Mileage Growth by Market</h3>
          <div className="text-sm text-neutral-500">Cumulative operational miles represented by each S2 benchmark release.</div>
        </div>
        <label className="filter-label min-w-[220px]">Market
          <select className="filter-select" value={growthMarket} onChange={e=>setGrowthMarket(e.target.value)}>
            {Object.keys(marketHistory.markets).sort().map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartRows} margin={{top:18,right:10,bottom:5,left:0}}>
          <CartesianGrid {...GRID_PROPS}/>
          <XAxis dataKey="vintage" {...AXIS_PROPS}/>
          <YAxis {...AXIS_PROPS} tickFormatter={v=>`${v}M`}/>
          <Tooltip {...TOOLTIP_PROPS} formatter={(v)=>`${v}M miles`}/>
          <Line type="monotone" dataKey="cumulative" name="Cumulative miles" stroke={SERIES.blue} strokeWidth={2.5} dot={false}/>
          <Line type="monotone" dataKey="added" name="Added since prior release" stroke={SERIES.orange} strokeWidth={1.8} dot={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>

    <div className="mt-4 rounded-lg border border-[#cad8e8] bg-[#f8fbfe] p-4">
      <h3 className="font-semibold">Census context methodology</h3>
      <p className="text-sm leading-relaxed text-neutral-600 mt-2">
        Resident characteristics use 2024 ACS 5-year block-group estimates joined to 2024 TIGER/Line block-group geometry. Population and race/ethnicity counts are allocated into S2 cells by polygon-overlap area. Income is a household-weighted average of contributing block groups&apos; median household income. These are contextual estimates for residents in the published S2 footprint, not rider demographics, crash-victim demographics, or person-level exposure.
      </p>
    </div>
  </div>;
}
