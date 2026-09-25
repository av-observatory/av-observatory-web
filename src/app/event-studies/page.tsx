import sfRaw from "../../../public/data/av_311_complaints.json";

type Complaint = {
  id:string;
  requested_date:string;
  type:string;
  status:string;
  source_url:string;
};

type EventDef = {
  slug:string;
  title:string;
  date:string;
  kicker:string;
  description:string;
  context:string;
};

const sf = sfRaw as { records:Complaint[]; source_url:string; source_data_as_of:string; limitations:string };

const EVENTS:EventDef[] = [
  {
    slug:"pge-outage",
    title:"December 2025 PG&E Outage",
    date:"2025-12-20",
    kicker:"Infrastructure disruption",
    description:"A widespread San Francisco power outage disabled traffic signals across the city and disrupted roadway operations.",
    context:"This view asks whether AV-related 311 reporting changed during and immediately after the outage."
  },
  {
    slug:"july-4",
    title:"July 4, 2026",
    date:"2026-07-04",
    kicker:"Major-event disruption",
    description:"Heavy event traffic, road closures, pedestrians, and stalled vehicles created severe congestion around the Presidio and northern waterfront.",
    context:"This view tests whether the highly visible disruption produced a corresponding change in SF311 AV complaints."
  }
];

function dayKey(d:Date){return d.toISOString().slice(0,10);}
function addDays(date:string,n:number){const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return dayKey(d);}
function fmtDate(date:string){return new Date(date+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});}

const dailyCounts = sf.records.reduce((m:Record<string,number>,r)=>{
  m[r.requested_date]=(m[r.requested_date]??0)+1;
  return m;
},{});

function eventStats(event:EventDef){
  const baselineDays=Array.from({length:28},(_,i)=>addDays(event.date,-28+i));
  const baselineTotal=baselineDays.reduce((sum,d)=>sum+(dailyCounts[d]??0),0);
  const baselineDaily=baselineTotal/28;
  const eventDays=[0,1,2].map(n=>addDays(event.date,n));
  const threeDay=eventDays.reduce((sum,d)=>sum+(dailyCounts[d]??0),0);
  const expected3=baselineDaily*3;
  const ratio=expected3>0?threeDay/expected3:null;
  const window=Array.from({length:29},(_,i)=>{
    const offset=i-14;
    const date=addDays(event.date,offset);
    return {date,offset,count:dailyCounts[date]??0};
  });
  return {
    baselineDaily,
    eventDay:dailyCounts[event.date]??0,
    threeDay,
    expected3,
    ratio,
    window,
  };
}

function MiniSeries({event}:{event:EventDef}){
  const {window,baselineDaily}=eventStats(event);
  const max=Math.max(1,...window.map(d=>d.count));
  return <div className="mt-5">
    <div className="flex h-44 items-end gap-[3px] border-b border-[#d9e2ec] px-1">
      {window.map(d=>{
        const isEvent=d.offset===0;
        return <div key={d.date} className="group relative flex-1 h-full flex items-end">
          <div
            className={`w-full rounded-t-sm ${isEvent?"bg-[#d8643f]":"bg-[#6d9fd1]"}`}
            style={{height:`${Math.max(2,(d.count/max)*100)}%`}}
            title={`${d.date}: ${d.count} requests`}
          />
        </div>;
      })}
    </div>
    <div className="grid grid-cols-3 text-[11px] text-neutral-500 mt-1">
      <span>{fmtDate(window[0].date)}</span>
      <span className="text-center font-medium text-[#a34d32]">{fmtDate(event.date)}</span>
      <span className="text-right">{fmtDate(window.at(-1)!.date)}</span>
    </div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
      <span><span className="inline-block h-2.5 w-3 bg-[#6d9fd1] mr-1"/>Daily SF311 AV requests</span>
      <span><span className="inline-block h-2.5 w-3 bg-[#d8643f] mr-1"/>Event date</span>
      <span>28-day pre-event baseline: {baselineDaily.toFixed(1)} requests/day</span>
    </div>
  </div>;
}

