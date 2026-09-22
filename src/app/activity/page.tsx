import { promises as fs } from "fs";
import path from "path";
import { ActivityMonthlyDataset } from "@/lib/activity";
import { ChartCard } from "@/components/ChartCard";
import { ActivityExplorer } from "@/components/ActivityExplorer";
import { VmtPeriodChart, NonPassengerShareChart, TripsByProgramChart } from "@/components/ActivityCharts";

async function loadDataset(): Promise<ActivityMonthlyDataset> {
  const file = path.join(process.cwd(), "public", "data", "cpuc_activity_monthly.json");
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

export default async function ActivityPage() {
  const dataset = await loadDataset();

  return (
    <div className="max-w-6xl px-8 py-6">
      <p className="eyebrow mb-3">Activity · State data</p>
      <h1 className="text-4xl font-semibold tracking-tight max-w-3xl">How AV fleets are being used</h1>
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">California passenger-service activity from CPUC reporting: trips, VMT, waiting time, and trip-cycle mileage.</p>

      <section className="mt-6">
        <h2 className="text-xl font-semibold tracking-tight">California passenger-service activity</h2>
        <div className="viz-card p-4 mt-2"><ActivityExplorer rows={dataset.data} /></div>
      </section>

      <section className="mt-5 grid lg:grid-cols-2 gap-3">
        <ChartCard title="Trips by operating program" subtitle="Shows how reported passenger activity shifted between driverless deployment and drivered/pilot programs." source="CPUC AV Program deployment reports">
          <TripsByProgramChart rows={dataset.data} />
        </ChartCard>
        <ChartCard title="Share of VMT without a passenger" subtitle="Period 1 + Period 2 as a share of total VMT. A measure of fleet circulation and repositioning." source="CPUC AV Program deployment reports">
          <NonPassengerShareChart rows={dataset.data} />
        </ChartCard>
      </section>

      <section className="mt-1">
        <ChartCard title="Where the miles occur in the trip cycle" subtitle="Occupied, en route to pickup, and idle/positioning VMT under CPUC's reporting definitions." source="CPUC AV Deployment Data Template and Dictionary">
          <VmtPeriodChart rows={dataset.data} />
        </ChartCard>
      </section>
    </div>
  );
}
