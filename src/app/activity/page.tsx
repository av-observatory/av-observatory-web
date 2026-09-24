import { promises as fs } from "fs";
import path from "path";
import { ActivityMonthlyDataset } from "@/lib/activity";
import { type CaCrashRateDataset } from "@/components/CaCrashRates";
import { CaliforniaTripReporting } from "@/components/CaliforniaTripReporting";

async function loadDataset(): Promise<ActivityMonthlyDataset> {
  const file = path.join(process.cwd(), "public", "data", "cpuc_activity_monthly.json");
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

export default async function ActivityPage() {
  const [dataset, rates] = await Promise.all([
    loadDataset(),
    fs.readFile(path.join(process.cwd(), "public", "data", "ca_waymo_sgo_rates.json"), "utf-8").then(raw => JSON.parse(raw) as CaCrashRateDataset),
  ]);

  return (
    <div className="max-w-6xl px-8 py-6">
      <p className="eyebrow mb-3">Trip Reporting · California</p>
      <h1 className="text-4xl font-semibold tracking-tight max-w-3xl">California AV Trip Reporting</h1>
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
        California is the only state represented in this trip tracker: its Public Utilities Commission requires AV passenger-service participants to report these trip and mileage data. CPUC data are updated quarterly. These California results do not describe AV activity nationwide.
      </p>

      <CaliforniaTripReporting rows={dataset.data} waymoRates={rates} />
    </div>
  );
}
