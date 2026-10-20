"use client";

import { useCallback, useState } from "react";
import { AXIS_PROPS } from "@/lib/chartTheme";

const PX_INITIAL = 14; // one letter per month; the year sits under January (and the first point)
const Y_AXIS = 75; // y-axis labels such as "160 min"
const RIGHT_MARGIN = 20;

type TickProps = { x?: number | string; y?: number | string; index?: number; payload?: { value: string } };

function MonthTick({ x: rawX = 0, y: rawY = 0, index = 0, payload, step, count }: TickProps & { step: number; count: number }) {
  if (!payload) return null;
  const x = Number(rawX);
  const y = Number(rawY);
  const [month, year] = payload.value.split(" ");
  const labeled = (count - 1 - index) % step === 0;
  const newYear = month === "Jan" || index === 0;
  if (!labeled && !newYear) return <line x1={x} x2={x} y1={y} y2={y + 4} stroke={AXIS_PROPS.stroke} />;
  return <text x={x} y={y + 14} textAnchor="middle" fill={AXIS_PROPS.tick.fill} fontSize={12}>
    {labeled && <tspan x={x}>{month[0]}</tspan>}
    {newYear && <tspan x={x} dy={labeled ? 14 : 28}>{year}</tspan>}
  </text>;
}

/**
 * Uniform month axis for every time-series chart: the first letter of each month with the
 * four-digit year beneath January (and the first point). When the chart is too narrow for
 * every month, letters thin out to every nth month but the year still marks each January.
 * Pass `onResize` to the chart's ResponsiveContainer so the choice uses the measured width.
 */
export function useMonthAxis(count: number) {
  const [width, setWidth] = useState(0);
  const onResize = useCallback((w: number) => setWidth(Math.round(w)), []);
  const plot = Math.max(120, (width || 700) - Y_AXIS - RIGHT_MARGIN);
  const step = Math.max(1, Math.ceil(count * PX_INITIAL / plot));
  const axis = {
    ...AXIS_PROPS,
    interval: 0 as const,
    height: 44,
    tick: (props: TickProps) => <MonthTick {...props} step={step} count={count} />,
  };
  return { axis, onResize, width };
}
