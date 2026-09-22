import { promises as fs } from "fs";
import path from "path";
import { ActivityMonthlyDataset } from "@/lib/activity";
import { SgoMonthlyDataset, WaymoS2StateSummary } from "@/lib/safety";
import { StatePermitRegistry } from "@/lib/registry";
import Link from "next/link";
import {
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
  const [cpuc, sgo, waymoS2, registry] = await Promise.all([
    loadJson<ActivityMonthlyDataset>("cpuc_activity_monthly.json"),
    loadJson<SgoMonthlyDataset>("sgo_incidents_monthly.json"),
    loadJson<WaymoS2StateSummary>("waymo_s2_state_summary.json"),
    loadJson<StatePermitRegistry>("state_permit_registry.json"),
  ]);
  const incidents = sgoIncidentsStat(sgo);
  const totalWaymoMiles = waymoTotalMiles(waymoS2);
  const entities = entitiesReportingStat(sgo);

  const milesByAbbrev: Record<string, number> = {};
  for (const s of waymoS2.state_summary) milesByAbbrev[STATE_NAME_TO_ABBREV[s.state] ?? s.state] = s.waymo_ro_miles;

  const authorizationByState: Record<string, number> = {};
  const operationalStates = new Set<string>();
  for (const p of registry.all_permits) {
    if (p.state === "US") continue;
    if (p.source_category === "operational_evidence") {
      operationalStates.add(p.state);
      continue;
    }
    authorizationByState[p.state] = (authorizationByState[p.state] ?? 0) + 1;
  }

  const regulatoryCategoryByState: Record<string, string> = {};
  for (const state of operationalStates) regulatoryCategoryByState[state] = "operational";
  for (const state of Object.keys(authorizationByState)) regulatoryCategoryByState[state] = "public_roster";
  for (const s of registry.states_status_notes) {
    if (s.status === "permit_required_not_public") regulatoryCategoryByState[s.state] = "permit_regime";
    else if (!regulatoryCategoryByState[s.state] && s.status === "unclear") regulatoryCategoryByState[s.state] = "unclear";
  }

  const authorizationStates = Object.keys(authorizationByState).length;
  const permitRegimeStates = registry.states_status_notes.filter(s => s.status === "permit_required_not_public").length;
  const documentedOperationalStates = operationalStates.size;

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
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
        National AV deployment, safety, and activity data from federal, state, and operator sources.
      </p>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        <StatTile label="States in national incident data" value={sgo.states_represented.length.toString()} caption="States represented in NHTSA SGO incident reports" />
        <StatTile label="ADS reporting entities" value={entities.total.toString()} caption="Entities represented in the national SGO dataset" />
        <StatTile label="Reported incidents" value={incidents.total.toLocaleString()} pctChange={incidents.pctChange} caption="NHTSA SGO, all represented operators and states" />
        <StatTile label="States with public holder rosters" value={authorizationStates.toString()} caption="Company-level permit / registry records currently ingested" />
        <StatTile label="Additional permit-regime states" value={permitRegimeStates.toString()} caption="Permit required, but holder roster not publicly available" />
      </div>

      <div className="mt-6 grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <Panel
            title="U.S. AV regulatory and operating footprint"
            subtitle="Public holder rosters, non-public permit regimes, and documented operation."
            source="State DMV, DOT, PUC, NHTSA, and operator-published records"
          >
            <UsStateMap
              categoryByAbbrev={regulatoryCategoryByState}
              categories={{
                public_roster: { label: "Public company-level permit / registry roster", color: "#1f5fae" },
                permit_regime: { label: "Permit / authorization required; holder roster not public", color: "#6da7ec" },
                operational: { label: "Documented AV operation; no public holder roster ingested", color: "#9fd3c7" },
                unclear: { label: "Regulatory status under review", color: "#d8d6cf" },
              }}
            />
          </Panel>
          <div className="mt-2 text-xs"><Link href="/deployment" className="underline font-medium text-[#0b1d33]">Open the national Deployment Explorer →</Link></div>
        </div>
        <Panel
          title="California passenger trips"
          subtitle="Monthly CPUC-reported passenger service."
          source="CPUC AV Program deployment reports"
        >
          <TripsChart rows={cpuc.data} />
        </Panel>
      </div>

      <div className="mt-7 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Exposure and source coverage</h2>
        <span className="text-xs text-neutral-500">State and operator detail</span>
      </div>

      <div className="mt-2 grid lg:grid-cols-3 gap-3">
        <Panel
          title="Top counties by Waymo reported miles"
          source="Waymo self-published safety benchmark data"
        >
          <CountyMilesTable data={waymoS2} limit={8} />
        </Panel>

        <Panel
          title="Coverage by state"
          subtitle="Current source coverage by geography."
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

        <Panel title="Coverage counts">
          <div className="space-y-4 text-sm">
            <div className="flex justify-between border-b border-neutral-100 pb-2"><span>Public permit / registry rosters</span><strong>{authorizationStates}</strong></div>
            <div className="flex justify-between border-b border-neutral-100 pb-2"><span>Permit regimes, roster not public</span><strong>{permitRegimeStates}</strong></div>
            <div className="flex justify-between border-b border-neutral-100 pb-2"><span>States with operational evidence</span><strong>{documentedOperationalStates}</strong></div>
            <div className="flex justify-between"><span>States in NHTSA SGO data</span><strong>{sgo.states_represented.length}</strong></div>
          </div>
        </Panel>
      </div>

      <div className="mt-4 text-[11px] text-neutral-400">
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
