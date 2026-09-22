import { promises as fs } from "fs";
import path from "path";
import { SgoMonthlyDataset, WaymoS2StateSummary, ReconciliationCheck, WaymoCaExposureRate } from "@/lib/safety";
import { ChartCard } from "@/components/ChartCard";
import {
  TopEntitiesChart,
  TopStatesChart,
  WaymoStateMilesChart,
  NationalTrendChart,
  CountyMilesTable,
  VehicleClassChart,
  ProgramTypeChart,
  WaymoCaExposureChart,
} from "@/components/SafetyCharts";

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

  return (
    <div className="max-w-4xl px-8 py-8">
      <p className="text-sm uppercase tracking-wide text-neutral-500 mb-3">Safety</p>
      <h1 className="text-3xl font-semibold tracking-tight max-w-2xl">
        National AV Safety Reporting
      </h1>
      <p className="mt-4 text-neutral-600 max-w-2xl">
        Unlike CPUC&apos;s California-only Activity data, incident reporting under
        NHTSA&apos;s Standing General Order covers every ADS operator testing or
        deploying nationwide. {sgo.row_count.toLocaleString()} incident reports
        across {sgo.states_represented.length} states and{" "}
        {sgo.entities_represented.length} reporting entities are represented here.
      </p>

      <div className="mt-12">
        <ChartCard
          title="Incident reports over time"
          subtitle="Monthly count of SGO incident reports filed, all states, all operators."
          source="NHTSA Standing General Order 2021-01"
        >
          <NationalTrendChart data={sgo} />
        </ChartCard>

        <ChartCard
          title="Incident reports by operator"
          subtitle="All-time count of SGO incident reports filed, by reporting entity."
          source="NHTSA Standing General Order 2021-01"
        >
          <TopEntitiesChart data={sgo} />
        </ChartCard>

        <ChartCard
          title="Incident reports by state"
          subtitle="All-time count of SGO incident reports filed, by state."
          source="NHTSA Standing General Order 2021-01"
        >
          <TopStatesChart data={sgo} />
        </ChartCard>

        <ChartCard
          title="Waymo California exposure-normalized incident rate"
          subtitle="SGO incident reports Waymo filed for California, per million miles of Waymo's own CPUC-reported California VMT, by month. Same operator, same state -- a materially better-grounded rate than mixing sources across operators."
          source="NHTSA Standing General Order + CPUC AV Program deployment reports"
        >
          <WaymoCaExposureChart data={exposureRate} />
        </ChartCard>
        <p className="text-sm text-neutral-500 -mt-8 mb-16">
          {exposureRate.methodology_note}
        </p>

        <ChartCard
          title="Incident reports by vehicle class"
          subtitle="Trucking vs. light-duty/passenger, based on the Observatory's own classification of each reporting entity's primary business focus -- not an NHTSA-provided field."
          source="NHTSA Standing General Order 2021-01 (Observatory classification)"
        >
          <VehicleClassChart data={sgo} />
        </ChartCard>

        <ChartCard
          title="Incident reports by program type"
          subtitle="Commercial (has/had paid public service) vs. testing/development-stage, based on the Observatory's own classification -- not an NHTSA-provided field."
          source="NHTSA Standing General Order 2021-01 (Observatory classification)"
        >
          <ProgramTypeChart data={sgo} />
        </ChartCard>

        <ChartCard
          title="Waymo reported operational miles by state"
          subtitle={`Waymo's own published S2-cell safety benchmark, rolled up to state (as of ${waymoS2.vintage_end}).`}
          source="Waymo self-published safety benchmark data"
        >
          <WaymoStateMilesChart data={waymoS2} />
        </ChartCard>

        <p className="text-sm text-neutral-500 -mt-8 mb-16">
          Note: incident report counts reflect reports filed, not verified
          at-fault crashes or a normalized crash rate. A large operator with
          more incident reports is not necessarily less safe than a smaller
          one -- reports scale with exposure (miles/trips), which isn&apos;t yet
          available for most operators. Waymo&apos;s own mileage above lets its
          reports be read against exposure; equivalent normalization for
          other operators is a planned addition.
        </p>

        <section className="mb-16">
          <h2 className="text-xl font-semibold tracking-tight">
            Top counties by Waymo reported miles
          </h2>
          <p className="mt-1 text-neutral-600">
            County-level detail underlying the state chart above, from Waymo&apos;s
            S2-cell benchmark data.
          </p>
          <div className="mt-6 border border-neutral-200 rounded-lg p-4">
            <CountyMilesTable data={waymoS2} />
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            Source: Waymo self-published safety benchmark data
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-xl font-semibold tracking-tight">{reconciliation.title}</h2>
          <p className="mt-1 text-neutral-600">{reconciliation.purpose}</p>
          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            <div className="border border-neutral-200 rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">CPUC (Waymo, CA)</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {Math.round(reconciliation.cpuc_side.total_vmt).toLocaleString()} mi
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {reconciliation.cpuc_side.months_covered} months reported
                {reconciliation.cpuc_side.month_range && (
                  <> ({reconciliation.cpuc_side.month_range[0]} to {reconciliation.cpuc_side.month_range[1]})</>
                )}
              </div>
            </div>
            <div className="border border-neutral-200 rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Waymo S2 benchmark (CA)</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {Math.round(reconciliation.waymo_s2_side.total_miles).toLocaleString()} mi
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Cumulative through vintage {reconciliation.waymo_s2_side.vintage_end}
              </div>
            </div>
          </div>
          <ul className="mt-4 text-sm text-neutral-500 list-disc pl-5 space-y-1">
            {reconciliation.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
