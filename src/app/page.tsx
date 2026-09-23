import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { ActivityMonthlyDataset } from "@/lib/activity";
import { SgoMonthlyDataset, WaymoS2StateSummary } from "@/lib/safety";
import { sgoIncidentsStat, waymoTotalMiles, entitiesReportingStat } from "@/lib/overview";
import { StatTile } from "@/components/StatTile";
import { Panel } from "@/components/Panel";
import { NationalStatePolicy } from "@/components/NationalStatePolicy";

async function loadJson<T>(filename: string): Promise<T> {
  const file = path.join(process.cwd(), "public", "data", filename);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

type OperationalLocation = {
  company: string;
  state: string;
  market: string;
  phase: string;
  activity_type?: string;
  evidence_status?: string;
  status: string;
  mode: string;
  source_url: string;
  source_date?: string;
};

function isCurrentOperation(d: OperationalLocation) {
  const activity = d.activity_type ?? d.phase;
  const status = (d.status ?? "").toLowerCase();
  return (d.evidence_status ?? "current") === "current"
    && activity === "deployment"
    && !status.includes("planned")
    && !status.includes("authorized")
    && !status.includes("permit");
}

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString();
}

export default async function OverviewPage() {
  const [cpuc, sgo, waymoS2, odd, currentGeometries] = await Promise.all([
    loadJson<ActivityMonthlyDataset>("cpuc_activity_monthly.json"),
    loadJson<SgoMonthlyDataset>("sgo_incidents_monthly.json"),
    loadJson<WaymoS2StateSummary>("waymo_s2_state_summary.json"),
    loadJson<{ verified_through?: string; locations: OperationalLocation[] }>("operational_domains.json"),
    loadJson<{ type:"FeatureCollection"; features:{ properties?:Record<string,unknown>; geometry?:unknown }[] }>("odd_current_geometries.geojson"),
  ]);

  const incidents = sgoIncidentsStat(sgo);
  const entities = entitiesReportingStat(sgo);
  const totalWaymoMiles = waymoTotalMiles(waymoS2);

  const currentOps = odd.locations.filter(isCurrentOperation);

  // Current service-area polygons are authoritative geography for operators such as Waymo.
  // Merge them into the overview market/operator index so an operator cannot disappear from
  // a market merely because its point-style operational record is stale or absent.
  const polygonOps: OperationalLocation[] = currentGeometries.features.flatMap(feature => {
    const p = feature.properties ?? {};
    const company = String(p.company ?? "");
    const market = String(p.market ?? "");
    const state = String(p.state ?? "");
    const activity = String(p.activity_type ?? p.phase ?? "");
    const evidence = String(p.evidence_status ?? "current");
    const mode = String(p.mode ?? "passenger");
    if (!company || !market || !state || activity !== "deployment" || evidence !== "current") return [];
    return [{
      company,
      market,
      state,
      phase: "deployment",
      activity_type: "deployment",
      evidence_status: "current",
      status: String(p.status ?? "current_service_area"),
      mode,
      source_url: String(p.source_url ?? ""),
      source_date: String(p.event_date ?? ""),
    }];
  });

  const mergedOpsMap = new Map<string, OperationalLocation>();
  for (const d of [...currentOps, ...polygonOps]) {
    const key = `${d.company}|${d.market}|${d.state}|${d.mode}`;
    mergedOpsMap.set(key, d);
  }
  const mergedCurrentOps = Array.from(mergedOpsMap.values());

  const currentCompanies = Array.from(new Set(mergedCurrentOps.map(d => d.company))).sort();
  const currentStates = Array.from(new Set(mergedCurrentOps.map(d => d.state))).sort();

  const companiesByState = new Map<string, Set<string>>();
  for (const d of mergedCurrentOps) {
    if (!companiesByState.has(d.state)) companiesByState.set(d.state, new Set());
    companiesByState.get(d.state)!.add(d.company);
  }
  const operationValueByState = Object.fromEntries(
    Array.from(companiesByState.entries()).map(([state, companies]) => [state, companies.size])
  );

  const passengerMarkets = new Map<string, { state: string; companies: Set<string> }>();
  const freightCorridors = new Map<string, Set<string>>();
  for (const d of mergedCurrentOps) {
    if (d.mode === "freight") {
      if (!freightCorridors.has(d.market)) freightCorridors.set(d.market, new Set());
      freightCorridors.get(d.market)!.add(d.company);
      continue;
    }
    const key = `${d.market}|${d.state}`;
    if (!passengerMarkets.has(key)) passengerMarkets.set(key, { state: d.state, companies: new Set() });
    passengerMarkets.get(key)!.companies.add(d.company);
  }

  const topPassengerMarkets = Array.from(passengerMarkets.entries())
    .map(([key, value]) => ({
      market: key.split("|")[0],
      state: value.state,
      companies: Array.from(value.companies).sort(),
    }))
    .sort((a, b) => b.companies.length - a.companies.length || a.market.localeCompare(b.market))
    .slice(0, 10);

  const freightRows = Array.from(freightCorridors.entries())
    .map(([market, companies]) => ({ market, companies: Array.from(companies).sort() }))
    .sort((a, b) => a.market.localeCompare(b.market))
    .slice(0, 8);

  const latestPeriod = cpuc.data.reduce((best, row) => {
    const key = row.calendar_year * 100 + row.calendar_month;
    return key > best ? key : best;
  }, 0);
  const latestRows = cpuc.data.filter(row => row.calendar_year * 100 + row.calendar_month === latestPeriod);
  const latestTrips = latestRows.reduce((sum, row) => sum + (row.total_trips ?? 0), 0);
  const latestVmt = latestRows.reduce((sum, row) => sum + (row.total_vmt_all_periods ?? 0), 0);
  const latestYear = Math.floor(latestPeriod / 100);
  const latestMonth = latestPeriod % 100;
  const latestPeriodLabel = new Date(latestYear, latestMonth - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });

  return (
    <div className="max-w-6xl px-8 py-8">
      <p className="eyebrow mb-3">United States</p>
      <h1 className="text-4xl font-semibold tracking-tight text-[#0b1d33] max-w-3xl">
        The U.S. Autonomous Vehicle Observatory
      </h1>
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
        A national snapshot of where autonomous vehicles are operating, the major passenger and freight markets, reported safety incidents, and available ride and mileage exposure data.
      </p>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <StatTile label="Current operating companies" value={currentCompanies.length.toString()} caption="Companies with current deployment evidence in the Observatory" href="/deployment" />
        <StatTile label="States with current operations" value={currentStates.length.toString()} caption="States represented by current deployment evidence" href="/deployment" />
        <StatTile label="Passenger markets" value={passengerMarkets.size.toString()} caption="Current ridehail, shuttle, and passenger-service markets" href="/deployment" />
        <StatTile label="Reported SGO incidents" value={incidents.total.toLocaleString()} pctChange={incidents.pctChange} caption="NHTSA incident reports; reports are not findings of fault" href="/safety" />
        <StatTile label={`CA passenger trips · ${latestPeriodLabel}`} value={compact(latestTrips)} caption="Latest CPUC-reported monthly passenger trips" href="/activity" />
        <StatTile label="Waymo published miles" value={compact(totalWaymoMiles)} caption={`Latest S2 benchmark vintage ${waymoS2.vintage_end}`} href="/deployment/waymo" />
      </div>

      <section className="mt-7">
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Current U.S. operations</h2>
            <p className="text-sm text-neutral-600 mt-1">
              State shading is the number of companies with current deployment evidence, not permit eligibility or testing authority.
            </p>
          </div>
          <Link href="/deployment" className="text-sm underline font-medium text-[#0b1d33]">Deployment detail →</Link>
        </div>
        <NationalStatePolicy valueByAbbrev={operationValueByState} companiesByState={Object.fromEntries(Array.from(companiesByState, ([state, companies]) => [state, Array.from(companies).sort()]))} />
        <p className="mt-2 text-xs text-neutral-500">Operator, regulator, and platform evidence · verified through {odd.verified_through ?? "latest refresh"}. Policy summaries cover all 50 states and D.C.; nine have additional agency-level review and the others use an August 2026 state-law survey.</p>
      </section>

      <section className="mt-7 grid lg:grid-cols-2 gap-3">
        <Panel title="Primary passenger markets" subtitle="Current passenger-service markets; operators shown where multiple services overlap.">
          <div className="divide-y divide-neutral-100">
            {topPassengerMarkets.map(row => (
              <div key={`${row.market}-${row.state}`} className="py-2 first:pt-0 flex items-start justify-between gap-4 text-sm">
                <div>
                  <div className="font-medium">{row.market}, {row.state}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{row.companies.join(" · ")}</div>
                </div>
                <div className="text-xs text-neutral-400 tabular-nums">{row.companies.length} operator{row.companies.length === 1 ? "" : "s"}</div>
              </div>
            ))}
          </div>
          <Link href="/deployment" className="inline-block mt-3 text-sm underline font-medium text-[#0b1d33]">Explore service areas and ODDs →</Link>
        </Panel>

        <Panel title="Current freight operations" subtitle="Reported commercial freight corridors and operating markets.">
          {freightRows.length ? (
            <div className="divide-y divide-neutral-100">
              {freightRows.map(row => (
                <div key={row.market} className="py-2 first:pt-0 text-sm">
                  <div className="font-medium">{row.market}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{row.companies.join(" · ")}</div>
                </div>
              ))}
            </div>
          ) : <div className="text-sm text-neutral-500">No current freight deployment records in the current dataset.</div>}
          <Link href="/deployment" className="inline-block mt-3 text-sm underline font-medium text-[#0b1d33]">See corridor evidence →</Link>
        </Panel>
      </section>

      <section className="mt-7">
        <h2 className="text-xl font-semibold tracking-tight">National indicators</h2>
        <p className="text-sm text-neutral-600 mt-1">
          The overview stops at headline indicators; detailed charts and record-level analysis live on the dedicated pages.
        </p>
        <div className="mt-3 grid md:grid-cols-3 gap-3">
          <OverviewCard
            eyebrow="Safety reporting"
            title={`${incidents.total.toLocaleString()} NHTSA SGO incident reports`}
            body={`${entities.total} reporting entities across ${sgo.states_represented.filter(s => s !== "Unknown").length} identified states. Counts are reports, not verified at-fault crashes.`}
            href="/safety"
            linkLabel="Open Safety"
          />
          <OverviewCard
            eyebrow="Passenger activity"
            title={`${compact(latestTrips)} reported trips in ${latestPeriodLabel}`}
            body={`California CPUC passenger-service reports also record ${compact(latestVmt)} vehicle miles in the latest month. This is California reporting, not a national rides total.`}
            href="/activity"
            linkLabel="Open Activity"
          />
          <OverviewCard
            eyebrow="Waymo exposure"
            title={`${compact(totalWaymoMiles)} published operational miles`}
            body="Waymo's S2 benchmark provides unusually detailed geographic exposure data. It is kept in the dedicated Waymo deployment view rather than repeated here."
            href="/deployment/waymo"
            linkLabel="Open Waymo deployment"
          />
        </div>
      </section>

      <div className="mt-5 text-[11px] text-neutral-400">
        Sources have different reporting scopes and vintages. Headline counts are labeled to avoid treating California trip reporting, NHTSA incident reporting, and operator-published mileage as directly comparable national measures.
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between border-b border-neutral-100 pb-2"><span>{label}</span><strong className="tabular-nums">{value}</strong></div>;
}

function OverviewCard({ eyebrow, title, body, href, linkLabel }: { eyebrow: string; title: string; body: string; href: string; linkLabel: string }) {
  return (
    <div className="viz-card p-5">
      <div className="eyebrow">{eyebrow}</div>
      <div className="text-lg font-semibold mt-2">{title}</div>
      <p className="text-sm text-neutral-600 mt-2 leading-relaxed">{body}</p>
      <Link href={href} className="inline-block mt-4 text-sm underline font-medium text-[#0b1d33]">{linkLabel} →</Link>
    </div>
  );
}
