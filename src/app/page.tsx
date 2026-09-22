import { promises as fs } from "fs";
import path from "path";
import { ActivityMonthlyDataset } from "@/lib/activity";
import { SgoMonthlyDataset, WaymoS2StateSummary } from "@/lib/safety";
import {
  cpucTripsStat,
  sgoIncidentsStat,
  waymoTotalMiles,
  entitiesReportingStat,
} from "@/lib/overview";
import { StatTile } from "@/components/StatTile";
import { Panel } from "@/components/Panel";
import { TripsChart } from "@/components/ActivityCharts";
import { CountyMilesTable } from "@/components/SafetyCharts";
import { UsStateMap } from "@/components/UsStateMap";

async function loadJson<T>(filename: string): Promise<T> {
  const file = path.join(process.cwd(), "public", "data", filename);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

const STATE_NAME_TO_ABBREV: Record<string, string> = {
  California: "CA", Arizona: "AZ", Texas: "TX", Georgia: "GA",
};

export default async function OverviewPage() {
  const [cpuc, sgo, waymoS2] = await Promise.all([
    loadJson<ActivityMonthlyDataset>("cpuc_activity_monthly.json"),
    loadJson<SgoMonthlyDataset>("sgo_incidents_monthly.json"),
    loadJson<WaymoS2StateSummary>("waymo_s2_state_summary.json"),
  ]);

  const trips = cpucTripsStat(cpuc);
  const incidents = sgoIncidentsStat(sgo);
  const totalWaymoMiles = waymoTotalMiles(waymoS2);
  const entities = entitiesReportingStat(sgo);

  const milesByAbbrev: Record<string, number> = {};
  for (const s of waymoS2.state_summary) {
    milesByAbbrev[STATE_NAME_TO_ABBREV[s.state] ?? s.state] = s.waymo_ro_miles;
  }

  const dataAvailability: { state: string; cpuc: boolean; sgo: boolean; waymoS2: boolean }[] = (() => {
    const states = new Set<string>(["CA", ...sgo.states_represented, ...Object.keys(milesByAbbrev)]);
    return Array.from(states)
      .sort()
      .map((state) => ({
        state,
        cpuc: state === "CA",
        sgo: sgo.states_represented.includes(state),
        waymoS2: Object.keys(milesByAbbrev).includes(state),
      }));
  })();

  return (
    <div className="px-8 py-8">
      <p className="eyebrow mb-3">United States</p>
      <h1 className="text-4xl font-semibold tracking-tight text-[#0b1d33] max-w-3xl">The U.S. Autonomous Vehicle Observatory</h1>
      <p className="mt-3 text-lg text-neutral-600 max-w-3xl leading-relaxed">
        Independent, longitudinal evidence on where autonomous vehicles are
        operating, how deployment is changing, and what their impacts look
        like across the United States.
      </p>
      <p className="mt-3 text-sm text-neutral-500 max-w-3xl">
        National sources provide the backbone; state and local datasets add
        depth where public reporting is stronger. California is currently the
        deepest activity case study, not the boundary of the Observatory.
      </p>

      <div className="mt-10">
        <div className="eyebrow mb-3">National indicators</div>
        <div className="flex flex-wrap gap-4">
        <StatTile
          label="California AV Passenger Trips (CPUC)"
          value={trips.total.toLocaleString()}
          pctChange={trips.pctChange}
          caption="Observed to date, CPUC-reported operators only"
        />
        <StatTile
          label="Waymo Reported Miles (All States)"
          value={`${(totalWaymoMiles / 1_000_000).toFixed(1)}M`}
          caption={`Cumulative through vintage ${waymoS2.vintage_end}, Waymo-published data`}
        />
        <StatTile
          label="Reported Incidents (NHTSA SGO, National)"
          value={incidents.total.toLocaleString()}
          pctChange={incidents.pctChange}
          caption="All ADS operators, all states"
        />
        <StatTile
          label="ADS Operators Reporting (NHTSA SGO)"
          value={entities.total.toString()}
          caption={
            entities.newThisYear !== null
              ? `${entities.newThisYear} new in ${entities.latestYear} vs ${entities.latestYear - 1}`
              : "All-time, national"
          }
        />
        </div>
      </div>

      <div className="mt-10 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">National footprint</div>
          <h2 className="text-2xl font-semibold tracking-tight mt-1">Where AV activity is visible in public data</h2>
          <p className="mt-2 text-sm text-neutral-600 max-w-2xl">The map reflects published operator mileage, while the Deployment Explorer adds permits, testing registries, and other state-level authorization records.</p>
        </div>
      </div>

      <div className="mt-4 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Panel
            title="Waymo Reported Operational Miles by State"
            subtitle="Only states with published Waymo S2-cell benchmark data are shaded; other states have no public operational-miles data in this Observatory yet."
            source="Waymo self-published safety benchmark data"
          >
            <UsStateMap valueByAbbrev={milesByAbbrev} />
          </Panel>
        </div>
        <Panel
          title="California deep dive: passenger trips"
          subtitle="California currently provides the country's richest recurring public passenger-service dataset. This is a state deep dive within the national Observatory, not a national trip total."
          source="CPUC AV Program deployment reports"
        >
          <TripsChart rows={cpuc.data} />
        </Panel>
      </div>

      <div className="mt-4 grid lg:grid-cols-3 gap-4">
        <Panel
          title="Top Counties by Waymo Reported Miles"
          source="Waymo self-published safety benchmark data"
        >
          <CountyMilesTable data={waymoS2} limit={8} />
        </Panel>

        <Panel
          title="National data coverage"
          subtitle="Which public sources currently provide state-level observations in the Observatory. Absence here means a data gap, not necessarily an absence of AV activity."
        >
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-200">
                <th className="py-1.5 pr-2 font-medium">State</th>
                <th className="py-1.5 px-2 font-medium text-center">CPUC</th>
                <th className="py-1.5 px-2 font-medium text-center">SGO</th>
                <th className="py-1.5 px-2 font-medium text-center">Waymo S2</th>
              </tr>
            </thead>
            <tbody>
              {dataAvailability.map((row) => (
                <tr key={row.state} className="border-b border-neutral-100">
                  <td className="py-1.5 pr-2">{row.state}</td>
                  <Dot on={row.cpuc} />
                  <Dot on={row.sgo} />
                  <Dot on={row.waymoS2} />
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="mt-6 text-xs text-neutral-400">
        Last updated: pipeline runs are manual for now; see each page for source-specific dates.
      </div>
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <td className="py-1.5 px-2 text-center">
      <span className={`inline-block w-2 h-2 rounded-full ${on ? "bg-emerald-500" : "bg-neutral-200"}`} />
    </td>
  );
}
