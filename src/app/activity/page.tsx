import { promises as fs } from "fs";
import path from "path";
import { ActivityMonthlyDataset } from "@/lib/activity";
import { ChartCard } from "@/components/ChartCard";
import { TripsChart, VmtChart, VmtPeriodChart, NonPassengerShareChart, WaitingHoursChart, TripsByProgramChart } from "@/components/ActivityCharts";

async function loadDataset(): Promise<ActivityMonthlyDataset> {
  const file = path.join(process.cwd(), "public", "data", "cpuc_activity_monthly.json");
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

export default async function ActivityPage() {
  const dataset = await loadDataset();

  return (
    <div className="max-w-4xl px-8 py-8">
      <p className="text-sm uppercase tracking-wide text-neutral-500 mb-3">Activity</p>
      <h1 className="text-3xl font-semibold tracking-tight max-w-2xl">
        California AV Activity Monitor
      </h1>
      <p className="mt-4 text-neutral-600 max-w-2xl">
        Monthly passenger trips and vehicle miles traveled reported to the
        California Public Utilities Commission under the AV Passenger Service
        program. Figures are operator-reported and reflect the periods CPUC
        has released to date.
      </p>

      <div className="mt-12">
        <ChartCard
          title="Trips by program: Driverless Deployment vs. Drivered/Pilot"
          subtitle="CPUC distinguishes a fully driverless Deployment program from a Drivered/Pilot program (safety driver present, closer to a testing configuration). Pre-2023 filings didn't distinguish programs in the files ingested so far."
          source="CPUC AV Program deployment reports"
        >
          <TripsByProgramChart rows={dataset.data} />
        </ChartCard>

        <ChartCard
          title="Passenger trips over time"
          subtitle="Total AV passenger trips reported per month, all operators."
          source="CPUC AV Program deployment reports"
        >
          <TripsChart rows={dataset.data} />
        </ChartCard>

        <ChartCard
          title="AV vehicle miles traveled over time"
          subtitle="Total VMT across all CPUC-defined reporting periods, all operators."
          source="CPUC AV Program deployment reports"
        >
          <VmtChart rows={dataset.data} />
        </ChartCard>

        <ChartCard
          title="VMT by CPUC reporting period"
          subtitle="Period 3 = occupied, passenger aboard. Period 2 = en route to pickup after accepting a trip. Period 1 = idle/positioning, not carrying or en route to a passenger. Definitions per CPUC's own Trip-Level Data Dictionary."
          source="CPUC AV Deployment Data Template and Dictionary; CPUC AV Program deployment reports"
        >
          <VmtPeriodChart rows={dataset.data} />
        </ChartCard>

        <ChartCard
          title="Non-passenger VMT share"
          subtitle="Share of total VMT driven without a passenger aboard (Period 1 + Period 2, as a percent of total VMT)."
          source="CPUC AV Deployment Data Template and Dictionary; CPUC AV Program deployment reports"
        >
          <NonPassengerShareChart rows={dataset.data} />
        </ChartCard>

        <ChartCard
          title="Total reported waiting hours"
          subtitle="Fleet-level waiting hours per month, as reported to CPUC. Not a per-trip average -- CPUC's TotalWaiting field reflects vehicle-hours waiting across the active fleet, not time tied to individual completed trips, so dividing by trip count would overstate typical rider wait time substantially."
          source="CPUC AV Program deployment reports"
        >
          <WaitingHoursChart rows={dataset.data} />
        </ChartCard>
      </div>

      {dataset.data.length === 0 && (
        <p className="text-sm text-neutral-500 mt-4">
          This dataset is currently empty on this deploy. Run the{" "}
          <code className="bg-neutral-100 px-1 rounded">CPUC ingest + publish</code>{" "}
          GitHub Action to populate it from raw CPUC archives in R2.
        </p>
      )}
    </div>
  );
}
