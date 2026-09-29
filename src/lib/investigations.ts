"use client";

import { useEffect, useState } from "react";
import snapshot from "../../public/data/nhtsa_investigations.json";

export type InvestigationDataset = typeof snapshot;
export type Investigation = InvestigationDataset["investigations"][number];

function deriveR2Url() {
  const explicit = process.env.NEXT_PUBLIC_INVESTIGATIONS_R2_URL;
  if (explicit) return explicit;
  const policy = process.env.NEXT_PUBLIC_POLICY_R2_URL;
  if (!policy) return "";
  return policy.replace(/policy\/policy_tracker\.json(?:\?.*)?$/, "published/oversight/nhtsa_investigations.json");
}

export function useInvestigationsData() {
  const [data, setData] = useState<InvestigationDataset>(snapshot);
  const [source, setSource] = useState<"snapshot" | "R2">("snapshot");

  useEffect(() => {
    const url = deriveR2Url();
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(response => {
        if (!response.ok) throw Error(`Investigations: ${response.status}`);
        return response.json();
      })
      .then((incoming: InvestigationDataset) => {
        if (!Array.isArray(incoming.investigations) || !incoming.investigations.length) throw Error("Invalid investigations dataset");
        setData(incoming);
        setSource("R2");
      })
      .catch(error => {
        if (error.name !== "AbortError") console.warn("Investigation R2 feed unavailable; using site cache", error);
      });
    return () => controller.abort();
  }, []);

  return { data, source };
}
