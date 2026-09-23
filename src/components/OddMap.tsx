"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    L?: any;
  }
}

type Feature = {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry: any;
};

export type OddPolygon = {
  feature: Feature;
  company: string;
  market: string;
  state: string;
  phase: string;
  event_date?: string;
  event_type?: string;
  geometry_ref: string;
  geometry_type?: string;
  source_url?: string;
};

export type OddPoint = {
  company: string;
  market: string;
  state: string;
  lat: number;
  lon: number;
  phase: string;
  status: string;
  mode: string;
};

export type S2CellFeature = {
  type: "Feature";
  properties: {
    state?: string;
    county?: string;
    s2_cell?: string;
    waymo_ro_miles?: number;
    incremental_miles?: number;
  };
  geometry: any;
};

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

function ensureLeafletCss() {
  if (document.querySelector('link[data-av-odd-leaflet="1"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = LEAFLET_CSS;
  link.crossOrigin = "";
  link.dataset.avOddLeaflet = "1";
  document.head.appendChild(link);
}

function loadLeaflet(): Promise<any> {
  if (window.L) return Promise.resolve(window.L);
  const existing = document.querySelector<HTMLScriptElement>('script[data-av-odd-leaflet="1"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(window.L), { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.crossOrigin = "";
    script.dataset.avOddLeaflet = "1";
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function OddMap({
  polygons,
  points,
  onPolygonClick,
  compact = false,
  hideLegend = false,
  s2Features = [],
}: {
  polygons: OddPolygon[];
  points: OddPoint[];
  onPolygonClick?: (p: OddPolygon) => void;
  compact?: boolean;
  hideLegend?: boolean;
  s2Features?: S2CellFeature[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLeafletCss();

    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || !L) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        center: [38, -96],
        zoom: 4,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: true,
        scrollWheelZoom: true,
        worldCopyJump: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      const polygonLayer = L.layerGroup().addTo(map);
      const s2Layer = L.layerGroup().addTo(map);
      const pointLayer = L.layerGroup().addTo(map);

      const s2Values = s2Features
        .map(f => Number(f.properties?.waymo_ro_miles ?? 0))
        .filter(v => Number.isFinite(v) && v > 0)
        .sort((a,b)=>a-b);
      const q = (p:number) => s2Values.length
        ? s2Values[Math.min(s2Values.length-1, Math.floor((s2Values.length-1)*p))]
        : 0;
      const s2Breaks = [0.1,0.25,0.4,0.55,0.7,0.82,0.92,0.98].map(q);
      const s2Ramp = ["#edf4fd","#d5e7fb","#a9cef6","#78afea","#438ad8","#2468b7","#174b8a","#0b2f5f"];
      const s2Index = (v:number) => {
        for (let i=0;i<s2Breaks.length;i++) if (v<=s2Breaks[i]) return i;
        return s2Breaks.length-1;
      };

      for (const p of polygons) {
        const isLine = p.geometry_type === "LineString" || p.geometry_type === "MultiLineString";
        const deployment = p.phase !== "testing";
        const color = deployment ? "#184f95" : "#a86f00";
        const fillColor = deployment ? "#2a78d6" : "#eda100";

        const feature = {
          ...p.feature,
          properties: {
            ...(p.feature.properties ?? {}),
            company: p.company,
            market: p.market,
            state: p.state,
            phase: p.phase,
            event_date: p.event_date,
            geometry_ref: p.geometry_ref,
          },
        };

        const layer = L.geoJSON(feature, {
          style: {
            color,
            weight: isLine ? 4 : 2,
            opacity: 0.95,
            fillColor,
            fillOpacity: isLine ? 0 : (s2Features.length ? 0.035 : 0.22),
          },
        });

        const props = (p.feature.properties ?? {}) as Record<string, unknown>;
        const status = props.status ? `<div style="margin-top:4px"><b>Status:</b> ${escapeHtml(props.status).replaceAll("_"," ")}</div>` : "";
        const basis = props.geometry_basis ? `<div><b>Geometry:</b> ${escapeHtml(props.geometry_basis).replaceAll("_"," ")}</div>` : "";
        const routeBasis = props.route_basis ? `<div style="margin-top:4px">${escapeHtml(props.route_basis)}</div>` : "";
        const regulatory = props.regulatory_basis ? `<div style="margin-top:4px;color:#666">${escapeHtml(props.regulatory_basis)}</div>` : "";
        const source = p.source_url
          ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noreferrer">status / route source</a>`
          : "";
        const geometrySource = props.geometry_source_url
          ? `<a href="${escapeHtml(props.geometry_source_url)}" target="_blank" rel="noreferrer">geometry source</a>`
          : "";
        const links = [source, geometrySource].filter(Boolean).join(" · ");
        layer.bindPopup(
          `<div style="font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;min-width:220px;max-width:320px">
            <div style="font-weight:700">${escapeHtml(p.company)} · ${escapeHtml(p.market)}</div>
            <div>${escapeHtml(p.state)} · ${escapeHtml(p.phase)}${p.event_date ? ` · ${escapeHtml(p.event_date)}` : ""}</div>
            ${status}${basis}${routeBasis}${regulatory}
            ${links ? `<div style="margin-top:7px">${links}</div>` : ""}
          </div>`
        );
        layer.on("click", () => onPolygonClick?.(p));
        layer.addTo(polygonLayer);

        try {
          const b = layer.getBounds();
          if (b?.isValid()) bounds.extend(b);
        } catch {}
      }

      for (const feature of s2Features) {
        const miles = Number(feature.properties?.waymo_ro_miles ?? 0);
        const added = Number(feature.properties?.incremental_miles ?? 0);
        const cell = L.geoJSON(feature as any, {
          style: {
            color: "rgba(255,255,255,.9)",
            weight: 0.45,
            opacity: 0.9,
            fillColor: miles > 0 ? s2Ramp[s2Index(miles)] : "#e5e5e3",
            fillOpacity: miles > 0 ? 0.88 : 0.25,
          },
        });
        const p = feature.properties ?? {};
        cell.bindTooltip(
          `<div style="font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;min-width:170px">
            <div style="font-weight:700">${escapeHtml(p.county || "Waymo S2 cell")}${p.state ? `, ${escapeHtml(p.state)}` : ""}</div>
            <div style="font-size:15px;font-weight:700;margin-top:3px">${escapeHtml(Math.round(miles).toLocaleString())} miles</div>
            <div style="color:#666">Added since prior release: ${escapeHtml(Math.round(added).toLocaleString())} mi</div>
            <div style="color:#666">S2 ${escapeHtml(p.s2_cell || "")}</div>
          </div>`,
          {sticky:true,direction:"top",opacity:0.96}
        );
        cell.addTo(s2Layer);
        try {
          const b = cell.getBounds();
          if (b?.isValid()) bounds.extend(b);
        } catch {}
      }

      for (const p of points) {
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: 5,
          color: "#ffffff",
          weight: 1.5,
          fillColor: "#eb6834",
          fillOpacity: 1,
        });
        marker.bindPopup(
          `<div style="font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;min-width:170px">
            <div style="font-weight:700">${escapeHtml(p.company)} · ${escapeHtml(p.market)}</div>
            <div>${escapeHtml(p.state)} · ${escapeHtml(p.phase)} · ${escapeHtml(p.status)}</div>
          </div>`
        );
        marker.addTo(pointLayer);
        bounds.extend([p.lat, p.lon]);
      }

      const resetView = () => {
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.12), { maxZoom: 11, animate: false });
        } else {
          map.setView([38, -96], 4, { animate: false });
        }
      };

      resetView();

      const ResetControl = L.Control.extend({
        options: { position: "topright" },
        onAdd: () => {
          const button = L.DomUtil.create("button", "odd-leaflet-reset");
          button.type = "button";
          button.innerHTML = "Reset";
          button.title = "Fit map to displayed ODD geography";
          L.DomEvent.disableClickPropagation(button);
          L.DomEvent.on(button, "click", resetView);
          return button;
        },
      });
      new ResetControl().addTo(map);

      const info = L.control({ position: "bottomleft" });
      info.onAdd = () => {
        const div = L.DomUtil.create("div", "odd-leaflet-note");
        div.innerHTML = "Scroll or use +/− to zoom · drag to pan · click areas for details";
        return div;
      };
      info.addTo(map);
    }).catch(() => {
      if (!cancelled && containerRef.current) {
        containerRef.current.innerHTML =
          '<div style="padding:24px;color:#666">Map library failed to load. Refresh to retry.</div>';
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [polygons, points, onPolygonClick, s2Features]);

  return (
    <div>
      <div
        ref={containerRef}
        className={compact ? "odd-leaflet-map odd-leaflet-map-compact" : "odd-leaflet-map"}
        aria-label="Interactive ODD and service-area map"
      />
      {!hideLegend && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-600">
        <span><span className="inline-block w-3 h-3 align-middle mr-1 rounded-sm bg-[#2a78d6]/25 border border-[#184f95]" />Deployment/service boundary</span>
        <span><span className="inline-block w-3 h-3 align-middle mr-1 rounded-sm bg-[#eda100]/25 border border-[#a86f00]" />Testing boundary</span>
        <span><span className="inline-block w-3 h-1 align-middle mr-1 bg-[#184f95]" />Road-following corridor (only when sourced)</span>
        {s2Features.length > 0 && <span><span className="inline-block w-3 h-3 align-middle mr-1 rounded-sm bg-[#438ad8]" />Waymo VMT by S2 cell</span>}
        <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1 rounded-full bg-[#eb6834]" />Market without sourced polygon</span>
      </div>}
    </div>
  );
}
