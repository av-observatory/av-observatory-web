import Link from "next/link";
export function PolicyNav({ active }: { active: "federal" | "states" | "cities" }) {
  const tabs = [{ id: "federal", href: "/policy/federal", label: "Federal Rules" }, { id: "states", href: "/policy/states", label: "State Regulations" }, { id: "cities", href: "/policy/cities", label: "Cities" }];
  return <nav aria-label="Policy levels" className="flex gap-2 mt-6 mb-7 border-b border-neutral-200">{tabs.map(t => <Link key={t.id} href={t.href} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${active === t.id ? "border-[#184f95] text-[#0b1d33]" : "border-transparent text-neutral-500 hover:text-[#0b1d33]"}`}>{t.label}</Link>)}</nav>;
}
