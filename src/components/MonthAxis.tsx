"use client";

import { useEffect, useState } from "react";
import { AXIS_PROPS } from "@/lib/chartTheme";

// Label tiers, widest first. Every month is labeled until even initials do not fit.
const PX_ABBR = 28; // "Mar", year under January
const PX_INITIAL = 15; // "M", year under January
const PX_FULL = 64; // "Mar 2024" every nth month
const SIDEBAR_AND_PADDING = 320; // desktop sidebar + page gutters + card padding
const Y_AXIS = 70;

type TickProps = { x?: number | string; y?: number | string; index?: number; payload?: { value: string } };

type Mode = "abbr" | "initial" | "full";

function MonthTick({ x: rawX = 0, y: rawY = 0, index = 0, payload, step, mode }: TickProps & { step: number; mode: Mode }) {
  if (!payload || index % step !== 0) return null;
  const x = Number(rawX);
  const y = Number(rawY);
  const [month, year] = payload.value.split(" ");
  const style = { fill: AXIS_PROPS.tick.fill, fontSize: mode === "full" ? AXIS_PROPS.tick.fontSize : 12 };
  if (mode === "full") return <text x={x} y={y + 14} textAnchor="middle" {...style}>{payload.value}</text>;
  return <text x={x} y={y + 14} textAnchor="middle" {...style}>
    <tspan x={x}>{mode === "initial" ? month[0] : month}</tspan>
    {(month === "Jan" || index === 0) && <tspan x={x} dy={14}>{year}</tspan>}
  </text>;
}

/**
 * X-axis props that label every month when the chart is wide enough, and fall
 * use initials, and only then fall back to evenly spaced "Mon YYYY" labels. `columns` is how
 * many charts share a row on desktop.
 */
export function useMonthAxis(count: number, columns = 1) {
  const [viewport, setViewport] = useState(1280);
  useEffect(() => {
    const update = () => setViewport(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const desktop = viewport >= 1024;
  const plot = Math.max(200, (desktop ? (viewport - SIDEBAR_AND_PADDING) / columns : viewport - 80) - Y_AXIS);
  const mode: Mode = count * PX_ABBR <= plot ? "abbr" : count * PX_INITIAL <= plot ? "initial" : "full";
  const step = mode === "full" ? Math.ceil(count * PX_FULL / plot) : 1;
  return {
    ...AXIS_PROPS,
    interval: 0 as const,
    height: mode === "full" ? 30 : 44,
    tick: (props: TickProps) => <MonthTick {...props} step={step} mode={mode} />,
  };
}
