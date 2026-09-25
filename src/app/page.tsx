import Link from "next/link";
import policy from "../../public/data/policy_tracker.json";
import operations from "../../public/data/operational_domains.json";
import bills from "../../public/data/legislation_tracker.json";

const stateActions = policy.states.filter(s => s.enacted_legislation || s.executive_order_history).length;
const operators = new Set(operations.locations.filter(x => x.evidence_status === "current" && ["testing","deployment"].includes(x.activity_type ?? x.phase) && !/planned|permit|authorized/i.test(x.status)).map(x => x.company)).size;
const chapters = [
  { id: "01", title: "Policy Trackers", lead: "What governments require—and what lawmakers are proposing.", href: "/policy/federal", accent: "#6ea6e2", links: [["Federal Regs and Rules", "/policy/federal"], ["Federal Legislation", "/policy/federal-legislation"], ["State Policies", "/policy/states"]] },
  { id: "02", title: "National Crash Data", lead: "Explore reported AV crashes by company, location, and severity.", href: "/safety", accent: "#e0a55b", links: [["Explore NHTSA SGO reports", "/safety"]] },
  { id: "03", title: "CA Trip Data", lead: "See CPUC trips, mileage, and utilization across California.", href: "/activity", accent: "#70b6aa", links: [["Explore California data", "/activity"]] },
  { id: "04", title: "Manufacturers Tracker", lead: "Compare operators, partnerships, and documented locations.", href: "/manufacturers", accent: "#bd9ae4", links: [["Explore manufacturers", "/manufacturers"], ["Waymo S2 activity", "/waymo-activity"]] },
] as const;

const caseStudies = [
  {
    eyebrow:"Infrastructure disruption",
    title:"December 2025 PG&E Outage",
    lead:"A one-day event study combining SF311 AV complaints, operational disruption reporting, traffic conditions, and monthly Waymo activity.",
    href:"/event-studies#pge-outage",
    status:"Live"
  },
  {
    eyebrow:"Major-event disruption",
    title:"July 4, 2026",
    lead:"An evening-focused study of AV complaints, localized congestion, stranded vehicles, and operating conditions around the Presidio and northern waterfront.",
    href:"/event-studies#july-4",
    status:"Live"
  },
  {
    eyebrow:"Matched case-crossover",
    title:"AV Complaints × Congestion",
    lead:"A spatial-temporal study matching each SF AV complaint to nearby road conditions and comparable control periods at the same place and time.",
    href:"",
    status:"In development"
  }
] as const;

