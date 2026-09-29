"use client";

import { useEffect, useRef } from "react";

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

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_HEAT_JS = "https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js";

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

export function SfComplaintHeatMap({ records }: { records: ComplaintRecord[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

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
  }, [records]);

  return <div ref={containerRef} className="odd-leaflet-map" aria-label="Interactive heat map of San Francisco autonomous vehicle 311 complaints" />;
}
