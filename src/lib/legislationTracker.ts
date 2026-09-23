"use client";

import { useEffect, useState } from "react";
import snapshot from "../../public/data/legislation_tracker.json";

export type BillDataset = typeof snapshot;
export type Bill = BillDataset["federal"][number];

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
        setData(incoming); setSource("R2");
      })
      .catch(error => { if (error.name !== "AbortError") console.warn("Bill R2 unavailable; using reviewed snapshot", error); });
    return () => controller.abort();
  }, []);
  return { data, source };
}
