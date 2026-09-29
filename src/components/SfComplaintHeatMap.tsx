"use client";

import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    L?: any;
  }
}

type ComplaintRecord = {
  id: string;
  requested_date: string;
  type: string;
  status: string;
  lat: number | null;
  long: number | null;
  neighborhood?: string;
  source_url: string;
};

type S2Feature = {
  type: "Feature";
  properties: {
    state: string;
    county: string;
    s2_cell: string;
    waymo_ro_miles: number;
    vintage_end: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: any;
  };
};

type S2GeoJSON = {
  type: "FeatureCollection";
  features: S2Feature[];
};

type Mode = "density" | "rate";

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_HEAT_JS = "https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js";

const MATCH_START = "2025-07-01";
const MATCH_END = "2026-06-30";
const MIN_MATCHED_VMT = 5000;
const RATE_RAMP = ["#edf4fd","#d5e7fb","#a9cef6","#78afea","#438ad8","#2468b7","#174b8a","#0b2f5f"];

function ensureCss() {
  if (document.querySelector('link[data-sf311-leaflet="1"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = LEAFLET_CSS;
  link.crossOrigin = "";
  link.dataset.sf311Leaflet = "1";
  document.head.appendChild(link);
}

function loadScript(src: string, attr: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[${attr}="1"]`);
  if (existing) {
    if (existing.dataset.loaded === "1") return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "";
    script.setAttribute(attr, "1");
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadLeaflet() {
  if (!window.L) await loadScript(LEAFLET_JS, "data-sf311-leaflet");
  await loadScript(LEAFLET_HEAT_JS, "data-sf311-heat");
  return window.L;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pointInRing([x,y]: [number,number], ring: number[][]) {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
    const intersects=((yi>y)!==(yj>y))&&(x<((xj-xi)*(y-yi))/(yj-yi+1e-15)+xi);
    if(intersects) inside=!inside;
  }
  return inside;
}

function pointInPolygon(point:[number,number], rings:number[][][]) {
  if(!rings?.length || !pointInRing(point,rings[0])) return false;
  for(let i=1;i<rings.length;i++) if(pointInRing(point,rings[i])) return false;
  return true;
}

function pointInGeometry(point:[number,number], geometry:S2Feature["geometry"]) {
  if(geometry.type==="Polygon") return pointInPolygon(point,geometry.coordinates);
  if(geometry.type==="MultiPolygon") return geometry.coordinates.some((p:number[][][])=>pointInPolygon(point,p));
  return false;
}

function percentile(sorted:number[], p:number) {
  if(!sorted.length) return 0;
  return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];
}

function quantileBreaks(values:number[]) {
  const positive=values.filter(v=>v>0&&Number.isFinite(v)).sort((a,b)=>a-b);
  if(!positive.length) return [1,2,3,4,5,6,7,8];
  return [0.10,0.25,0.40,0.55,0.70,0.82,0.92,0.98].map(p=>percentile(positive,p));
}

function rampIndex(v:number, breaks:number[]) {
  for(let i=0;i<breaks.length;i++) if(v<=breaks[i]) return i;
  return breaks.length-1;
}

export function SfComplaintHeatMap({ records, basePath = "" }: { records: ComplaintRecord[]; basePath?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [mode,setMode] = useState<Mode>("density");
  const [s2Latest,setS2Latest] = useState<S2GeoJSON | null>(null);
  const [s2Base,setS2Base] = useState<S2GeoJSON | null>(null);
  const [s2Error,setS2Error] = useState("");

  useEffect(()=>{
    let cancelled=false;
    Promise.all([
      fetch(`${basePath}/data/waymo_s2_202606.geojson`,{cache:"no-store"}).then(r=>{if(!r.ok)throw Error(String(r.status));return r.json();}),
      fetch(`${basePath}/data/waymo_s2_202506.geojson`,{cache:"no-store"}).then(r=>{if(!r.ok)throw Error(String(r.status));return r.json();}),
    ]).then(([latest,base])=>{
      if(cancelled)return;
      setS2Latest(latest as S2GeoJSON);
      setS2Base(base as S2GeoJSON);
    }).catch(err=>{
      if(!cancelled)setS2Error(String(err));
    });
    return()=>{cancelled=true;};
  },[basePath]);

  const matched = useMemo(()=>{
    if(!s2Latest||!s2Base) return null;
    const latest=s2Latest.features.filter(f=>f.properties.state==="California"&&f.properties.county==="San Francisco");
    const baseline=new Map(
      s2Base.features
        .filter(f=>f.properties.state==="California"&&f.properties.county==="San Francisco")
        .map(f=>[String(f.properties.s2_cell),Number(f.properties.waymo_ro_miles||0)])
    );
    const matchedComplaints=records.filter(r=>
      r.requested_date>=MATCH_START && r.requested_date<=MATCH_END &&
      Number.isFinite(r.lat) && Number.isFinite(r.long)
    ) as Array<ComplaintRecord & {lat:number;long:number}>;

    const counts=new Map<string,number>();
    for(const r of matchedComplaints){
      const point:[number,number]=[r.long,r.lat];
      const feature=latest.find(f=>pointInGeometry(point,f.geometry));
      if(feature){
        const key=String(feature.properties.s2_cell);
        counts.set(key,(counts.get(key)||0)+1);
      }
    }

    const features=latest.map(f=>{
      const key=String(f.properties.s2_cell);
      const vmt=Number(f.properties.waymo_ro_miles||0)-Number(baseline.get(key)||0);
      const complaints=counts.get(key)||0;
      const rate=vmt>=MIN_MATCHED_VMT ? complaints/vmt*100_000_000 : null;
      return {
        ...f,
        properties:{...f.properties,matched_vmt:vmt,complaints,rate_per_100m:rate}
      };
    });
    return {
      features,
      matchedComplaints:matchedComplaints.length,
      assignedComplaints:[...counts.values()].reduce((a,b)=>a+b,0),
      matchedVmt:features.reduce((s,f)=>s+Math.max(0,Number(f.properties.matched_vmt||0)),0),
    };
  },[records,s2Latest,s2Base]);

  useEffect(() => {
    let cancelled = false;
    ensureCss();

    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || !L) return;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const points = records.filter(
        (r) => Number.isFinite(r.lat) && Number.isFinite(r.long)
      ) as Array<ComplaintRecord & { lat: number; long: number }>;

      const map = L.map(containerRef.current, {
        center: [37.7749, -122.4194],
        zoom: 12,
        minZoom: 10,
        maxZoom: 18,
        zoomControl: true,
        scrollWheelZoom: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      if(mode==="density"){
        const heatPoints = points.map((r) => [r.lat, r.long, 1]);
        if (L.heatLayer) {
          L.heatLayer(heatPoints, {
            radius: 23,
            blur: 18,
            maxZoom: 17,
            minOpacity: 0.35,
            gradient: {
              0.2: "#dcecf8",
              0.4: "#91c4e8",
              0.6: "#4f96cf",
              0.8: "#2266a8",
              1.0: "#0b315f",
            },
          }).addTo(map);
        }

        const markers = L.layerGroup().addTo(map);
        for (const r of points) {
          const marker = L.circleMarker([r.lat, r.long], {
            radius: 3.5,
            color: "#ffffff",
            weight: 0.7,
            fillColor: "#174f87",
            fillOpacity: 0.5,
          });
          marker.bindPopup(
            `<div style="font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;min-width:200px">
              <div style="font-weight:700">${escapeHtml(r.requested_date)} · ${escapeHtml((r.neighborhood || "San Francisco"))}</div>
              <div style="margin-top:3px">${escapeHtml(r.type.replaceAll("_"," "))} · ${escapeHtml(r.status)}</div>
              <div style="margin-top:6px"><a href="${escapeHtml(r.source_url)}" target="_blank" rel="noreferrer">Open SF311 record ↗</a></div>
            </div>`
          );
          marker.addTo(markers);
        }

        if (points.length) {
          const bounds = L.latLngBounds(points.map((r) => [r.lat, r.long]));
          map.fitBounds(bounds.pad(0.04), { maxZoom: 13, animate: false });
        }

        const info = L.control({ position: "bottomleft" });
        info.onAdd = () => {
          const div = L.DomUtil.create("div", "odd-leaflet-note");
          div.innerHTML = `${points.length.toLocaleString()} geocoded SF311 AV requests · click dots for records`;
          return div;
        };
        info.addTo(map);
      } else if(matched) {
        const rates=matched.features.map((f:any)=>f.properties.rate_per_100m).filter((v:any)=>Number.isFinite(v)&&v>=0);
        const breaks=quantileBreaks(rates);
        const layer=L.geoJSON({type:"FeatureCollection",features:matched.features} as any,{
          style:(feature:any)=>{
            const p=feature?.properties||{};
            const vmt=Number(p.matched_vmt||0);
            const rate=p.rate_per_100m;
            if(vmt<MIN_MATCHED_VMT || rate===null || !Number.isFinite(rate)){
              return {color:"rgba(255,255,255,.9)",weight:0.6,fillColor:"#d9dde1",fillOpacity:0.5};
            }
            return {color:"rgba(255,255,255,.95)",weight:0.6,fillColor:RATE_RAMP[rampIndex(Number(rate),breaks)],fillOpacity:0.86};
          },
          onEachFeature:(feature:any,l:any)=>{
            const p=feature.properties||{};
            const vmt=Number(p.matched_vmt||0);
            const complaints=Number(p.complaints||0);
            const rate=p.rate_per_100m;
            l.bindPopup(
              `<div style="font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;min-width:220px">
                <div style="font-weight:700">S2 cell ${escapeHtml(p.s2_cell)}</div>
                <div style="margin-top:5px"><strong>${complaints.toLocaleString()}</strong> matched SF311 AV complaint${complaints===1?"":"s"}</div>
                <div><strong>${Math.max(0,vmt).toLocaleString(undefined,{maximumFractionDigits:0})}</strong> Waymo RO miles</div>
                <div><strong>${rate===null||!Number.isFinite(rate)?"Not rated":Number(rate).toLocaleString(undefined,{maximumFractionDigits:1})}</strong> complaints / 100M Waymo miles</div>
                ${vmt<MIN_MATCHED_VMT?'<div style="margin-top:5px;color:#666">Below 5,000 matched-period Waymo miles; rate suppressed.</div>':""}
              </div>`
            );
          }
        }).addTo(map);
        const bounds=layer.getBounds();
        if(bounds.isValid()) map.fitBounds(bounds.pad(0.03),{maxZoom:13,animate:false});

        const info=L.control({position:"bottomleft"});
        info.onAdd=()=>{
          const div=L.DomUtil.create("div","odd-leaflet-note");
          div.innerHTML=`${matched.assignedComplaints.toLocaleString()} geocoded complaints assigned to S2 cells · ${Math.round(matched.matchedVmt/1e6).toLocaleString()}M matched Waymo RO miles`;
          return div;
        };
        info.addTo(map);

        const legend=L.control({position:"bottomright"});
        legend.onAdd=()=>{
          const div=L.DomUtil.create("div","odd-leaflet-note");
          div.innerHTML='<strong>Complaints / 100M Waymo VMT</strong><br><span style="display:inline-block;width:90px;height:8px;margin-top:4px;background:linear-gradient(90deg,#edf4fd,#438ad8,#0b2f5f)"></span><br><span style="font-size:11px">lighter → lower · darker → higher</span>';
          return div;
        };
        legend.addTo(map);
      }
    }).catch(() => {
      if (!cancelled && containerRef.current) {
        containerRef.current.innerHTML =
          '<div style="padding:24px;color:#666">Complaint map failed to load. Refresh to retry.</div>';
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [records,mode,matched]);

  return <div>
    <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="San Francisco complaint map metric">
      <button type="button" onClick={()=>setMode("density")} className={`rounded px-3 py-2 text-sm font-medium border ${mode==="density"?"bg-[#123b69] text-white border-[#123b69]":"bg-white text-[#123b69] border-[#b8c8d8]"}`}>Complaint Density</button>
      <button type="button" onClick={()=>setMode("rate")} className={`rounded px-3 py-2 text-sm font-medium border ${mode==="rate"?"bg-[#123b69] text-white border-[#123b69]":"bg-white text-[#123b69] border-[#b8c8d8]"}`}>Complaints per 100M Waymo VMT</button>
    </div>
    {mode==="rate" && <p className="text-xs text-neutral-600 mb-3">
      Matched period: July 2025–June 2026. Numerator is all-operator SF311 AV complaints; denominator is Waymo rider-only S2 VMT added over the same period. This is an exposure-normalized context measure, not a Waymo complaint rate.
      {s2Error ? " S2 data failed to load." : ""}
    </p>}
    <div ref={containerRef} className="odd-leaflet-map" aria-label={mode==="density"?"Interactive heat map of San Francisco autonomous vehicle 311 complaints":"Interactive S2 map of San Francisco AV complaints per 100 million Waymo rider-only miles"} />
    <p className="text-sm text-neutral-600 mt-3">
      {mode==="density"
        ? "The heat layer shows complaint density from records with published coordinates. Individual dots are clickable and link back to the underlying SF311 record. Records without coordinates remain in citywide totals but are not shown on the map."
        : "Each S2 cell shows matched-period SF311 AV complaints divided by Waymo rider-only miles in that cell. Cells with fewer than 5,000 matched-period Waymo miles are shown gray to avoid unstable rates. Click a cell for its complaint count, VMT, and rate."}
    </p>
  </div>;
}
