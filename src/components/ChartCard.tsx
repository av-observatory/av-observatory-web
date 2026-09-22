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
    <section className="mb-5">
      <h2 className="text-[17px] font-semibold tracking-tight" style={{ color: "#0b0b0b" }}>{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs" style={{ color: "#52514e" }}>{subtitle}</p>}
      <div className="viz-card mt-2 p-4">
        {children}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs" style={{ color: "#898781" }}>
        <span>Source: {source}</span>
        {updated && <span>Updated: {updated}</span>}
      </div>
    </section>
  );
}
