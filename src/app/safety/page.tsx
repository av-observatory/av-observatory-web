import { promises as fs } from "fs";
import path from "path";
import { SgoMonthlyDataset, WaymoS2StateSummary, ReconciliationCheck, WaymoCaExposureRate } from "@/lib/safety";
import { ChartCard } from "@/components/ChartCard";
import { StatTile } from "@/components/StatTile";
import { SafetyExplorer } from "@/components/SafetyExplorer";
import { UsStateMap } from "@/components/UsStateMap";
import { TopEntitiesChart, WaymoStateMilesChart, CountyMilesTable, WaymoCaExposureChart } from "@/components/SafetyCharts";

async function loadJson<T>(filename: string): Promise<T> {
  const file = path.join(process.cwd(), "public", "data", filename);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

export default async function SafetyPage() {
  const sgo = await loadJson<SgoMonthlyDataset>("sgo_incidents_monthly.json");
  const waymoS2 = await loadJson<WaymoS2StateSummary>("waymo_s2_state_summary.json");
  const reconciliation = await loadJson<ReconciliationCheck>("cpuc_vs_waymo_s2_ca_miles.json");
  const exposureRate = await loadJson<WaymoCaExposureRate>("waymo_ca_exposure_rate.json");

  const incidentsByState: Record<string, number> = {};
  for (const r of sgo.monthly_by_state) incidentsByState[r.state] = (incidentsByState[r.state] ?? 0) + r.incident_count;

  return (
    <div className="max-w-6xl px-8 py-8">
      <p className="eyebrow mb-3">United States · Safety</p>
      <h1 className="text-4xl font-semibold tracking-tight max-w-3xl">A national view of autonomous-vehicle safety reporting</h1>
      <p className="mt-4 text-lg text-neutral-600 max-w-3xl leading-relaxed">
        Federal incident reporting provides one of the few common datasets that spans AV developers and states.
        The Observatory uses it as a national backbone, then adds exposure and state-level detail where comparable data exist.
      </p>

      <div className="mt-8 grid sm:grid-cols-3 gap-4">
        <StatTile label="Incident reports" value={sgo.row_count.toLocaleString()} caption="NHTSA SGO records in the Observatory" />
        <StatTile label="States represented" value={sgo.states_represented.length.toString()} caption="States appearing in reported incidents" />
        <StatTile label="Reporting entities" value={sgo.entities_represented.length.toString()} caption="ADS reporting entities represented" />
      </div>

      <section className="mt-12">
        <div className="eyebrow">Explore</div>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">Incident reporting over time</h2>
        <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
          Switch between the national series, individual states, and reporting entities. Counts are reports filed, not exposure-normalized crash rates.
        </p>
        <div className="viz-card p-5 mt-5"><SafetyExplorer data={sgo} /></div>
      </section>

      <section className="mt-12 grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3">
          <ChartCard title="Where incidents are reported" subtitle="Cumulative NHTSA SGO incident-report counts by state. Darker shading means more reports, not necessarily greater risk." source="NHTSA Standing General Order 2021-01">
            <UsStateMap valueByAbbrev={incidentsByState} />
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard title="Reporting entities" subtitle="All-time report count by entity. Exposure differs substantially across operators." source="NHTSA Standing General Order 2021-01">
            <TopEntitiesChart data={sgo} />
          </ChartCard>
        </div>
      </section>

      <section className="mt-4">
        <div className="eyebrow">Exposure-normalized case study</div>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">When numerator and denominator match</h2>
        <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
          National incident counts become much more interpretable when matched to comparable mileage. Public exposure data are still uneven,
          so the Observatory presents normalized rates only where operator, geography, and period can be aligned.
        </p>
        <div className="grid lg:grid-cols-2 gap-5 mt-5">
          <ChartCard title="Waymo California incidents per million miles" subtitle="Waymo SGO incidents divided by Waymo CPUC-reported California VMT by month." source="NHTSA Standing General Order + CPUC AV Program">
            <WaymoCaExposureChart data={exposureRate} />
          </ChartCard>
          <ChartCard title="Waymo reported operational miles by state" subtitle={"Operator-published mileage across states in the latest ingested benchmark vintage (" + waymoS2.vintage_end + ")."} source="Waymo self-published safety benchmark data">
            <WaymoStateMilesChart data={waymoS2} />
          </ChartCard>
        </div>
        <p className="text-sm text-neutral-500 -mt-6 mb-12">{exposureRate.methodology_note}</p>
      </section>

      <section className="mt-8 grid lg:grid-cols-2 gap-5">
        <div className="viz-card p-5">
          <div className="eyebrow">Geographic detail</div>
          <h2 className="text-xl font-semibold mt-1">Top counties by Waymo reported miles</h2>
          <p className="text-sm text-neutral-600 mt-2 mb-4">County rollup of published S2-cell mileage.</p>
          <CountyMilesTable data={waymoS2} />
        </div>
        <div className="viz-card p-5">
          <div className="eyebrow">Method check</div>
          <h2 className="text-xl font-semibold mt-1">{reconciliation.title}</h2>
          <p className="text-sm text-neutral-600 mt-2">{reconciliation.purpose}</p>
          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            <div className="border border-neutral-200 rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">CPUC · Waymo CA</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{Math.round(reconciliation.cpuc_side.total_vmt).toLocaleString()} mi</div>
            </div>
            <div className="border border-neutral-200 rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Waymo S2 · CA</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{Math.round(reconciliation.waymo_s2_side.total_miles).toLocaleString()} mi</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-neutral-500 space-y-1">{reconciliation.caveats.map((c,i)=><p key={i}>• {c}</p>)}</div>
        </div>
      </section>
    </div>
  );
}
