import { promises as fs } from "fs";
import path from "path";
import { ActivityMonthlyDataset } from "@/lib/activity";
import { ActivityExplorer } from "@/components/ActivityExplorer";
import {
  WaymoCompositeStats,
  WaymoWaitingTime,
  WaymoVmtUtilization,
  WaymoParkingEstimate,
} from "@/components/ActivityEfficiency";

async function loadDataset(): Promise<ActivityMonthlyDataset> {
  const file = path.join(process.cwd(), "public", "data", "cpuc_activity_monthly.json");
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

export default async function ActivityPage() {
  const dataset = await loadDataset();

  return (
    <div className="max-w-6xl px-8 py-6">
      <p className="eyebrow mb-3">Trip Reporting · California</p>
      <h1 className="text-4xl font-semibold tracking-tight max-w-3xl">California AV Trip Reporting</h1>
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
        California is the only state represented in this trip tracker: its Public Utilities Commission requires AV passenger-service participants to report these trip and mileage data. CPUC data are updated quarterly. These California results do not describe AV activity nationwide.
      </p>

      <section className="mt-5">
        <WaymoCompositeStats rows={dataset.data} />
      </section>

      <section className="mt-7">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="text-xl font-semibold tracking-tight">Passenger activity</h2>
          <span className="text-sm text-neutral-500">Company · program · measure</span>
        </div>
        <div className="viz-card p-4"><ActivityExplorer rows={dataset.data} /></div>
      </section>

      <section className="mt-7">
        <h2 className="text-xl font-semibold tracking-tight mb-2">Waiting time</h2>
        <WaymoWaitingTime rows={dataset.data} />
      </section>

      <section className="mt-7">
        <h2 className="text-xl font-semibold tracking-tight mb-2">VMT and utilization</h2>
        <WaymoVmtUtilization rows={dataset.data} />
      </section>

      <section className="mt-7">
        <h2 className="text-xl font-semibold tracking-tight mb-2">Estimated stationary time</h2>
        <WaymoParkingEstimate rows={dataset.data} />
      </section>

      <div className="mt-5 text-xs text-neutral-500 max-w-4xl leading-relaxed">
        CPUC periods: P1 = unassigned after a trip and before accepting the next trip; P2 = en route to pickup after accepting a trip; P3 = passenger aboard.
        Non-passenger VMT is P1 + P2. Estimated stationary P1 time uses a 14 mph assumed average moving speed and is not directly reported by CPUC.
      </div>
    </div>
  );
}
