import Link from "next/link";

export function PolicyNav({ active }: { active: "federal" | "states" | "cities" }) {
  const tabs = [{ id: "federal", href: "/", label: "Federal" }, { id: "states", href: "/policy/states", label: "States" }, { id: "cities", href: "/policy/cities", label: "Cities" }];
  return <nav aria-label="Policy levels" className="flex gap-2 mt-6 mb-7 border-b border-neutral-200">
    {tabs.map(tab => <Link key={tab.id} href={tab.href} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${active === tab.id ? "border-[#184f95] text-[#0b1d33]" : "border-transparent text-neutral-500 hover:text-[#0b1d33]"}`}>{tab.label}</Link>)}
  </nav>;
}