function EventStudy({event}:{event:EventDef}){
  const s=eventStats(event);
  const pct=s.ratio===null?null:(s.ratio-1)*100;
  const signal=s.ratio===null?"—":s.ratio>=1.5?"substantially above":s.ratio<=0.67?"substantially below":"close to";
  return <article id={event.slug} className="viz-card p-5 scroll-mt-6">
    <p className="eyebrow">{event.kicker}</p>
    <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
      <div>
        <h2 className="text-2xl font-semibold">{event.title}</h2>
        <p className="text-sm text-neutral-600 mt-2 max-w-3xl">{event.description} {event.context}</p>
      </div>
      <div className="rounded-md bg-[#eef4fb] px-3 py-2 text-sm font-medium text-[#184f95]">{fmtDate(event.date)}</div>
    </div>

    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
      <div className="rounded-lg border border-[#dbe4ed] p-3"><div className="text-xs text-neutral-500">Event-day requests</div><div className="text-2xl font-semibold mt-1 tabular-nums">{s.eventDay}</div></div>
      <div className="rounded-lg border border-[#dbe4ed] p-3"><div className="text-xs text-neutral-500">3-day event window</div><div className="text-2xl font-semibold mt-1 tabular-nums">{s.threeDay}</div></div>
      <div className="rounded-lg border border-[#dbe4ed] p-3"><div className="text-xs text-neutral-500">Expected from baseline</div><div className="text-2xl font-semibold mt-1 tabular-nums">{s.expected3.toFixed(1)}</div></div>
      <div className="rounded-lg border border-[#dbe4ed] p-3"><div className="text-xs text-neutral-500">Observed / expected</div><div className="text-2xl font-semibold mt-1 tabular-nums">{s.ratio?.toFixed(2)??"—"}×</div></div>
    </div>

    <MiniSeries event={event}/>

    <div className="mt-5 rounded-lg bg-[#f7f9fb] p-4 text-sm leading-relaxed text-neutral-700">
      In the three days beginning {fmtDate(event.date)}, SF311 recorded <strong>{s.threeDay} AV requests</strong>, compared with <strong>{s.expected3.toFixed(1)}</strong> expected from the preceding 28-day daily average. That is {signal} baseline{pct!==null?<> ({pct>=0?"+":""}{pct.toFixed(0)}%)</>:null}. This is a descriptive event comparison, not a causal estimate.
    </div>
  </article>;
}

export default function EventStudiesPage(){
  return <main className="max-w-6xl px-5 sm:px-8 py-8">
    <p className="eyebrow">Analysis / Natural Experiments</p>
    <h1 className="text-4xl font-semibold text-[#0b1d33] mt-2">Event Studies</h1>
    <p className="text-base leading-relaxed text-neutral-600 mt-3 max-w-4xl">
      How does AV-related public reporting change when the operating environment changes suddenly? These studies use the Observatory&apos;s existing datasets to compare short event windows with the immediately preceding baseline.
    </p>

    <div className="grid sm:grid-cols-2 gap-3 mt-6">
      {EVENTS.map(e=><a key={e.slug} href={`#${e.slug}`} className="viz-card p-4 block hover:border-[#2c76bf]">
        <p className="text-xs uppercase tracking-wide text-neutral-500">{e.kicker}</p>
        <strong className="block text-lg mt-1">{e.title}</strong>
        <span className="text-sm text-[#184f95] underline">View study →</span>
      </a>)}
    </div>

    <div className="grid gap-5 mt-7">
      {EVENTS.map(e=><EventStudy key={e.slug} event={e}/>)}
    </div>

    <section className="viz-card p-5 mt-6">
      <h2 className="text-xl font-semibold">How to read these studies</h2>
      <p className="text-sm leading-relaxed text-neutral-600 mt-2 max-w-4xl">
        The benchmark is the mean number of SF311 Autonomous Vehicle Complaint requests per day during the 28 days immediately before each event. The event window is the event date plus the following two calendar days. The observed/expected ratio compares those three observed days with three days at the pre-event daily rate.
      </p>
      <p className="text-sm leading-relaxed text-neutral-600 mt-2 max-w-4xl">
        SF311 requests are public reports, not verified incidents, and the dataset does not identify the AV operator. A spike can indicate increased public reporting during a disruption, but it cannot by itself establish the cause, operator, severity, or prevalence of the underlying behavior. Conversely, the absence of a spike does not mean an event had no operational impact.
      </p>
      <a href={sf.source_url} className="inline-block mt-3 text-sm text-[#184f95] underline">Official SF311 dataset ↗</a>
    </section>
  </main>;
}
