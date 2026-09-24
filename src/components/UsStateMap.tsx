"use client";

import { useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";

const GEO_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/us-states-10m.json`;

const STATE_ABBREV_BY_NAME: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO",
  Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
  "District of Columbia": "DC",
};

const SEQUENTIAL_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

export interface MapMarker {
  name: string;
  coordinates: [number, number];
  company?: string;
  status?: string;
  mode?: string;
}

export interface MapCategory {
  label: string;
  color: string;
  detail?: string;
}

export function UsStateMap({
  valueByAbbrev,
  highlightAbbrevs,
  highlightLabel = "Present",
  categoryByAbbrev,
  categories,
  markers = [],
  onStateClick,
  selectedAbbrev,
}: {
  valueByAbbrev?: Record<string, number>;
  highlightAbbrevs?: string[];
  highlightLabel?: string;
  categoryByAbbrev?: Record<string, string>;
  categories?: Record<string, MapCategory>;
  markers?: MapMarker[];
  onStateClick?: (abbrev: string, name: string) => void;
  selectedAbbrev?: string;
}) {
  const [hovered, setHovered] = useState<{ text: string; x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([-96, 38]);
  const values = valueByAbbrev ? Object.values(valueByAbbrev) : [];
  const max = values.length ? Math.max(...values) : 0;
  const highlightSet = new Set(highlightAbbrevs ?? []);
  const isHighlightMode = highlightAbbrevs !== undefined;
  const isCategoryMode = categoryByAbbrev !== undefined && categories !== undefined;

  function colorFor(abbrev: string): string {
    if (isCategoryMode) {
      const key = categoryByAbbrev?.[abbrev];
      return key && categories?.[key] ? categories[key].color : "#eeede9";
    }
    if (isHighlightMode) return highlightSet.has(abbrev) ? "#2a78d6" : "#eeede9";
    const v = valueByAbbrev?.[abbrev];
    if (v === undefined || max === 0) return "#eeede9";
    const intensity = Math.sqrt(v / max);
    const step = Math.min(SEQUENTIAL_RAMP.length - 1, Math.round(intensity * (SEQUENTIAL_RAMP.length - 1)));
    return SEQUENTIAL_RAMP[step];
  }

  function stateText(name: string, abbrev: string, value: number | undefined) {
    if (isCategoryMode) {
      const key = categoryByAbbrev?.[abbrev];
      const cat = key ? categories?.[key] : undefined;
      return cat ? `${name}: ${cat.label}` : `${name}: No Classified Record Yet`;
    }
    if (isHighlightMode) return `${name}: ${highlightSet.has(abbrev) ? highlightLabel : "No Data"}`;
    return `${name}: ${value !== undefined ? Math.round(value).toLocaleString() : "No Public Operational Data Yet"}`;
  }

  function reset() {
    setZoom(1);
    setCenter([-96, 38]);
  }

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-[2] flex gap-1">
        <button className="map-control" onClick={() => setZoom(z => Math.min(6, z * 1.5))} aria-label="Zoom in">+</button>
        <button className="map-control" onClick={() => setZoom(z => Math.max(1, z / 1.5))} aria-label="Zoom out">−</button>
        <button className="map-control px-2" onClick={reset}>Reset</button>
      </div>
      <ComposableMap projection="geoAlbersUsa" width={800} height={480} style={{ width: "100%", height: "auto" }}>
        <ZoomableGroup
          zoom={zoom}
          center={center}
          minZoom={1}
          maxZoom={6}
          onMoveEnd={({ coordinates, zoom: nextZoom }) => {
            setCenter(coordinates as [number, number]);
            setZoom(nextZoom ?? 1);
          }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              [...geographies].sort((a, b) => Number(STATE_ABBREV_BY_NAME[a.properties?.name as string] === selectedAbbrev) - Number(STATE_ABBREV_BY_NAME[b.properties?.name as string] === selectedAbbrev)).map((geo) => {
                const name = (geo.properties?.name as string) ?? "";
                const abbrev = STATE_ABBREV_BY_NAME[name] ?? "";
                const value = valueByAbbrev?.[abbrev];
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={colorFor(abbrev)}
                    strokeWidth={(selectedAbbrev === abbrev ? 2.8 : 0.75) / zoom}
                    stroke={selectedAbbrev === abbrev ? "#111827" : "#ffffff"}
                    aria-label={stateText(name, abbrev, value)}
                    role={onStateClick ? "button" : undefined}
                    tabIndex={onStateClick ? 0 : undefined}
                    onKeyDown={(evt) => { if (onStateClick && (evt.key === "Enter" || evt.key === " ")) { evt.preventDefault(); onStateClick(abbrev, name); } }}
                    onMouseEnter={(evt) => setHovered({ text: stateText(name, abbrev, value), x: evt.clientX, y: evt.clientY })}
                    onMouseMove={(evt) => setHovered((h) => h ? { ...h, x: evt.clientX, y: evt.clientY } : h)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onStateClick?.(abbrev, name)}
                    style={{ outline: "none", cursor: onStateClick ? "pointer" : "grab" }}
                  />
                );
              })
            }
          </Geographies>

          {markers.map((m, i) => (
            <Marker key={`${m.name}-${m.company ?? ""}-${i}`} coordinates={m.coordinates}>
              <circle
                r={5.5 / Math.sqrt(zoom)}
                fill="#eb6834"
                stroke="#ffffff"
                strokeWidth={1.5 / zoom}
                onMouseEnter={(evt) => setHovered({
                  text: [m.company, m.name, m.status, m.mode].filter(Boolean).join(" · "),
                  x: evt.clientX,
                  y: evt.clientY,
                })}
                onMouseMove={(evt) => setHovered((h) => h ? { ...h, x: evt.clientX, y: evt.clientY } : h)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {isCategoryMode && categories && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-2 text-xs text-neutral-600">
          {Object.entries(categories).map(([key, cat]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: cat.color }} />
              <span>{cat.label}</span>
            </div>
          ))}
        </div>
      )}

      {hovered && (
        <div className="fixed z-20 pointer-events-none bg-neutral-900 text-white text-xs rounded px-2 py-1 max-w-xs" style={{ left: hovered.x + 12, top: hovered.y + 12 }}>
          {hovered.text}
        </div>
      )}
    </div>
  );
}
