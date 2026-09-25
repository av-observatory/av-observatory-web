import sfRaw from "../../../public/data/av_311_complaints.json";
import activityRaw from "../../../public/data/cpuc_activity_monthly.json";

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
const activity = activityRaw as { data:Array<{
  operator_tcpid:string;
  program:string;
  calendar_year:number;
  calendar_month:number;
  total_trips:number|null;
  total_vmt_all_periods:number|null;
}> };

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

const waymoMonthly = activity.data
  .filter(r=>r.operator_tcpid==="PSG0038152"&&r.program==="driverless"&&r.total_trips!==null&&r.total_vmt_all_periods!==null)
  .sort((a,b)=>a.calendar_year-b.calendar_year||a.calendar_month-b.calendar_month);

function monthIndex(y:number,m:number){return y*12+(m-1);}
function monthLabelShort(y:number,m:number){return new Date(Date.UTC(y,m-1,1)).toLocaleDateString("en-US",{month:"short",year:"2-digit",timeZone:"UTC"});}

function monthlyContext(event:EventDef){
  const d=new Date(event.date+"T00:00:00Z");
  const ey=d.getUTCFullYear(), em=d.getUTCMonth()+1, ei=monthIndex(ey,em);
  const rows=waymoMonthly
    .filter(r=>Math.abs(monthIndex(r.calendar_year,r.calendar_month)-ei)<=3)
    .map(r=>({
      ...r,
      label:monthLabelShort(r.calendar_year,r.calendar_month),
      isEventMonth:r.calendar_year===ey&&r.calendar_month===em,
    }));
  const eventRow=rows.find(r=>r.isEventMonth)??null;
  const prior=eventRow ? waymoMonthly.find(r=>monthIndex(r.calendar_year,r.calendar_month)===ei-1)??null : null;
  return {rows,eventRow,prior};
}

function fmtCompact(n:number){return Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(n);}

function MonthlyBars({event}:{event:EventDef}){
  const {rows,eventRow,prior}=monthlyContext(event);
  if(rows.length===0 || !eventRow){
    const latest=waymoMonthly.at(-1);
    return <div className="mt-5 rounded-lg border border-[#dbe4ed] bg-[#fafbfc] p-4">
      <h3 className="font-semibold">Monthly Trips and VMT</h3>
      <p className="text-sm text-neutral-600 mt-1">
        CPUC monthly Waymo driverless deployment data do not yet cover {fmtDate(event.date)}. The latest month currently available is {latest?monthLabelShort(latest.calendar_year,latest.calendar_month):"not available"}.
      </p>
    </div>;
  }
  const maxTrips=Math.max(...rows.map(r=>Number(r.total_trips||0)),1);
  const maxVmt=Math.max(...rows.map(r=>Number(r.total_vmt_all_periods||0)),1);
  const tripChange=prior&&prior.total_trips?((Number(eventRow.total_trips)-Number(prior.total_trips))/Number(prior.total_trips))*100:null;
  const vmtChange=prior&&prior.total_vmt_all_periods?((Number(eventRow.total_vmt_all_periods)-Number(prior.total_vmt_all_periods))/Number(prior.total_vmt_all_periods))*100:null;
  return <div className="mt-5 rounded-lg border border-[#dbe4ed] p-4">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 className="font-semibold">Monthly Trips and VMT</h3>
        <p className="text-sm text-neutral-600 mt-1">California-wide Waymo driverless deployment activity reported to CPUC. Event month highlighted.</p>
      </div>
      <div className="text-xs text-neutral-500">Monthly data cannot isolate the event&apos;s causal effect.</div>
    </div>
    <div className="grid lg:grid-cols-2 gap-5 mt-4">
      <div>
        <div className="text-sm font-medium mb-2">Passenger trips</div>
        <div className="flex h-36 items-end gap-2 border-b border-[#d9e2ec]">
          {rows.map(r=><div key={r.label} className="flex-1 flex flex-col justify-end h-full">
            <div className={`w-full rounded-t-sm ${r.isEventMonth?"bg-[#d8643f]":"bg-[#6d9fd1]"}`} style={{height:`${Math.max(3,Number(r.total_trips||0)/maxTrips*100)}%`}} title={`${r.label}: ${Number(r.total_trips||0).toLocaleString()} trips`}/>
          </div>)}
        </div>
        <div className="flex gap-2 mt-1">{rows.map(r=><div key={r.label} className={`flex-1 text-center text-[10px] ${r.isEventMonth?"font-semibold text-[#a34d32]":"text-neutral-500"}`}>{r.label}</div>)}</div>
      </div>
      <div>
        <div className="text-sm font-medium mb-2">Vehicle miles traveled</div>
        <div className="flex h-36 items-end gap-2 border-b border-[#d9e2ec]">
          {rows.map(r=><div key={r.label} className="flex-1 flex flex-col justify-end h-full">
            <div className={`w-full rounded-t-sm ${r.isEventMonth?"bg-[#d8643f]":"bg-[#79a98c]"}`} style={{height:`${Math.max(3,Number(r.total_vmt_all_periods||0)/maxVmt*100)}%`}} title={`${r.label}: ${Number(r.total_vmt_all_periods||0).toLocaleString()} miles`}/>
          </div>)}
        </div>
        <div className="flex gap-2 mt-1">{rows.map(r=><div key={r.label} className={`flex-1 text-center text-[10px] ${r.isEventMonth?"font-semibold text-[#a34d32]":"text-neutral-500"}`}>{r.label}</div>)}</div>
      </div>
    </div>
    <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
      <div className="rounded-md bg-[#f7f9fb] p-3"><strong>{fmtCompact(Number(eventRow.total_trips||0))}</strong> trips in the event month{tripChange!==null?<> · <span className={tripChange>=0?"text-[#236b4b]":"text-[#a34d32]"}>{tripChange>=0?"+":""}{tripChange.toFixed(1)}%</span> vs prior month</>:null}</div>
      <div className="rounded-md bg-[#f7f9fb] p-3"><strong>{fmtCompact(Number(eventRow.total_vmt_all_periods||0))}</strong> VMT in the event month{vmtChange!==null?<> · <span className={vmtChange>=0?"text-[#236b4b]":"text-[#a34d32]"}>{vmtChange>=0?"+":""}{vmtChange.toFixed(1)}%</span> vs prior month</>:null}</div>
    </div>
  </div>;
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
    <MonthlyBars event={event}/>

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
        SF311 requests are public reports, not verified incidents, and the dataset does not identify the AV operator. A spike can indicate increased public reporting during a disruption, but it cannot by itself establish the cause, operator, severity, or prevalence of the underlying behavior. Monthly CPUC trip and VMT totals are California-wide and much coarser than the event window, so they provide operational context rather than a causal estimate of an event&apos;s impact. Conversely, the absence of a spike does not mean an event had no operational impact.
      </p>
      <a href={sf.source_url} className="inline-block mt-3 text-sm text-[#184f95] underline">Official SF311 dataset ↗</a>
    </section>
  </main>;
}
