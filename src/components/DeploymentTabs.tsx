import Link from "next/link";

export function DeploymentTabs({ active }: { active: "overview" | "waymo" }) {
  const base = "inline-flex items-center rounded-md px-3 py-2 text-sm font-medium border";
  const on = " bg-[#0b1d33] text-white border-[#0b1d33]";
  const off = " bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400";
  return (
    <nav className="mt-5 flex flex-wrap gap-2" aria-label="Deployment views">
      <Link href="/deployment/" className={base + (active === "overview" ? on : off)}>
        Deployment overview
      </Link>
      <Link href="/deployment/waymo/" className={base + (active === "waymo" ? on : off)}>
        Waymo deployment
      </Link>
    </nav>
  );
}