function NetworkGraphic() { return <svg viewBox="0 0 600 480" className="w-full h-full" aria-hidden="true"><defs><linearGradient id="mesh" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#2975ba" /><stop offset="1" stopColor="#74bad0" /></linearGradient></defs><path d="M0 375Q112 288 221 312T445 201T660 95M-70 168Q51 189 151 109T340 143T620 10M-30 440Q70 332 167 394T381 293T620 261" fill="none" stroke="#91b9d7" strokeWidth="1.5" opacity=".28"/><path d="M74 -20Q144 81 136 178T255 338T345 520M357 -20Q300 140 377 220T518 520M542 -20Q442 112 491 215T640 440" fill="none" stroke="#91b9d7" strokeWidth="1.5" opacity=".24"/>{[[136,178],[221,312],[377,220],[445,201],[491,215],[167,394],[345,338],[151,109]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="16" fill="#6ab6da" opacity=".12"/><circle cx={x} cy={y} r="5" fill="url(#mesh)"/></g>)}<path d="M136 178L221 312L345 338L377 220L445 201L491 215M151 109L136 178L377 220" fill="none" stroke="url(#mesh)" strokeWidth="2" opacity=".7"/></svg>; }

export default function HomePage() {
  return <main className="bg-[#f7f9fb] min-h-screen">
    <section className="relative overflow-hidden bg-[#0b1d33] text-white min-h-[420px] flex items-center"><div className="absolute inset-y-0 right-0 w-[58%] opacity-75 hidden md:block"><NetworkGraphic /></div><div className="relative max-w-6xl px-8 py-16 w-full"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#89bfec]">A Public Evidence Platform</p><h1 className="mt-5 text-5xl sm:text-6xl font-semibold tracking-tight max-w-3xl leading-[1.08]">The <span className="text-[#9bd5e4]">Autonomous</span><br/><span className="text-[#9bd5e4]">Vehicle</span> Observatory.</h1><p className="mt-6 text-lg text-slate-200 max-w-xl leading-relaxed">Follow the policies, the companies, and the evidence behind autonomous vehicles in the United States.</p><div className="flex flex-wrap gap-3 mt-8"><Link href="/policy/states" className="rounded bg-[#83c6e3] text-[#082039] px-5 py-3 text-sm font-bold hover:bg-white">Explore Policy Map →</Link><Link href="/manufacturers" className="rounded border border-white/40 px-5 py-3 text-sm font-semibold hover:bg-white/10">Explore Manufacturers →</Link><a href="#explore" className="rounded border border-white/40 px-5 py-3 text-sm font-semibold hover:bg-white/10">More ↓</a></div></div></section>
    <div className="max-w-6xl px-8 mx-auto -mt-8 relative"><div className="bg-white shadow-sm border border-[#dce5ec] rounded-xl grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#dce5ec] overflow-hidden">{[[stateActions,"States + D.C. With Indexed AV Law or Order","/policy/states"],[policy.federal.length,"Federal FMVSS Records and Milestones","/policy/federal"],[operators,"Operators With Documented Activity","/manufacturers"]].map(([number,label,href])=><Link key={String(label)} href={String(href)} className="p-5 hover:bg-[#f5f9fc]"><span className="block text-3xl font-semibold text-[#123b69]">{number}</span><span className="block text-sm text-neutral-600 mt-1">{label}</span></Link>)}</div></div>
    <section id="explore" className="max-w-6xl px-8 mx-auto py-9 scroll-mt-6">
      <div className="mb-5"><p className="eyebrow">Explore the Observatory</p><h2 className="text-3xl font-semibold text-[#0b1d33] mt-2">Start With a Question</h2></div>
      <div className="grid lg:grid-cols-2 gap-3 items-start">{chapters.map(c=><article key={c.id} className="viz-card p-4 border-l-4" style={{borderLeftColor:c.accent}}>
        <div className="flex items-start gap-3"><span className="text-xs font-bold text-[#446a8d] mt-1">{c.id}</span><div className="min-w-0"><Link href={c.href} className="text-xl font-semibold text-[#0b1d33] hover:underline">{c.title} ↗</Link><p className="text-sm text-neutral-600 mt-1 leading-relaxed">{c.lead}</p></div></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-neutral-200 mt-3 pt-2.5 pl-7">{c.links.map(([label,href])=><Link key={href} href={href} className="text-sm font-medium underline text-[#184f95]">{label}</Link>)}</div>
      </article>)}</div>
      <div className="mt-6 text-sm text-neutral-600">Current bills indexed: {bills.federal.length} federal and {bills.state_bills.length} state records · Reviewed {policy.as_of}. <Link href="/downloads" className="text-[#184f95] underline">Download data →</Link></div>
    </section>

    <section className="max-w-6xl px-8 mx-auto pb-12">
      <div className="mb-5">
        <p className="eyebrow">Case Studies</p>
        <h2 className="text-3xl font-semibold text-[#0b1d33] mt-2">AVs Under Stress</h2>
        <p className="text-sm text-neutral-600 mt-2 max-w-2xl">Focused analyses combining public complaints, traffic conditions, operating data, and event-specific evidence.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {caseStudies.map(study=>{
          const body=<>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#527493]">{study.eyebrow}</p>
              <span className={`text-[10px] font-semibold rounded-full px-2 py-1 ${study.status==="Live"?"bg-[#e8f4ed] text-[#236b4b]":"bg-[#f2f4f7] text-neutral-500"}`}>{study.status}</span>
            </div>
            <h3 className="text-xl font-semibold text-[#0b1d33] mt-3">{study.title}</h3>
            <p className="text-sm leading-relaxed text-neutral-600 mt-2">{study.lead}</p>
            {study.status==="Live"&&<span className="inline-block mt-4 text-sm font-medium text-[#184f95] underline">View case study →</span>}
          </>;
          return study.href
            ? <Link key={study.title} href={study.href} className="viz-card p-5 block hover:border-[#7da8cf]">{body}</Link>
            : <article key={study.title} className="viz-card p-5">{body}</article>;
        })}
      </div>
    </section>
  </main>;
}
