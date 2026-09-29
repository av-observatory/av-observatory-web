type SectionIconName = "policy" | "safety" | "operations";

export function SectionIcon({ name, className = "w-5 h-5" }: { name: SectionIconName; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "policy") {
    return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common}>
      <path d="M6 3.75h9.25L18 6.5v13.75H6z" />
      <path d="M15.25 3.75V6.5H18" />
      <path d="M8.75 10h6.5M8.75 13.25h6.5M8.75 16.5h4.25" />
    </svg>;
  }

  if (name === "safety") {
    return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common}>
      <path d="M12 3.25 19 6v5.25c0 4.35-2.85 7.75-7 9.5-4.15-1.75-7-5.15-7-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>;
  }

  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common}>
    <path d="M5 15.5h14l-1.6-5.25a2.5 2.5 0 0 0-2.4-1.78H9a2.5 2.5 0 0 0-2.4 1.78z" />
    <path d="M7.25 15.5v2.25M16.75 15.5v2.25M8.5 12.25h7" />
    <circle cx="8.25" cy="15.5" r=".85" />
    <circle cx="15.75" cy="15.5" r=".85" />
  </svg>;
}
