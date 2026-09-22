import { ReactNode } from "react";

export function ChartCard({
  title,
  subtitle,
  source,
  updated,
  children,
}: {
  title: string;
  subtitle?: string;
  source: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold tracking-tight" style={{ color: "#0b0b0b" }}>{title}</h2>
      {subtitle && <p className="mt-1 text-sm" style={{ color: "#52514e" }}>{subtitle}</p>}
      <div className="viz-card mt-4 p-5">
        {children}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-xs" style={{ color: "#898781" }}>
        <span>Source: {source}</span>
        {updated && <span>Updated: {updated}</span>}
      </div>
    </section>
  );
}
