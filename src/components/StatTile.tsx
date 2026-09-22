export function StatTile({
  label,
  value,
  pctChange,
  changeLabel = "vs prior 12 months",
  caption,
}: {
  label: string;
  value: string;
  pctChange?: number | null;
  changeLabel?: string;
  caption?: string;
}) {
  return (
    <div className="viz-card p-4 flex-1 min-w-[200px]">
      <div className="text-xs font-medium tracking-wide uppercase" style={{ color: "#898781" }}>{label}</div>
      <div className="mt-1.5 text-[28px] leading-tight font-semibold tracking-tight tabular-nums" style={{ color: "#0b0b0b" }}>
        {value}
      </div>
      {pctChange !== undefined && pctChange !== null && (
        <div className="mt-1.5 text-xs font-medium" style={{ color: pctChange >= 0 ? "#006300" : "#d03b3b" }}>
          {pctChange >= 0 ? "▲" : "▼"} {Math.abs(pctChange)}%{" "}
          <span className="font-normal" style={{ color: "#898781" }}>{changeLabel}</span>
        </div>
      )}
      {caption && <div className="mt-1.5 text-xs" style={{ color: "#898781" }}>{caption}</div>}
    </div>
  );
}
