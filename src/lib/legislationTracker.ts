"use client";

import { useEffect, useState } from "react";
import snapshot from "../../public/data/legislation_tracker.json";

export type BillDataset = typeof snapshot;
export type Bill = BillDataset["federal"][number] | BillDataset["state_bills"][number];

function editorialDefects(data: BillDataset) {
  return data.state_bills.filter(bill => {
    const summary = (bill.summary || "").trim();
    const source = (bill.source_summary || "").trim();
    return !summary || summary.length > 550 ||
      /substantive summary unavailable|review the official bill record/i.test(summary) ||
      (source.length > 120 && summary === source);
  }).length;
}

function isAcceptableR2(incoming: BillDataset) {
  if (incoming.as_of < snapshot.as_of) return false;
  if (editorialDefects(incoming) > editorialDefects(snapshot)) return false;
  const byId = new Map(incoming.state_bills.map(b => [b.id, b]));
  for (const local of snapshot.state_bills) {
    if (local.summary_quality !== "verified" && local.summary_quality !== "manual_primary_source_verified") continue;
    const remote = byId.get(local.id);
    if (!remote || remote.summary === local.summary) continue;
    if (!remote.summary_reviewed_at || remote.summary_reviewed_at <= (local.summary_reviewed_at || "")) return false;
  }
  return true;
}

export function useLegislationData() {
  const [data, setData] = useState<BillDataset>(snapshot);
  const [source, setSource] = useState<"snapshot" | "R2">("snapshot");
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_LEGISLATION_R2_URL;
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(response => { if (!response.ok) throw Error(`Legislation: ${response.status}`); return response.json(); })
      .then((incoming: BillDataset) => {
        if (incoming.schema_version !== snapshot.schema_version || incoming.states.length !== 51 || !Array.isArray(incoming.federal) || !Array.isArray(incoming.state_bills)) throw Error("Invalid bill dataset");
        if (!isAcceptableR2(incoming)) throw Error("R2 bill snapshot is older or has weaker editorial verification");
        setData(incoming); setSource("R2");
      })
      .catch(error => { if (error.name !== "AbortError") console.warn("Bill R2 unavailable; using reviewed snapshot", error); });
    return () => controller.abort();
  }, []);
  return { data, source };
}
