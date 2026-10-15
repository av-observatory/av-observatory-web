"use client";

import { useCallback, useState } from "react";
import { AXIS_PROPS } from "@/lib/chartTheme";

// Label tiers, widest first. Every month is labeled until even initials do not fit.
const PX_ABBR = 28; // "Mar", year under January
const PX_INITIAL = 15; // "M", year under January
const PX_FULL = 72; // "Mar ’24" every nth month; the last label is right-aligned, so leave room
const Y_AXIS = 75; // y-axis labels such as "160 min"
const RIGHT_MARGIN = 20;

type TickProps = { x?: number | string; y?: number | string; index?: number; payload?: { value: string } };

type Mode = "abbr" | "initial" | "full";

function MonthTick({ x: rawX = 0, y: rawY = 0, index = 0, payload, step, mode, count }: TickProps & { step: number; mode: Mode; count: number }) {
  if (!payload) return null;
  const x = Number(rawX);
  const y = Number(rawY);
  // Anchored on the latest month so it is always labeled; every other month still gets a tick.
  if ((count - 1 - index) % step !== 0) return <line x1={x} x2={x} y1={y} y2={y + 4} stroke={AXIS_PROPS.stroke} />;
  const [month, year] = payload.value.split(" ");
  const style = { fill: AXIS_PROPS.tick.fill, fontSize: mode === "full" ? AXIS_PROPS.tick.fontSize : 12 };
  if (mode === "full") return <text x={x} y={y + 14} textAnchor={index === count - 1 ? "end" : "middle"} {...style}>{`${month} ’${year.slice(2)}`}</text>;
  return <text x={x} y={y + 14} textAnchor="middle" {...style}>
    <tspan x={x}>{mode === "initial" ? month[0] : month}</tspan>
    {(month === "Jan" || index === 0) && <tspan x={x} dy={14}>{year}</tspan>}
  </text>;
}

/**
 * X-axis props that label every month when the chart is wide enough, then
 * use initials, and only then fall back to ticks for every month with
 * "Mon ’YY" labels every nth month. Pass `onResize` to the chart's
 * ResponsiveContainer so the choice uses the measured width.
 */
export function useMonthAxis(count: number) {
  const [width, setWidth] = useState(0);
  const onResize = useCallback((w: number) => setWidth(Math.round(w)), []);
  const plot = Math.max(120, (width || 700) - Y_AXIS - RIGHT_MARGIN);
  const mode: Mode = count * PX_ABBR <= plot ? "abbr" : count * PX_INITIAL <= plot ? "initial" : "full";
  const step = mode === "full" ? Math.ceil(count * PX_FULL / plot) : 1;
  const axis = {
    ...AXIS_PROPS,
    interval: 0 as const,
    height: mode === "full" ? 30 : 44,
    tick: (props: TickProps) => <MonthTick {...props} step={step} mode={mode} count={count} />,
  };
  return { axis, onResize };
}
