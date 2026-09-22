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
    <div className="max-w-6xl px-8 py-8">
      <p className="eyebrow mb-3">Activity · State data</p>
      <h1 className="text-4xl font-semibold tracking-tight max-w-3xl">How AV fleets are being used</h1>
      <p className="mt-4 text-lg text-neutral-600 max-w-3xl leading-relaxed">
        Operational activity data are much less standardized nationally than safety reporting. The Observatory treats detailed
        state datasets as comparable case studies and will add additional states as defensible public measures become available.
      </p>

      <div className="mt-8 p-4 border-l-4 border-[#2a78d6] bg-white text-sm text-neutral-600 max-w-3xl">
        <strong className="text-neutral-900">Current deep dive: California passenger service.</strong>{" "}
        CPUC reporting provides monthly trips, vehicle miles, waiting hours, and operating-period detail. These figures should not be read as national totals.
      </div>

      <section className="mt-12">
        <div className="eyebrow">Interactive case study</div>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">California AV passenger-service activity</h2>
        <p className="mt-2 text-sm text-neutral-600 max-w-3xl">Filter by reported operator, program, and measure to inspect how the California market changed over time.</p>
        <div className="viz-card p-5 mt-5"><ActivityExplorer rows={dataset.data} /></div>
      </section>

      <section className="mt-12 grid lg:grid-cols-2 gap-5">
        <ChartCard title="Trips by operating program" subtitle="Shows how reported passenger activity shifted between driverless deployment and drivered/pilot programs." source="CPUC AV Program deployment reports">
          <TripsByProgramChart rows={dataset.data} />
        </ChartCard>
        <ChartCard title="Share of VMT without a passenger" subtitle="Period 1 + Period 2 as a share of total VMT. A measure of fleet circulation and repositioning." source="CPUC AV Program deployment reports">
          <NonPassengerShareChart rows={dataset.data} />
        </ChartCard>
      </section>

      <section className="mt-4">
        <ChartCard title="Where the miles occur in the trip cycle" subtitle="Occupied, en route to pickup, and idle/positioning VMT under CPUC's reporting definitions." source="CPUC AV Deployment Data Template and Dictionary">
          <VmtPeriodChart rows={dataset.data} />
        </ChartCard>
      </section>
    </div>
  );
}
