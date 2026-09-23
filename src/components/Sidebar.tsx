"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  { title: "Policy Trackers", items: [
    ["/policy/federal", "Federal Regs and Rules"],
    ["/policy/federal-legislation", "Federal Legislation"],
    ["/policy/states", "State Regulations"],
    ["/policy/state-legislation", "State Legislation"],
    ["/policy/cities", "City Policy"],
  ] },
  { title: "Reporting", items: [["/safety", "National Crash Data"], ["/activity", "CA Trip Data"], ["/complaints", "Citizen Complaints"]] },
  { title: "Operations", items: [["/manufacturers", "Manufacturers Tracker"], ["/waymo-activity", "Waymo Activity"]] },
  { title: "Explore", items: [["/downloads", "Downloads"], ["/about", "About"]] },
] as const;

export function Sidebar() {
  const path = usePathname();
  return <aside className="w-60 shrink-0 bg-[#0b1d33] text-white flex flex-col min-h-screen">
    <Link href="/" className="px-5 pt-7 pb-6 text-[15px] font-semibold tracking-tight flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#6fbbe9]" />AV Observatory</Link>
    <nav className="flex-1 px-3 pb-5 space-y-5" aria-label="Main navigation">
      <Link href="/" className={`block rounded-md px-3 py-2 text-sm ${path === "/" ? "bg-white/15 text-white font-semibold" : "text-white/70 hover:text-white hover:bg-white/10"}`}>Overview</Link>
      {GROUPS.map(group => <section key={group.title}><h2 className="px-3 mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#8bb1d5]">{group.title}</h2><div className="space-y-0.5">{group.items.map(([href,label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className={`block rounded-md px-3 py-2 text-[13px] leading-snug transition-colors ${path === href ? "bg-[#3987e5]/25 text-white font-semibold border-l-[3px] border-[#6fbbe9]" : "text-white/70 hover:text-white hover:bg-white/10"}`}>{label}</Link>)}</div></section>)}
    </nav>
    <div className="px-5 py-5 text-xs text-white/50 border-t border-white/10 leading-relaxed">Independent evidence on autonomous vehicles in the United States.</div>
  </aside>;
}
