"use client";

import { useEffect, useState } from "react";
import snapshot from "../../public/data/policy_tracker.json";

export type PolicyDataset = typeof snapshot;
export type PolicyEvent = PolicyDataset["state_events"][number];
export const policySnapshot = snapshot;

/** Public R2 object is the live source. The checked-in JSON is an offline snapshot. */
export function usePolicyData() {
  const [data, setData] = useState<PolicyDataset>(snapshot);
  const [source, setSource] = useState<"snapshot" | "R2">("snapshot");
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_POLICY_R2_URL;
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(response => { if (!response.ok) throw Error(`Policy data: ${response.status}`); return response.json(); })
      .then((incoming: PolicyDataset) => {
        if (incoming.schema_version !== snapshot.schema_version || !Array.isArray(incoming.states) || incoming.states.length !== 51 || !Array.isArray(incoming.federal) || !Array.isArray(incoming.city_events)) throw Error("Invalid policy dataset");
        setData(incoming); setSource("R2");
      })
      .catch(error => { if (error.name !== "AbortError") console.warn("Policy R2 unavailable; using reviewed snapshot", error); });
    return () => controller.abort();
  }, []);
  return { data, source };
}

export function displayDate(date: string | null) {
  // An aggregate current framework or continuing oversight position has no
  // single enactment date. Omit the date instead of inventing one.
  if (!date) return "";
  if (/^\d{4}$/.test(date)) return date;
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
