"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
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

type Metric = "cumulative" | "incremental" | "miles_per_1000" | "interaction";
type ResidentCharacteristic = "hispanic" | "black" | "asian" | "white" | "income";
type DemographicView = "race" | "income";

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const BLUE_RAMP = ["#edf4fd","#d5e7fb","#a9cef6","#78afea","#438ad8","#2468b7","#174b8a","#0b2f5f"];
const ORANGE_RAMP = ["#fff3e8","#fddfc6","#f8bd8e","#f29356","#df6c28","#b94b15","#8d3510","#63240c"];
const GREEN_RAMP = ["#eef7f0","#d6eadb","#b5d7bf","#8fc09e","#65a57a","#42875c","#286943","#15482d"];
const PURPLE_RAMP = ["#f3eff9","#e2d7f1","#c9b9e4","#ad96d4","#8e71c0","#6f50a7","#543b84","#39285d"];
const BIVARIATE = [
  ["#e8e8e8","#ace4e4","#5ac8c8"],
  ["#dfb0d6","#a5add3","#5698b9"],
  ["#be64ac","#8c62aa","#3b4994"],
];

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
  return null;
}
function metricLabel(metric:Metric){
  if(metric==="cumulative")return "Rider-Only (RO) miles per cell";
  if(metric==="incremental")return "RO miles added this quarter per cell";
  if(metric==="miles_per_1000")return "RO miles per 1,000 estimated residents";
  if(metric==="interaction")return "Bivariate: Waymo VMT per resident × resident characteristic";
  return "Rider-Only (RO) miles per cell";
}
function metricFormat(metric:Metric,value:number|null){
  if(value===null||!Number.isFinite(value))return "No estimate";
  if(metric==="miles_per_1000"||metric==="interaction")return compactMiles(value)+" mi / 1k";
  return compactMiles(value)+" miles";
}
function metricRamp(metric:Metric){
  if(metric==="incremental")return ORANGE_RAMP;
  return BLUE_RAMP;
}
function characteristicValue(p:S2Feature["properties"],characteristic:ResidentCharacteristic,census:CensusDataset){
  const cell=census.cells[String(p.s2_cell)];
  if(characteristic==="income")return cell?.household_weighted_bg_median_income??null;
  if(characteristic==="hispanic")return cell?.pct_hispanic??null;
  if(characteristic==="black")return cell?.pct_black_non_hispanic??null;
  if(characteristic==="asian")return cell?.pct_asian_non_hispanic??null;
  return cell?.pct_white_non_hispanic??null;
}
function characteristicLabel(characteristic:ResidentCharacteristic){
  if(characteristic==="income")return "Median household income";
  if(characteristic==="hispanic")return "% Hispanic / Latino";
  if(characteristic==="black")return "% Black, non-Hispanic";
  if(characteristic==="asian")return "% Asian, non-Hispanic";
  return "% White, non-Hispanic";
}
function characteristicFormat(characteristic:ResidentCharacteristic,value:number|null){
  if(value===null||!Number.isFinite(value))return "No estimate";
  return characteristic==="income"?"$"+Math.round(value).toLocaleString():value.toFixed(1)+"%";
}
function tertileBreaks(values:number[]){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return [0,1];
  return [percentile(sorted,1/3),percentile(sorted,2/3)];
}
function tertileIndex(value:number,breaks:number[]){return value<=breaks[0]?0:value<=breaks[1]?1:2;}
function marketNameForFeature(p:S2Feature["properties"]){
  const state=String(p.state??"");
  const county=String(p.county??"");
  if(state==="Arizona"&&county==="Maricopa")return {market:"Phoenix",state:"AZ"};
  if(state==="California"&&["San Francisco","San Mateo","Santa Clara"].includes(county))return {market:"San Francisco Bay Area",state:"CA"};
  if(state==="California"&&county==="Los Angeles")return {market:"Los Angeles",state:"CA"};
  if(state==="Texas"&&county==="Travis")return {market:"Austin",state:"TX"};
  if(state==="Georgia"&&["Fulton","DeKalb"].includes(county))return {market:"Atlanta",state:"GA"};
  const legacy=county.toUpperCase().replaceAll(" ","_");
  if(legacy==="PHOENIX")return {market:"Phoenix",state:"AZ"};
  if(legacy==="SAN_FRANCISCO")return {market:"San Francisco Bay Area",state:"CA"};
  if(legacy==="LOS_ANGELES")return {market:"Los Angeles",state:"CA"};
  if(legacy==="AUSTIN")return {market:"Austin",state:"TX"};
  if(legacy==="ATLANTA")return {market:"Atlanta",state:"GA"};
  if(county&&state)return {market:county,state};
  if(county)return {market:county,state};
  return {market:"Unassigned S2 market",state};
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
  facet,metric,breaks,totalMiles,census,characteristic,activityBreaks,contextBreaks,
}:{
  facet:MarketFacet; metric:Metric; breaks:number[]; totalMiles:number; census:CensusDataset;
  characteristic:ResidentCharacteristic; activityBreaks:number[]; contextBreaks:number[];
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
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{
        maxZoom:20,
        attribution:"&copy; OpenStreetMap contributors &copy; CARTO"
      }).addTo(map);
      const bounds=L.latLngBounds([]);

      if(facet.cells.length){
        L.geoJSON({type:"FeatureCollection",features:facet.cells} as any,{
          style:(feature:any)=>{
            const p=feature?.properties??{};
            const value=metricValue(p,metric,census);
            if(metric==="interaction"){
              const activity=metricValue(p,"miles_per_1000",census);
              const context=characteristicValue(p,characteristic,census);
              const missing=activity===null||context===null||!Number.isFinite(activity)||!Number.isFinite(context);
              if(missing)return{color:"rgba(255,255,255,.85)",weight:0.45,fillColor:"#e5e5e3",fillOpacity:0.25};
              return{color:"rgba(255,255,255,.9)",weight:0.5,fillColor:BIVARIATE[tertileIndex(Number(context),contextBreaks)][tertileIndex(Number(activity),activityBreaks)],fillOpacity:0.9};
            }
            if(metric==="incremental"&&value!==null&&value<0)return{color:"#fff",weight:0.45,fillColor:"#d9474d",fillOpacity:0.86};
            const ramp=metricRamp(metric);
            const missing=value===null||!Number.isFinite(value); return{color:"rgba(255,255,255,.85)",weight:0.45,fillColor:missing?"#e5e5e3":ramp[rampIndex(Number(value),breaks)],fillOpacity:missing?0.25:0.86};
          },
          onEachFeature:(feature:any,layer:any)=>{
            const p=feature.properties??{};
            const cumulative=Number(p.waymo_ro_miles||0),added=Number(p.incremental_miles||0);
            const value=metricValue(p,metric,census);
            const activity=metricValue(p,"miles_per_1000",census);
            const context=characteristicValue(p,characteristic,census);
            const share=totalMiles>0?cumulative/totalMiles*100:0;
            layer.bindTooltip(`<div style="font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;min-width:210px">
              <div style="font-weight:700">${escapeHtml(p.county||facet.market)}, ${escapeHtml(p.state||facet.state)}</div>
              ${metric==="interaction"?`<div style="font-size:14px;font-weight:700;margin-top:3px">${escapeHtml(metricFormat("miles_per_1000",activity))}</div><div style="color:#555">${escapeHtml(characteristicLabel(characteristic))}: ${escapeHtml(characteristicFormat(characteristic,context))}</div>`:`<div style="font-size:15px;font-weight:700;margin-top:3px">${escapeHtml(metricFormat(metric,value))}</div>`}
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
  },[facet,metric,breaks,totalMiles,census,characteristic,activityBreaks,contextBreaks]);

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
  const [metric,setMetric]=useState<Metric>("miles_per_1000");
  const [characteristic,setCharacteristic]=useState<ResidentCharacteristic>("black");
  const [demographicView,setDemographicView]=useState<DemographicView>("race");
  const [selectedMarket,setSelectedMarket]=useState("San Francisco Bay Area");
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

    const northFeature=derivedRegionFeature("San Francisco Bay Area","CA",northCaCells);
    if(northFeature){
      map.set("San Francisco Bay Area|CA",{
        market:"San Francisco Bay Area",
        state:"CA",
        serviceFeature:northFeature,
        status:"observed_s2_reporting_region",
        cells:northCaCells,
      });
    }
    const southFeature=derivedRegionFeature("Los Angeles","CA",southCaCells);
    if(southFeature){
      map.set("Los Angeles|CA",{
        market:"Los Angeles",
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

      const key=`${market}|${state}`;
      if(map.has(key)){
        const existing=map.get(key)!;
        existing.source_url=String(p.source_url??existing.source_url??"");
        existing.status=existing.status||String(p.status??"");
      }else{
        map.set(key,{
          market,state,serviceFeature:f,status:String(p.status??""),
          source_url:String(p.source_url??""),cells:[]
        });
      }
    }

    for(const loc of locations){
      if(loc.company!=="Waymo")continue;
      if((loc.evidence_status??"current")!=="current"||(loc.activity_type??loc.phase)!=="deployment")continue;
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

    // Guarantee that every market represented in the S2 data appears, even when
    // there is no current service-area polygon or operational-domain record.
    const dataMarkets=new Map<string,{market:string;state:string;cells:S2Feature[]}>();
    for(const cell of mapData.features){
      const resolved=marketNameForFeature(cell.properties);
      const key=`${resolved.market}|${resolved.state}`;
      const group=dataMarkets.get(key)??{market:resolved.market,state:resolved.state,cells:[]};
      group.cells.push(cell);
      dataMarkets.set(key,group);
    }
    for(const [key,group] of dataMarkets){
      const existing=map.get(key);
      if(existing){
        const ids=new Set(existing.cells.map(x=>String(x.properties.s2_cell)));
        for(const cell of group.cells){
          if(!ids.has(String(cell.properties.s2_cell))) existing.cells.push(cell);
        }
      }else{
        map.set(key,{
          market:group.market,
          state:group.state,
          status:"s2_data_only",
          cells:group.cells,
        });
      }
    }

    return Array.from(map.values())
      .filter(f=>f.cells.length>0)
      .sort((a,b)=>a.state.localeCompare(b.state)||a.market.localeCompare(b.market));
  },[waymoService,locations,mapData]);

  const selectedFacet=facets.find(f=>f.market===selectedMarket)??facets[0];
  useEffect(()=>{if(selectedFacet&&selectedFacet.market!==selectedMarket)setSelectedMarket(selectedFacet.market);},[selectedFacet,selectedMarket]);
  const activeCells=selectedFacet?.cells??[];
  const allValues=useMemo(()=>activeCells
    .map(f=>metricValue(f.properties,metric,census))
    .filter((v):v is number=>v!==null&&Number.isFinite(v)),[activeCells,metric,census]);
  const breaks=useMemo(()=>quantileBreaks(allValues),[allValues]);
  const activityBreaks=useMemo(()=>tertileBreaks(activeCells.map(f=>metricValue(f.properties,"miles_per_1000",census)).filter((v):v is number=>v!==null&&Number.isFinite(v))),[activeCells,census]);
  const contextBreaks=useMemo(()=>tertileBreaks(activeCells.map(f=>characteristicValue(f.properties,characteristic,census)).filter((v):v is number=>v!==null&&Number.isFinite(v))),[activeCells,characteristic,census]);
  const ramp=metricRamp(metric);

  const raceExposureRows=useMemo(()=>{
    const groups=[
      {category:"All Residents",share:(c:CensusCell)=>100},
      {category:"White, Non-Hispanic",share:(c:CensusCell)=>c.pct_white_non_hispanic},
      {category:"Black, Non-Hispanic",share:(c:CensusCell)=>c.pct_black_non_hispanic},
      {category:"Asian, Non-Hispanic",share:(c:CensusCell)=>c.pct_asian_non_hispanic},
      {category:"Hispanic / Latino",share:(c:CensusCell)=>c.pct_hispanic},
    ];
    return groups.map(group=>{
      let weightedIntensity=0;
      let groupResidents=0;
      for(const feature of activeCells){
        const cell=census.cells[String(feature.properties.s2_cell)];
        const pop=Number(cell?.estimated_population||0);
        const share=cell?group.share(cell):null;
        if(pop<=0||share===null||!Number.isFinite(Number(share)))continue;
        const residents=pop*Number(share)/100;
        const intensity=Number(feature.properties.waymo_ro_miles||0)/pop*1000;
        weightedIntensity+=intensity*residents;
        groupResidents+=residents;
      }
      return {category:group.category,vmt_per_1000:groupResidents>0?weightedIntensity/groupResidents:0,residents:groupResidents};
    });
  },[activeCells,census]);

  const incomeExposureRows=useMemo(()=>{
    const bands=[
      {category:"< $50K",min:-Infinity,max:50000},
      {category:"$50K–$75K",min:50000,max:75000},
      {category:"$75K–$100K",min:75000,max:100000},
      {category:"$100K–$150K",min:100000,max:150000},
      {category:"$150K+",min:150000,max:Infinity},
    ];
    return bands.map(band=>{
      let weightedIntensity=0;
      let residents=0;
      for(const feature of activeCells){
        const cell=census.cells[String(feature.properties.s2_cell)];
        const pop=Number(cell?.estimated_population||0);
        const income=cell?.household_weighted_bg_median_income;
        if(pop<=0||income===null||!Number.isFinite(Number(income))||Number(income)<band.min||Number(income)>=band.max)continue;
        const intensity=Number(feature.properties.waymo_ro_miles||0)/pop*1000;
        weightedIntensity+=intensity*pop;
        residents+=pop;
      }
      return {category:band.category,vmt_per_1000:residents>0?weightedIntensity/residents:0,residents};
    });
  },[activeCells,census]);

  const demographicRows=demographicView==="race"?raceExposureRows:incomeExposureRows;

  const growthSeries=marketHistory.markets[growthMarket]??[];
  const chartRows=growthSeries.map(v=>({
    vintage:vintageLabel(v.vintage_end),
    cumulative:Number((v.cumulative_miles/1_000_000).toFixed(1)),
    added:Number((v.incremental_miles_vs_prior_release/1_000_000).toFixed(1)),
  }));
  const marketsWithVmt=facets.length;
  const uniqueMappedCells=new Set(mapData.features.map(f=>String(f.properties.s2_cell))).size;

  return <div>
    <div className="viz-card p-3">
      <div className="mb-3 text-sm leading-relaxed text-neutral-600">
        <strong>RO = Rider-Only.</strong> Waymo uses Rider-Only miles for miles driven in fully autonomous service with no human driver behind the wheel. These are not all Waymo vehicle miles and can include both passenger and non-passenger travel within Rider-Only operations.
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr_2.2fr] lg:items-end">
        <div>
          <div className="filter-label">Market</div>
          <select className="filter-select" value={selectedFacet?.market??selectedMarket} onChange={e=>setSelectedMarket(e.target.value)}>
            {facets.map(f=><option key={f.market} value={f.market}>{f.market}</option>)}
          </select>
        </div>
        <div>
          <div className="filter-label">Release</div>
          <div className="mt-1 flex items-center gap-1.5">
            <button type="button" onClick={()=>{const ordered=summary.vintages.map(v=>v.vintage_end);const i=ordered.indexOf(vintage);if(i>0)setVintage(ordered[i-1]);}} disabled={summary.vintages[0]?.vintage_end===vintage} className="rounded-md border border-[#cad8e8] bg-white px-2.5 py-2 text-sm text-neutral-700 disabled:opacity-35">←</button>
            <span className="flex-1 rounded-md bg-[#eef4fb] px-3 py-2 text-center text-sm font-medium text-[#184f95]">{vintageLabel(vintage)}</span>
            <button type="button" onClick={()=>{const ordered=summary.vintages.map(v=>v.vintage_end);const i=ordered.indexOf(vintage);if(i>=0&&i<ordered.length-1)setVintage(ordered[i+1]);}} disabled={summary.latest_vintage===vintage} className="rounded-md border border-[#cad8e8] bg-white px-2.5 py-2 text-sm text-neutral-700 disabled:opacity-35">→</button>
          </div>
        </div>
        <div>
          <div className="filter-label">Map</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {([["miles_per_1000","RO Miles / Resident"],["cumulative","Cumulative RO Miles"],["incremental","RO Miles Added This Quarter"]] as [Metric,string][]).map(([value,label])=><button key={value} type="button" onClick={()=>setMetric(value)} className={`rounded-md border px-2.5 py-2 text-sm transition ${metric===value?"border-[#184f95] bg-[#184f95] text-white":"border-[#cad8e8] bg-white text-neutral-700 hover:border-[#184f95] hover:text-[#184f95]"}`}>{label}</button>)}
          </div>
        </div>
      </div>
    </div>

    {selectedFacet&&(()=>{
      const total=selectedFacet.cells.reduce((sum,f)=>sum+Number(f.properties.waymo_ro_miles||0),0);
      const added=selectedFacet.cells.reduce((sum,f)=>sum+Number(f.properties.incremental_miles||0),0);
      const censusRows=Array.from(new Map(selectedFacet.cells.map(f=>{const id=String(f.properties.s2_cell);return [id,census.cells[id]] as const;})).values()).filter((r):r is CensusCell=>Boolean(r));
      const population=censusRows.reduce((sum,r)=>sum+Number(r.estimated_population||0),0);
      return <div className="viz-card mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div><h3 className="text-xl font-semibold">{selectedFacet.market} · VMT by S2 Cell</h3><div className="text-xs text-neutral-500">{selectedFacet.cells.length.toLocaleString()} cells · {loading?"Loading…":vintageLabel(vintage)}</div></div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
            <span><strong className="text-neutral-900">{compactMiles(total)}</strong> cumulative mi</span>
            <span><strong className="text-neutral-900">{compactMiles(added)}</strong> added this quarter</span>
            <span><strong className="text-neutral-900">{compactMiles(population)}</strong> est. residents</span>
          </div>
        </div>
        <div className="px-3 pb-3"><MarketMap facet={selectedFacet} metric={metric} breaks={breaks} totalMiles={total} census={census} characteristic={characteristic} activityBreaks={activityBreaks} contextBreaks={contextBreaks}/></div>
      </div>;
    })()}

    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-xs font-medium text-neutral-600">{metricLabel(metric)}</span>
      {breaks.map((b,i)=><div key={i} className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm" style={{background:ramp[i]}}/><span className="text-[10px] text-neutral-500">{i===0?`≤${metricFormat(metric,b)}`:`${metricFormat(metric,breaks[i-1])}–${metricFormat(metric,b)}`}</span></div>)}
      {metric==="incremental"&&<div className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-[#d9474d]"/><span className="text-[10px] text-neutral-500">negative revision</span></div>}
    </div>

    {loadError&&<div className="text-xs text-red-700 mt-2">Could not load this vintage map: {loadError}</div>}

    <div className="viz-card p-4 mt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">Average Waymo VMT per 1,000 Residents</h3>
        </div>
        <div className="flex gap-2">
          {(["race","income"] as DemographicView[]).map(view=><button key={view} type="button" onClick={()=>setDemographicView(view)} className={`rounded-full border px-3 py-1.5 text-sm transition ${demographicView===view?"border-[#184f95] bg-[#184f95] text-white":"border-[#cad8e8] bg-white text-neutral-700"}`}>{view==="race"?"Race / Ethnicity":"Income"}</button>)}
        </div>
      </div>
      <div className="mt-2 text-xs text-neutral-500">
        {demographicView==="race"
          ?"Each bar is the average VMT-per-resident intensity of the S2 cells where residents of that group live, weighted by the estimated number of group residents in each cell."
          :"Cells are grouped by estimated household-income context; bars show the population-weighted average VMT-per-resident intensity within each income band."}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={demographicRows} layout="vertical" margin={{top:16,right:20,bottom:5,left:28}}>
          <CartesianGrid {...GRID_PROPS}/>
          <XAxis type="number" {...AXIS_PROPS} tickFormatter={v=>compactMiles(Number(v))}/>
          <YAxis type="category" dataKey="category" {...AXIS_PROPS} width={145}/>
          <Tooltip {...TOOLTIP_PROPS} formatter={(v)=>[`${Math.round(Number(v)).toLocaleString()} miles per 1,000 residents`,"Average VMT intensity"]}/>
          <Bar dataKey="vmt_per_1000" name="Average VMT per 1,000 residents" fill={SERIES.blue}/>
        </BarChart>
      </ResponsiveContainer>
      <div className="text-xs leading-relaxed text-neutral-500">
        This is a place-based exposure indicator, not rider demographics: it compares Waymo VMT intensity in the S2 cells where different resident groups live.
      </div>
    </div>

    <div className="viz-card p-4 mt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">Mileage Growth by Market</h3>
          <div className="text-sm text-neutral-500">Cumulative operational miles represented by each S2 benchmark release.</div>
        </div>
        <div className="min-w-[220px]">
          <div className="filter-label">Market</div>
          <div className="mt-2 flex flex-wrap gap-2 justify-end">
            {Object.keys(marketHistory.markets).sort().map(m=><button
              key={m}
              type="button"
              onClick={()=>setGrowthMarket(m)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${growthMarket===m?"border-[#184f95] bg-[#184f95] text-white":"border-[#cad8e8] bg-white text-neutral-700 hover:border-[#184f95] hover:text-[#184f95]"}`}
            >{m}</button>)}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartRows} margin={{top:18,right:10,bottom:5,left:0}}>
          <CartesianGrid {...GRID_PROPS}/>
          <XAxis dataKey="vintage" {...AXIS_PROPS}/>
          <YAxis {...AXIS_PROPS} tickFormatter={v=>`${v}M`}/>
          <Tooltip {...TOOLTIP_PROPS} formatter={(v)=>`${v}M miles`}/>
          <Line type="monotone" dataKey="cumulative" name="Cumulative RO miles" stroke={SERIES.blue} strokeWidth={2.5} dot={false}/>
          <Line type="monotone" dataKey="added" name="RO miles added this quarter" stroke={SERIES.orange} strokeWidth={1.8} dot={false}/>
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
