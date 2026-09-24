"use client";

import type { MapCategory } from "@/components/UsStateMap";

// A fixed tile layout keeps all 50 states and D.C. legible at dashboard widths.
const positions: [string, number, number][] = [
  ["AK", 0, 0], ["ME", 0, 11],
  ["WA", 1, 0], ["MT", 1, 1], ["ND", 1, 2], ["MN", 1, 3], ["WI", 1, 4], ["MI", 1, 5], ["VT", 1, 9], ["NH", 1, 10],
  ["OR", 2, 0], ["ID", 2, 1], ["SD", 2, 2], ["IA", 2, 3], ["IL", 2, 4], ["IN", 2, 5], ["OH", 2, 6], ["PA", 2, 7], ["NY", 2, 8], ["MA", 2, 9],
  ["CA", 3, 0], ["NV", 3, 1], ["WY", 3, 2], ["NE", 3, 3], ["MO", 3, 4], ["KY", 3, 5], ["WV", 3, 6], ["VA", 3, 7], ["MD", 3, 8], ["NJ", 3, 9], ["CT", 3, 10], ["RI", 3, 11],
  ["AZ", 4, 0], ["UT", 4, 1], ["CO", 4, 2], ["KS", 4, 3], ["AR", 4, 4], ["TN", 4, 5], ["NC", 4, 6], ["SC", 4, 7], ["DE", 4, 8], ["DC", 4, 9],
  ["NM", 5, 1], ["OK", 5, 2], ["LA", 5, 3], ["MS", 5, 4], ["AL", 5, 5], ["GA", 5, 6],
  ["HI", 6, 0], ["TX", 6, 2], ["FL", 6, 7],
];

export function StateTileMap({ states, categoryByAbbrev, categories, selectedAbbrev, onStateClick }: {
  states: { code: string; name: string }[];
  categoryByAbbrev: Record<string, string>;
  categories: Record<string, MapCategory>;
  selectedAbbrev: string;
  onStateClick: (code: string) => void;
}) {
  const names = Object.fromEntries(states.map(state => [state.code, state.name]));
  return <div>
    <div className="grid grid-cols-12 gap-1" role="group" aria-label="Select a state or the District of Columbia">
      {positions.map(([code, row, column]) => {
        const category = categories[categoryByAbbrev[code]] ?? categories.none;
        const selected = code === selectedAbbrev;
        return <button key={code} type="button" title={`${names[code]} · ${category.label}`} aria-label={`${names[code]}: ${category.label}`} aria-pressed={selected} onClick={() => onStateClick(code)}
          className={`aspect-square min-w-0 rounded-[5px] border flex items-center justify-center text-[clamp(10px,1.1vw,15px)] font-bold tracking-tight transition-transform hover:scale-110 hover:z-10 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b69] ${selected ? "border-[3px] border-black z-10" : "border-black/10"}`}
          style={{ gridRow: row + 1, gridColumn: column + 1, backgroundColor: category.color, color: ["both", "law"].includes(categoryByAbbrev[code]) ? "#fff" : "#172536" }}>{code}</button>;
      })}
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-5 text-xs text-neutral-700" aria-label="Policy map legend">
      {Object.entries(categories).map(([key, category]) => <span key={key} className="inline-flex items-center gap-2"><span aria-hidden="true" className="w-3 h-3 rounded-sm" style={{ backgroundColor: category.color }} />{category.label}</span>)}
    </div>
  </div>;
}
