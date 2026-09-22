"use client";

import { useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

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

// Sequential blue ramp, light -> dark (dataviz skill reference palette).
const SEQUENTIAL_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

export function UsStateMap({
  valueByAbbrev,
  highlightAbbrevs,
  highlightLabel = "Present",
  onStateClick,
}: {
  valueByAbbrev?: Record<string, number>;
  /** When provided, switches to binary highlight mode: states in this list
   * get one accent color, everything else is neutral. Takes precedence
   * over valueByAbbrev's magnitude coloring. */
  highlightAbbrevs?: string[];
  highlightLabel?: string;
  onStateClick?: (abbrev: string, name: string) => void;
}) {
  const [hovered, setHovered] = useState<{ name: string; value: number | null; x: number; y: number } | null>(null);
  const values = valueByAbbrev ? Object.values(valueByAbbrev) : [];
  const max = values.length ? Math.max(...values) : 0;
  const highlightSet = new Set(highlightAbbrevs ?? []);
  const isHighlightMode = highlightAbbrevs !== undefined;

  function colorFor(abbrev: string): string {
    if (isHighlightMode) {
      return highlightSet.has(abbrev) ? "#2a78d6" : "#eeede9";
    }
    const v = valueByAbbrev?.[abbrev];
    if (v === undefined || max === 0) return "#eeede9";
    const intensity = Math.sqrt(v / max); // sqrt scale so mid-range states stay visible
    const step = Math.min(SEQUENTIAL_RAMP.length - 1, Math.round(intensity * (SEQUENTIAL_RAMP.length - 1)));
    return SEQUENTIAL_RAMP[step];
  }

  return (
    <div className="relative">
      <ComposableMap projection="geoAlbersUsa" width={800} height={480} style={{ width: "100%", height: "auto" }}>
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name = (geo.properties?.name as string) ?? "";
              const abbrev = STATE_ABBREV_BY_NAME[name] ?? "";
              const value = valueByAbbrev?.[abbrev];
              const isHovered = hovered?.name === name;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isHovered ? "#0b1d33" : colorFor(abbrev)}
                  stroke="#ffffff"
                  strokeWidth={0.75}
                  onMouseEnter={(evt) => {
                    setHovered({ name, value: value ?? null, x: evt.clientX, y: evt.clientY });
                  }}
                  onMouseMove={(evt) => {
                    setHovered((h) => (h ? { ...h, x: evt.clientX, y: evt.clientY } : h));
                  }}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onStateClick?.(abbrev, name)}
                  style={{ outline: "none", cursor: onStateClick ? "pointer" : "default" }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {hovered && (
        <div
          className="fixed z-10 pointer-events-none bg-neutral-900 text-white text-xs rounded px-2 py-1"
          style={{ left: hovered.x + 12, top: hovered.y + 12 }}
        >
          {isHighlightMode
            ? `${hovered.name}: ${highlightSet.has(STATE_ABBREV_BY_NAME[hovered.name] ?? "") ? highlightLabel : "No data"}`
            : `${hovered.name}: ${hovered.value !== null ? Math.round(hovered.value).toLocaleString() : "No public operational data yet"}`}
        </div>
      )}
    </div>
  );
}
