// Shared chart theme -- validated categorical palette + chrome tokens from
// the dataviz skill's reference palette. Fixed series order; never cycle
// arbitrarily per-chart.

export const SERIES = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
  magenta: "#e87ba4",
  green: "#008300",
  violet: "#4a3aa7",
  red: "#e34948",
} as const;

export const SERIES_ORDER = [
  SERIES.blue,
  SERIES.orange,
  SERIES.aqua,
  SERIES.yellow,
  SERIES.magenta,
  SERIES.green,
  SERIES.violet,
  SERIES.red,
];

export const CHART_CHROME = {
  surface: "#fcfcfb",
  textPrimary: "#0b0b0b",
  textSecondary: "#52514e",
  textMuted: "#898781",
  gridline: "#e1e0d9",
  axisLine: "#c3c2b7",
};

export const AXIS_PROPS = {
  stroke: CHART_CHROME.axisLine,
  tick: { fill: CHART_CHROME.textMuted, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: CHART_CHROME.axisLine },
};

export const GRID_PROPS = {
  stroke: CHART_CHROME.gridline,
  strokeDasharray: "0",
  vertical: false,
};

export const TOOLTIP_PROPS = {
  contentStyle: {
    background: CHART_CHROME.textPrimary,
    border: "none",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(11,11,11,0.18)",
    fontSize: 12,
    padding: "8px 12px",
  },
  labelStyle: { color: "#ffffff", fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: "#ffffff" },
  cursor: { stroke: CHART_CHROME.axisLine, strokeWidth: 1 },
};

export const LEGEND_PROPS = {
  wrapperStyle: { fontSize: 12, color: CHART_CHROME.textSecondary, paddingTop: 8 },
  iconType: "circle" as const,
  iconSize: 8,
};
