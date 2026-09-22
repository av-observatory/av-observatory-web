"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "U.S. Overview" },
  { href: "/deployment", label: "Deployment" },
  { href: "/safety", label: "Safety" },
  { href: "/activity", label: "Activity Data" },
  { href: "/downloads", label: "Downloads" },
  { href: "/about", label: "About" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 bg-[#0b1d33] text-white flex flex-col">
      <div className="px-5 pt-7 pb-5">
        <Link href="/" className="text-[15px] font-semibold tracking-tight flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#3987e5]" />
          AV Observatory
        </Link>
      </div>
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative block rounded-md px-3 py-2 text-[13.5px] transition-colors"
              style={{
                color: active ? "#ffffff" : "rgba(255,255,255,0.62)",
                background: active ? "rgba(57,135,229,0.16)" : "transparent",
                fontWeight: active ? 600 : 400,
              }}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[#3987e5]" />
              )}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-5 text-xs text-white/45 border-t border-white/10 leading-relaxed">
        Independent national evidence on autonomous vehicles and their impacts.
      </div>
    </aside>
  );
}
