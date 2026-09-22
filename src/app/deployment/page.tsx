import { promises as fs } from "fs";
import path from "path";
import { MaAdtRegistry } from "@/lib/deployment";
import { StatePermitRegistry } from "@/lib/registry";
import { ManufacturerSearch } from "@/components/ManufacturerSearch";

async function loadJson<T>(filename: string): Promise<T> {
  const file = path.join(process.cwd(), "public", "data", filename);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

const STATUS_LABELS: Record<string, string> = {
  no_permit_regime: "No AV-specific permit regime found",
  permit_required_not_public: "Permit required, but no public roster",
  unclear: "Unclear -- needs further research",
};

export default async function DeploymentPage() {
  const ma = await loadJson<MaAdtRegistry>("ma_adt_testing_registry.json");
  const registry = await loadJson<StatePermitRegistry>("state_permit_registry.json");

  return (
    <div className="max-w-5xl px-8 py-8">
      <p className="text-sm uppercase tracking-wide text-neutral-500 mb-3">Deployment</p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Autonomous Vehicle Deployment Explorer
      </h1>
      <p className="mt-4 text-neutral-600 max-w-2xl">
        Explore where AV developers are authorized to test or deploy, how those
        authorizations differ by driver status, and where separate public
        records document real-world operation. The Observatory keeps
        authorization, operational evidence, and historical activity distinct.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">Explore the deployment landscape</h2>
        <p className="mt-1 text-neutral-600">
          Use the controls to compare companies, states, testing versus deployment, and drivered versus driverless programs. The map and underlying records update together.
        </p>
        <div className="mt-4 grid md:grid-cols-3 gap-3 text-sm">
          <div className="viz-card p-4"><strong>Authorization</strong><p className="text-neutral-500 mt-1">A permit, registration, certification, or program roster published by an agency.</p></div>
          <div className="viz-card p-4"><strong>Operational evidence</strong><p className="text-neutral-500 mt-1">A separate public record showing activity, such as an SGO incident or published mileage. It is not a permit.</p></div>
          <div className="viz-card p-4"><strong>Historical</strong><p className="text-neutral-500 mt-1">Past activity remains in the longitudinal record even when a company or program is no longer current.</p></div>
        </div>
        <div className="mt-6">
          <ManufacturerSearch manufacturers={registry.manufacturers} />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">
          States without a public company-level roster
        </h2>
        <p className="mt-1 text-neutral-600">
          &quot;No public roster&quot; does not mean no permits exist -- some of these
          states have a confirmed, real permit requirement that simply isn&apos;t
          published as a company list.
        </p>
        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          {registry.states_status_notes.map((s) => (
            <div key={s.state} className="bg-white border border-neutral-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{s.state}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                  {STATUS_LABELS[s.status] ?? s.status}
                </span>
              </div>
              {s.agency && <div className="mt-1 text-xs text-neutral-500">{s.agency}</div>}
              <p className="mt-2 text-sm text-neutral-600">{s.note}</p>
              {s.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {s.sources.map((src) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer" className="text-[#0b1d33] underline">
                      source
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Massachusetts (detail)</h2>
        <p className="mt-1 text-neutral-600">{ma.coverage}</p>
        <p className="mt-3 text-sm text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg p-3">
          {ma.important_caveat}
        </p>

        <div className="mt-6 space-y-4">
          {ma.companies.map((c) => (
            <div key={c.company} className="bg-white border border-neutral-200 rounded-lg p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{c.company}</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    c.status_basis === "recent_report_on_file"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {c.status_basis === "recent_report_on_file"
                    ? "Reported within 18 months"
                    : `No report filed in ${c.months_since_last_report} months`}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-neutral-500">Reports filed</dt>
                  <dd className="tabular-nums">{c.testing_report_count}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">First reporting period</dt>
                  <dd>{c.earliest_period_start ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Last reporting period</dt>
                  <dd>{c.latest_period_end ?? "—"}</dd>
                </div>
              </dl>
              <details className="mt-3">
                <summary className="text-sm text-neutral-500 cursor-pointer">
                  {c.documents.length} source documents
                </summary>
                <ul className="mt-2 text-sm space-y-1">
                  {c.documents.map((d) => (
                    <li key={d.url}>
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-[#0b1d33] underline">
                        {d.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>

        <div className="mt-4 text-xs text-neutral-400">
          Source:{" "}
          <a href={ma.source_list_url} target="_blank" rel="noreferrer" className="underline">
            {ma.source}
          </a>
          . Captured {ma.captured_at}.
        </div>
      </section>

    </div>
  );
}
