import Link from "next/link";
import policy from "../../public/data/policy_tracker.json";
import bills from "../../public/data/legislation_tracker.json";
import investigations from "../../public/data/nhtsa_investigations.json";
import { SectionIcon } from "@/components/SectionIcon";

const stateActions = policy.states.filter(s => s.enacted_legislation || s.executive_order_history).length;
const activeInvestigations = investigations.investigations.filter(x => x.status === "Open").length;
const sections = [
  {
    id: "01",
    title: "Policy Trackers",
    icon: "policy" as const,
    accent: "#6ea6e2",
    tint: "#eef6fd",
    lead: "Rules, legislation, and state policy shaping autonomous-vehicle deployment.",
    links: [
      ["Federal Regs and Rules", "/policy/federal"],
      ["Federal Legislation", "/policy/federal-legislation"],
      ["State Regulations", "/policy/states"],
      ["State Legislation", "/policy/state-legislation"],
    ],
  },
  {
    id: "02",
    title: "Safety Reporting",
    icon: "safety" as const,
    accent: "#e0a55b",
    tint: "#fff7eb",
    lead: "Crash reports, federal investigations, and resident-reported issues.",
    links: [
      ["National Crash Data", "/safety"],
      ["NHTSA Investigations", "/investigations"],
      ["Resident Complaints", "/complaints"],
    ],
  },
  {
    id: "03",
    title: "Operations",
    icon: "operations" as const,
    accent: "#70b6aa",
    tint: "#edf8f6",
    lead: "Trip activity and operational mileage from public reporting systems.",
    links: [
      ["CA Trip Data", "/activity"],
      ["Waymo Activity", "/waymo-activity"],
    ],
  },
] as const;

function NetworkGraphic() { return <svg viewBox="0 0 600 480" className="w-full h-full" aria-hidden="true"><defs><linearGradient id="mesh" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#2975ba" /><stop offset="1" stopColor="#74bad0" /></linearGradient></defs><path d="M0 375Q112 288 221 312T445 201T660 95M-70 168Q51 189 151 109T340 143T620 10M-30 440Q70 332 167 394T381 293T620 261" fill="none" stroke="#91b9d7" strokeWidth="1.5" opacity=".28"/><path d="M74 -20Q144 81 136 178T255 338T345 520M357 -20Q300 140 377 220T518 520M542 -20Q442 112 491 215T640 440" fill="none" stroke="#91b9d7" strokeWidth="1.5" opacity=".24"/>{[[136,178],[221,312],[377,220],[445,201],[491,215],[167,394],[345,338],[151,109]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="16" fill="#6ab6da" opacity=".12"/><circle cx={x} cy={y} r="5" fill="url(#mesh)"/></g>)}<path d="M136 178L221 312L345 338L377 220L445 201L491 215M151 109L136 178L377 220" fill="none" stroke="url(#mesh)" strokeWidth="2" opacity=".7"/></svg>; }

export default function HomePage() {
  return <main className="bg-[#f7f9fb] min-h-screen">
    <section className="relative overflow-hidden bg-[#0b1d33] text-white min-h-[420px] flex items-center"><div className="absolute inset-y-0 right-0 w-[58%] opacity-75 hidden md:block"><NetworkGraphic /></div><div className="relative max-w-6xl px-8 py-16 w-full"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#89bfec]">A Public Evidence Platform</p><h1 className="mt-5 text-5xl sm:text-6xl font-semibold tracking-tight max-w-3xl leading-[1.08]">The <span className="text-[#9bd5e4]">Autonomous</span><br/><span className="text-[#9bd5e4]">Vehicle</span> Observatory.</h1><p className="mt-6 text-lg text-slate-200 max-w-xl leading-relaxed">Follow the policies, the companies, and the evidence behind the deployment of autonomous vehicles in the United States.</p><div className="flex flex-wrap gap-3 mt-8"><Link href="/policy/states" className="rounded bg-[#83c6e3] text-[#082039] px-5 py-3 text-sm font-bold hover:bg-white">Explore Policy Map →</Link><Link href="/safety" className="rounded border border-white/40 px-5 py-3 text-sm font-semibold hover:bg-white/10">AV Crashes →</Link><a href="#explore" className="rounded border border-white/40 px-5 py-3 text-sm font-semibold hover:bg-white/10">Explore Data ↓</a></div></div></section>
    <div className="max-w-6xl px-8 mx-auto -mt-8 relative"><div className="bg-white shadow-sm border border-[#dce5ec] rounded-xl grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#dce5ec] overflow-hidden">{[[stateActions,"States + D.C. With AVs Authorized","/policy/states"],[policy.federal.length,"Federal FMVSS Records and Milestones","/policy/federal"],[activeInvestigations,"Active NHTSA Investigations","/investigations"]].map(([number,label,href])=><Link key={String(label)} href={String(href)} className="p-5 hover:bg-[#f5f9fc]"><span className="block text-3xl font-semibold text-[#123b69]">{number}</span><span className="block text-sm text-neutral-600 mt-1">{label}</span></Link>)}</div></div>
    <section className="max-w-6xl px-8 mx-auto pt-2 pb-5">
      <div className="rounded-xl bg-[#0b1d33] text-white p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#8fc2e8]">AV Observatory Brief</p>
          <h2 className="text-2xl font-semibold mt-2">Get the Observatory in your inbox.</h2>
          <p className="text-sm text-slate-300 mt-2 max-w-2xl">A concise digest of important policy changes, safety evidence, operating data, and new Observatory releases.</p>
        </div>
        <a href="https://avobservatory.substack.com/" target="_blank" rel="noreferrer" className="shrink-0 rounded-md bg-[#83c6e3] text-[#082039] px-5 py-3 text-sm font-bold hover:bg-white">Join the newsletter →</a>
      </div>
    </section>

    <section id="explore" className="max-w-6xl px-8 mx-auto pt-4 pb-9 scroll-mt-6">
      <div className="mb-5"><p className="eyebrow">Explore the Observatory</p><h2 className="text-3xl font-semibold text-[#0b1d33] mt-2">Explore the Observatory</h2></div>
      <div className="grid lg:grid-cols-3 gap-4 items-stretch">{sections.map(section=><article key={section.id} className="viz-card overflow-hidden flex flex-col">
        <div className="p-5 flex-1" style={{background:section.tint}}>
          <div className="flex items-start justify-between gap-4">
            <div className="w-11 h-11 rounded-lg flex items-center justify-center text-[#0b1d33]" style={{backgroundColor:section.accent}}>
              <SectionIcon name={section.icon} className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-[#55728d]">{section.id}</span>
          </div>
          <h3 className="text-xl font-semibold text-[#0b1d33] mt-4">{section.title}</h3>
          <p className="text-sm text-neutral-600 mt-2 leading-relaxed">{section.lead}</p>
        </div>
        <div className="bg-white border-t border-neutral-200 divide-y divide-neutral-100">
          {section.links.map(([label,href])=><Link key={href} href={href} className="flex items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-[#184f95] hover:bg-[#f5f9fc]"><span>{label}</span><span aria-hidden="true">→</span></Link>)}
        </div>
      </article>)}</div>
      <div className="mt-6 text-sm text-neutral-600">Current bills indexed: {bills.federal.length} federal and {bills.state_bills.length} state records · Reviewed {policy.as_of}. <Link href="/downloads" className="text-[#184f95] underline">Download data →</Link></div>
    </section>


  </main>;
}
