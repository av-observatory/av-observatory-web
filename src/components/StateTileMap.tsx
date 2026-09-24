"use client";

import type { MapCategory } from "@/components/UsStateMap";

// Equal-area tile coordinates follow a published state-grid arrangement.
// Alaska, Hawaii and D.C. are separate insets because they are not part of the lower 48 outline.
// Rows run north to south; columns west to east.
const positions: [string, number, number][] = [
  ["ME", 0, 11],
  ["VT", 1, 10], ["NH", 1, 11],
  ["WA", 2, 1], ["ID", 2, 2], ["MT", 2, 3], ["ND", 2, 4], ["MN", 2, 5], ["WI", 2, 6], ["MI", 2, 7], ["NY", 2, 9], ["MA", 2, 10], ["RI", 2, 11],
  ["OR", 3, 1], ["UT", 3, 2], ["WY", 3, 3], ["SD", 3, 4], ["IA", 3, 5], ["IL", 3, 6], ["OH", 3, 7], ["PA", 3, 8], ["NJ", 3, 9], ["CT", 3, 10],
  ["CA", 4, 1], ["NV", 4, 2], ["CO", 4, 3], ["NE", 4, 4], ["MO", 4, 5], ["IN", 4, 6], ["WV", 4, 7], ["VA", 4, 8], ["MD", 4, 9], ["DE", 4, 10],
  ["AZ", 5, 2], ["NM", 5, 3], ["KS", 5, 4], ["AR", 5, 5], ["TN", 5, 6], ["KY", 5, 7], ["NC", 5, 9],
  ["OK", 6, 4], ["LA", 6, 5], ["MS", 6, 6], ["AL", 6, 7], ["GA", 6, 8], ["SC", 6, 9],
  ["TX", 7, 4], ["FL", 7, 9],
];

export function StateTileMap({ states, categoryByAbbrev, categories, selectedAbbrev, onStateClick }: {
  states: { code: string; name: string }[];
  categoryByAbbrev: Record<string, string>;
  categories: Record<string, MapCategory>;
  selectedAbbrev: string;
  onStateClick: (code: string) => void;
}) {
  const names = Object.fromEntries(states.map(state => [state.code, state.name]));
  const tile = (code: string, row?: number, column?: number) => {
    const category = categories[categoryByAbbrev[code]] ?? categories.none;
    const selected = code === selectedAbbrev;
    return <button key={code} type="button" title={`${names[code]} · ${category.label}`} aria-label={`${names[code]}: ${category.label}`} aria-pressed={selected} onClick={() => onStateClick(code)}
      className={`aspect-square min-w-0 rounded-[4px] border flex items-center justify-center text-[clamp(11px,1.1vw,15px)] font-bold tracking-tight transition-transform hover:scale-110 hover:z-10 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123b69] ${selected ? "border-[3px] border-black z-10" : "border-black/10"}`}
      style={{ ...(row === undefined ? { width: "min(8%, 42px)" } : { gridRow: row + 1, gridColumn: (column ?? 0) + 1 }), backgroundColor: category.color, color: ["both", "law"].includes(categoryByAbbrev[code]) ? "#fff" : "#172536" }}>{code}</button>;
  };
  return <div>
    <div className="grid grid-cols-12 gap-1" role="group" aria-label="Contiguous United States: select a state">
      {positions.map(([code, row, column]) => tile(code, row, column))}
    </div>
    <div className="flex items-center gap-2 mt-3" role="group" aria-label="Alaska, Hawaii and the District of Columbia">
      {(["AK", "HI", "DC"] as const).map(code => tile(code))}
      <span className="text-xs text-neutral-500 ml-1">AK · HI · D.C.</span>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-5 text-xs text-neutral-700" aria-label="Policy map legend">
      {Object.entries(categories).map(([key, category]) => <span key={key} className="inline-flex items-center gap-2"><span aria-hidden="true" className="w-3 h-3 rounded-sm" style={{ backgroundColor: category.color }} />{category.label}</span>)}
    </div>
  </div>;
}
