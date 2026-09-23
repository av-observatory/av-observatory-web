"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposableMap, Geographies, Geography, Marker, ZoomableGroup,
} from "react-simple-maps";

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type Feature = {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry: unknown;
};
type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

function signedRingArea(ring: number[][]) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function normalizeRing(ring: number[][], exterior: boolean) {
  const area = signedRingArea(ring);
  // react-simple-maps / d3-geo expects exterior rings clockwise in lon/lat
  // (negative planar signed area) and holes counter-clockwise. AV Map source
  // geometries contain mixed winding, so normalize each ring independently.
  const shouldReverse = exterior ? area > 0 : area < 0;
  return shouldReverse ? [...ring].reverse() : ring;
}

function normalizeWinding(geometry: any) {
  if (!geometry || !geometry.type || !geometry.coordinates) return geometry;
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring: number[][], i: number) =>
        normalizeRing(ring, i === 0)
      ),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((poly: number[][][]) =>
        poly.map((ring: number[][], i: number) => normalizeRing(ring, i === 0))
      ),
    };
  }
  return geometry;
}

function geometryCoordinates(geometry: any, out: [number, number][] = []) {
  if (!geometry) return out;
  const walk = (value: any) => {
    if (Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number") {
      out.push([value[0], value[1]]);
      return;
    }
    if (Array.isArray(value)) value.forEach(walk);
  };
  walk(geometry.coordinates);
  return out;
}

function fitView(polygons: OddPolygon[], points: OddPoint[]) {
  const coords: [number, number][] = [];
  polygons.forEach(p => geometryCoordinates(p.feature.geometry, coords));
  points.forEach(p => coords.push([p.lon, p.lat]));
  if (!coords.length) return { center: [-96, 38] as [number, number], zoom: 1 };

  const xs = coords.map(d => d[0]);
  const ys = coords.map(d => d[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(0.05, maxX - minX);
  const spanY = Math.max(0.05, maxY - minY);
  const span = Math.max(spanX, spanY * 1.45);
  const center: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];

  let zoom = 1;
  if (span < 0.35) zoom = 9;
  else if (span < 0.75) zoom = 7;
  else if (span < 1.5) zoom = 5.5;
  else if (span < 3) zoom = 4;
  else if (span < 7) zoom = 2.8;
  else if (span < 15) zoom = 2;
  else if (span < 28) zoom = 1.45;
  return { center, zoom };
}

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

export function OddMap({
  polygons,
  points,
  onPolygonClick,
}: {
  polygons: OddPolygon[];
  points: OddPoint[];
  onPolygonClick?: (p: OddPolygon) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([-96, 38]);
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);

  const collection = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: polygons.map(p => ({
      ...p.feature,
      // Normalize mixed source winding so no service area is interpreted as
      // the complement of its intended polygon.
      geometry: normalizeWinding(p.feature.geometry),
      properties: {
        ...(p.feature.properties ?? {}),
        __company: p.company,
        __market: p.market,
        __state: p.state,
        __phase: p.phase,
        __date: p.event_date,
        __geometry_ref: p.geometry_ref,
      },
    })),
  }), [polygons]);

  const polyByRef = useMemo(() => {
    const m = new Map<string, OddPolygon>();
    for (const p of polygons) m.set(p.geometry_ref, p);
    return m;
  }, [polygons]);

  const fitted = useMemo(() => fitView(polygons, points), [polygons, points]);

  useEffect(() => {
    setCenter(fitted.center);
    setZoom(fitted.zoom);
  }, [fitted.center[0], fitted.center[1], fitted.zoom]);

  function reset() {
    setCenter(fitted.center);
    setZoom(fitted.zoom);
  }

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-[2] flex gap-1">
        <button className="map-control" onClick={() => setZoom(z => Math.min(10, z * 1.5))}>+</button>
        <button className="map-control" onClick={() => setZoom(z => Math.max(1, z / 1.5))}>−</button>
        <button className="map-control px-2" onClick={reset}>Reset</button>
      </div>

      <ComposableMap projection="geoAlbersUsa" width={900} height={560} style={{ width: "100%", height: "auto" }}>
        <ZoomableGroup
          zoom={zoom}
          center={center}
          minZoom={0.9}
          maxZoom={12}
          onMoveEnd={({ coordinates, zoom: z }) => {
            setCenter(coordinates as [number, number]);
            setZoom(z ?? 1);
          }}
        >
          <Geographies geography={STATES_URL}>
            {({ geographies }) => geographies.map(geo => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#f3f2ef"
                stroke="#d7d5ce"
                strokeWidth={0.8 / zoom}
                style={{ outline: "none", cursor: "grab" }}
              />
            ))}
          </Geographies>

          <Geographies geography={collection}>
            {({ geographies }) => geographies.map(geo => {
              const ref = String(geo.properties?.__geometry_ref ?? "");
              const p = polyByRef.get(ref);
              const label = p
                ? [p.company, p.market, p.phase, p.event_date].filter(Boolean).join(" · ")
                : ref;
              const geometryType = String((geo.geometry as { type?: string })?.type ?? p?.geometry_type ?? "");
              const isLine = geometryType === "LineString" || geometryType === "MultiLineString";
              const phaseColor = p?.phase === "testing" ? "#eda100" : "#2a78d6";
              const phaseStroke = p?.phase === "testing" ? "#a86f00" : "#184f95";
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isLine ? "none" : phaseColor}
                  fillOpacity={isLine ? 0 : 0.22}
                  stroke={phaseStroke}
                  strokeWidth={(isLine ? 3 : 1.6) / zoom}
                  onMouseEnter={(evt) => setHover({ text: label, x: evt.clientX, y: evt.clientY })}
                  onMouseMove={(evt) => setHover(h => h ? { ...h, x: evt.clientX, y: evt.clientY } : h)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => p && onPolygonClick?.(p)}
                  style={{ outline: "none", cursor: "pointer" }}
                />
              );
            })}
          </Geographies>

          {points.map((p, i) => (
            <Marker key={`${p.company}-${p.market}-${i}`} coordinates={[p.lon, p.lat]}>
              <circle
                r={5 / Math.sqrt(zoom)}
                fill="#eb6834"
                stroke="#fff"
                strokeWidth={1.5 / zoom}
                onMouseEnter={(evt) => setHover({
                  text: [p.company, p.market, p.phase, p.status].filter(Boolean).join(" · "),
                  x: evt.clientX,
                  y: evt.clientY,
                })}
                onMouseMove={(evt) => setHover(h => h ? { ...h, x: evt.clientX, y: evt.clientY } : h)}
                onMouseLeave={() => setHover(null)}
              />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-600">
        <span><span className="inline-block w-3 h-3 align-middle mr-1 rounded-sm bg-[#2a78d6]/40 border border-[#184f95]" />Deployment/service boundary</span>
        <span><span className="inline-block w-3 h-3 align-middle mr-1 rounded-sm bg-[#eda100]/40 border border-[#a86f00]" />Testing boundary</span>
        <span><span className="inline-block w-3 h-1 align-middle mr-1 bg-[#184f95]" />Freight corridor (schematic where exact road geometry is unavailable)</span>
        <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1 rounded-full bg-[#eb6834]" />Current market point without current polygon</span>
      </div>
      <div className="mt-1 text-xs text-neutral-500">Drag to pan · scroll or controls to zoom · hover or click polygons for details</div>

      {hover && (
        <div className="fixed z-30 pointer-events-none bg-neutral-900 text-white text-xs rounded px-2 py-1 max-w-sm" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          {hover.text}
        </div>
      )}
    </div>
  );
}
