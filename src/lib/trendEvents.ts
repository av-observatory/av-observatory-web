import trendEvents from "../../public/data/sgo_trend_events.json";
import { monthLabel } from "@/lib/activity";

export type TrendEvent = (typeof trendEvents.events)[number] & { label: string; n: number };

/** Events visible on a chart: pick by predicate, keep those inside the plotted months, and number them in time order. */
export function eventsFor(pick: (e: (typeof trendEvents.events)[number]) => boolean, labels: Set<string>): TrendEvent[] {
  return trendEvents.events
    .filter(pick)
    .map(e => { const [y, m] = e.month.split("-").map(Number); return { ...e, label: monthLabel(y, m) }; })
    .filter(e => labels.has(e.label))
    .map((e, i) => ({ ...e, n: i + 1 }));
}

/** Month -> "1, 2" so events sharing a month share one marker. */
export function markerNumbers(events: TrendEvent[]) {
  const byLabel = new Map<string, number[]>();
  for (const e of events) byLabel.set(e.label, [...(byLabel.get(e.label) ?? []), e.n]);
  return Array.from(byLabel, ([label, nums]) => ({ label, text: nums.join(", ") }));
}
