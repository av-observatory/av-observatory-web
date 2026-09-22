import { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  source,
  children,
}: {
  title: string;
  subtitle?: string;
  source?: string;
  children: ReactNode;
}) {
  return (
    <div className="viz-card p-5 flex flex-col">
      <h2 className="text-base font-semibold tracking-tight" style={{ color: "#0b0b0b" }}>{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs" style={{ color: "#898781" }}>{subtitle}</p>}
      <div className="mt-4 flex-1">{children}</div>
      {source && <div className="mt-3 text-xs" style={{ color: "#898781" }}>Source: {source}</div>}
    </div>
  );
}
