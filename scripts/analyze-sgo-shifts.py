#!/usr/bin/env python3
"""Find where the SGO crash-report trend changes slope, then gather evidence for each change.

For the industry and for every company with enough crashes, monthly ADS crash counts (by
incident month, through the last complete month) are split into straight-line segments by
dynamic programming on the square root of the counts (variance-stabilised, BIC-style penalty,
minimum segment length). Each retained break is described only with facts computed from
the data on this site: how fast reports were growing before and after, which cities and
states first appear in the reports, which companies or vehicle platforms added the growth,
highway share, the number of distinct vehicles reporting a crash, and, where public
mileage exists (Waymo in California from the CPUC, Waymo's S2 releases), how exposure moved
and what happened to crashes per million miles. Sourced public events about service expansion, operating-domain changes and fleets are
attached only when they fall within two months of a break and are labelled as coincident
context, never as a proven cause.
"""
import csv
import json
import math
import re
from collections import Counter
from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parents[1] / "public/data"
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
PARTNERS = {"General Motors", "Ford Motor Company", "PACCAR", "Transdev", "Transdev Alternative Services"}
MIN_CRASHES = 15          # companies below this have too little data to analyse
MIN_SEG = 6               # months
MAX_SEG = 6


def company(entities):
    names = [re.sub(r",?\s*(LLC|Inc\.?|Corp\.?|Corporation|Incorporated|Operations|Auto)\b.*$", "", e.strip(), flags=re.I).strip()
             for e in entities.split(";") if e.strip()]
    return next((n for n in names if n not in PARTNERS), names[0] if names else "Unknown")


def platform(make, model):
    mk = {"JLR": "Jaguar"}.get(make.strip().upper(), make.strip().title())
    md = re.sub(r"[\s-]+", "", model.strip().upper())
    return f"{mk} {md}".strip()


def label(ym):
    return f"{MONTHS[ym % 12].title()} {ym // 12}"


def complete_through():
    d = json.loads((DATA / "sgo_incidents_monthly.json").read_text())
    newest = max(r["year"] * 12 + r["month"] for r in d["monthly_national_total"])
    return newest - 2 + 0  # ym index (0-based month) of the last complete filing month


def load():
    last = complete_through()
    rows = []
    for r in csv.DictReader(open(DATA / "sgo_crashes.csv", encoding="utf-8")):
        m = re.match(r"([A-Z]{3})-(\d{4})", r["incident_date"])
        if r["automation_system_engaged"] != "ADS" or not m or m.group(1) not in MONTHS:
            continue
        ym = int(m.group(2)) * 12 + MONTHS.index(m.group(1))
        if ym <= last:
            rows.append({**r, "ym": ym, "company": company(r["reporting_entities"]),
                         "model": platform(r["make"], r["model"]),
                         "vehicles": [v for v in r["same_vehicle_ids"].split(";") if v]})
    return rows, last


def fit(y, i, j):
    x = np.arange(i, j)
    A = np.vstack([x, np.ones(len(x))]).T
    coef = np.linalg.lstsq(A, y[i:j], rcond=None)[0]
    return float(((A @ coef - y[i:j]) ** 2).sum())


def segment(counts, pen_scale=1.0):
    n = len(counts)
    y = np.sqrt(counts)
    sig2 = max(float(np.var(np.diff(y))) / 2, 0.05)
    pen = 4 * pen_scale * sig2 * math.log(max(n, 2))
    inf = 1e18
    best = [[inf] * (n + 1) for _ in range(MAX_SEG + 1)]
    arg = [[0] * (n + 1) for _ in range(MAX_SEG + 1)]
    best[0][0] = 0.0
    cost = {}
    for k in range(1, MAX_SEG + 1):
        for j in range(MIN_SEG, n + 1):
            for i in range(0, j - MIN_SEG + 1):
                if best[k - 1][i] >= inf:
                    continue
                if (i, j) not in cost:
                    cost[(i, j)] = fit(y, i, j)
                v = best[k - 1][i] + cost[(i, j)] + pen
                if v < best[k][j]:
                    best[k][j], arg[k][j] = v, i
    kb = min(range(1, MAX_SEG + 1), key=lambda k: best[k][n])
    segs, j, k = [], n, kb
    while k > 0:
        i = arg[k][j]
        segs.append((i, j))
        j, k = i, k - 1
    return segs[::-1]


def slope_per_year(counts, i, j):
    x = np.arange(i, j)
    return float(np.polyfit(x, counts[i:j], 1)[0] * 12)


def pct(a, b):
    return f"{(b - a) / a * 100:+.0f}%" if a else "new"


def evidence(sel, k, l, last, name, cpuc, s2, prev_slope, slope):
    """Facts about the period that starts at the break (months k..l-1), grouped as expanded
    service, operating domain (ODD) and fleets. Everything is computed from data on this site."""
    n = l - k
    w = 3 if n >= 8 else max(1, n // 2)
    start_w, end_w = range(k, k + w), range(l - w, l)
    cnt = lambda rows_, rng: sum(1 for r in rows_ if r["ym"] in rng)
    in_seg = [r for r in sel if k <= r["ym"] < l]
    a_s, a_e, a_p = cnt(sel, start_w) / w, cnt(sel, end_w) / w, cnt(sel, range(k - 3, k)) / 3
    if slope < prev_slope:
        headline = f"Growth in monthly reports changed from {prev_slope:+.0f} to {slope:+.0f} a month each year. Reports averaged {a_p:.0f} a month in {label(k - 3)} to {label(k - 1)}, then {a_s:.0f} in {label(k)} to {label(k + w - 1)} and {a_e:.0f} in {label(l - w)} to {label(l - 1)}."
    else:
        headline = f"Growth in monthly reports changed from {prev_slope:+.0f} to {slope:+.0f} a month each year. Reports averaged {a_s:.0f} a month in {label(k)} to {label(k + w - 1)} and {a_e:.0f} in {label(l - w)} to {label(l - 1)}."
    service, odd, fleet = [], [], []
    seen = {(r["city"], r["state"]) for r in sel if r["ym"] < k and r["city"]}
    first = Counter((r["city"], r["state"]) for r in in_seg if r["city"] and r["state"] and (r["city"], r["state"]) not in seen)
    if first:
        top = ", ".join(f"{c}, {s}" for (c, s), _ in first.most_common(4))
        end_rows = [r for r in sel if r["ym"] in end_w]
        end_new = sum(1 for r in end_rows if (r["city"], r["state"]) in first)
        service.append(f"{len(first)} cities first appear in {'the' if name == 'All companies' else 'its'} reports during this period, led by {top}. By {label(l - 1)} they account for {end_new / max(len(end_rows), 1) * 100:.0f}% of monthly reports.")
    states_seen = {r["state"] for r in sel if r["ym"] < k}
    new_states = sorted({r["state"] for r in in_seg if r["state"] and r["state"] not in states_seen})
    if new_states:
        service.append(f"First reports from {', '.join(new_states)}.")
    pre = [r for r in sel if k - 6 <= r["ym"] < k]
    endr = [r for r in sel if r["ym"] in end_w]
    if len(pre) >= 15 and len(endr) >= 15:
        mix = lambda rows_: Counter(r["roadway_type"] or "Unknown" for r in rows_)
        mp, me = mix(pre), mix(endr)
        shifts = sorted(((me[t] / len(endr) - mp[t] / len(pre)) * 100, t) for t in set(mp) | set(me))
        moves = [(d, t) for d, t in (shifts[0], shifts[-1]) if abs(d) >= 3]
        if moves:
            odd.append("Where crashes happen shifted: " + "; ".join(f"{t} {d:+.0f} points" for d, t in sorted(moves, reverse=True)) + " of reports, comparing the six months before the period with its last three months (roadway labels depend partly on how each company classifies).")
    hw = lambda rows_: sum(1 for r in rows_ if r["roadway_type"].startswith("Highway")) / max(len(rows_), 1) * 100
    if len(pre) >= 20 and len(endr) >= 20 and abs(hw(endr) - hw(pre)) >= 1.0:
        odd.append(f"Highway or freeway crashes were {hw(pre):.1f}% of reports before the period and {hw(endr):.1f}% at its end.")
    outside = lambda rows_: sum(1 for r in rows_ if r["within_odd"].lower().startswith("no")) / max(len(rows_), 1) * 100
    if len(pre) >= 20 and len(endr) >= 20 and abs(outside(endr) - outside(pre)) >= 2:
        odd.append(f"Crashes reported as outside the system's operating domain were {outside(pre):.1f}% before the period and {outside(endr):.1f}% at its end.")
    models_seen = {r["model"] for r in sel if r["ym"] < k}
    newm = [(m, c) for m, c in Counter(r["model"] for r in in_seg if r["model"] not in models_seen).most_common(3) if c >= 3]
    if newm:
        fleet.append("New vehicle platforms in the reports: " + ", ".join(f"{m} ({c})" for m, c in newm) + ".")
    if name == "All companies":
        cs, ce = Counter(r["company"] for r in sel if r["ym"] in start_w), Counter(r["company"] for r in sel if r["ym"] in end_w)
        delta = sorted(((ce[c] - cs[c]) / w, c) for c in set(cs) | set(ce))
        gains = [(d, c) for d, c in delta[::-1][:3] if d >= 1]
        losses = [(d, c) for d, c in delta[:2] if d <= -1]
        if gains or losses:
            fleet.append("Fleets adding the most monthly reports: " + (", ".join(f"{c} ({d:+.0f})" for d, c in gains) or "none") + ("; fleets reporting fewer: " + ", ".join(f"{c} ({d:+.0f})" for d, c in losses) if losses else "") + f". Waymo is {sum(1 for r in sel if r['ym'] in end_w and r['company'] == 'Waymo') / max(cnt(sel, end_w), 1) * 100:.0f}% of reports at the end of the period.")
    if name == "Waymo" and cpuc:
        cs_ = [m for m in cpuc if m["ym"] in start_w]
        ce_ = [m for m in cpuc if m["ym"] in end_w]
        if len(cs_) == w and len(ce_) == w and sum(m["vmt"] for m in cs_) > 0:
            vs_, ve_ = np.mean([m["vmt"] for m in cs_]), np.mean([m["vmt"] for m in ce_])
            rs, re_ = sum(m["crashes"] for m in cs_) / sum(m["vmt"] for m in cs_) * 1e6, sum(m["crashes"] for m in ce_) / sum(m["vmt"] for m in ce_) * 1e6
            fleet.append(f"California driverless miles (CPUC), a measure of how much the fleet drives, went from {vs_ / 1e6:.1f} to {ve_ / 1e6:.1f} million a month ({pct(vs_, ve_)}) while California crashes per million miles went from {rs:.1f} to {re_:.1f}.")
    if name == "Waymo" and s2:
        q = [(v, m) for v, m in s2 if k <= v <= l]
        if len(q) >= 2:
            fleet.append("Waymo's published S2 mileage added " + ", ".join(f"{m / 1e6:.0f} million miles in the quarter to {label(v)}" for v, m in q) + ".")
    return {"headline": headline, "service": service, "odd": odd, "fleet": fleet}


def load_s2():
    """(month index, miles added) per Waymo S2 release after the first, summed over markets."""
    tot = Counter()
    for r in csv.DictReader(open(DATA / "waymo_s2_market_history.csv", encoding="utf-8")):
        tot[r["vintage_end"]] += float(r["incremental_miles_vs_prior_release"])
    keys = sorted(tot)[1:]
    return [(int(v[:4]) * 12 + int(v[4:]) - 1, tot[v]) for v in keys]


def load_cpuc():
    d = json.loads((DATA / "ca_waymo_sgo_rates.json").read_text())
    out = []
    for m in d["monthly"]:
        y, mo = map(int, m["month"].split("-"))
        out.append({"ym": y * 12 + mo - 1, "vmt": m["cpuc_driverless_vmt"], "crashes": m["sgo_ads_crashes"]})
    return out


def analyse(rows, name, sel, lo, last, cpuc, s2, events):
    counts = np.array([sum(1 for r in sel if r["ym"] == y) for y in range(lo, last + 1)], float)
    first = next((i for i, c in enumerate(counts) if c > 0), 0)
    counts_t = counts[first:]
    if len(counts_t) < 2 * MIN_SEG + 2:
        return None
    segs = [(i + first, j + first) for i, j in segment(counts_t, pen_scale=1.5 if len(sel) < 100 else 1.0)]
    out_segs = [{"start": label(lo + i), "end": label(lo + j - 1), "avg_per_month": round(float(counts[i:j].mean()), 1),
                 "growth_per_month_each_year": round(slope_per_year(counts, i, j), 1)} for i, j in segs]
    breaks = []
    for (i, j), (k, l) in zip(segs, segs[1:]):
        m_before, m_after = counts[max(i, k - 6):k].mean(), counts[k:min(l, k + 6)].mean()
        s_before, s_after = slope_per_year(counts, i, j), slope_per_year(counts, k, l)
        meaningful = abs(m_after - m_before) >= max(1.5, 0.3 * max(m_before, 0.5)) or abs(s_after - s_before) >= max(6, 0.4 * max(abs(s_before), 1))
        if not meaningful:
            continue
        bp = lo + k
        ev = [e for e in events if e["category"] != "rule" and (name in e["companies"] or (name == "All companies" and e["national"]))]
        near = [e for e in ev if bp - 2 <= int(e["month"][:4]) * 12 + int(e["month"][5:]) - 1 <= lo + l]
        facts = evidence(sel, bp, lo + l, last, name, cpuc, s2, s_before, s_after)
        breaks.append({"month": label(bp), "direction": "faster" if s_after > s_before else "slower", "period_end": label(lo + l - 1),
                       "growth_before": round(s_before, 1), "growth_after": round(s_after, 1),
                       "avg_before": round(float(m_before), 1), "avg_after": round(float(m_after), 1),
                       "headline": facts["headline"], "service": facts["service"], "odd": facts["odd"], "fleet": facts["fleet"],
                       "coincident_events": [{"category": e["category"], "month": e["month"], "title": e["title"], "text": e["text"], "source_label": e["source_label"], "source_url": e["source_url"]} for e in near]})
    return {"counts": [{"month": label(lo + i), "crashes": int(c)} for i, c in enumerate(counts)], "segments": out_segs, "breaks": breaks}


def main():
    rows, last = load()
    lo = min(r["ym"] for r in rows)
    cpuc = load_cpuc()
    s2 = load_s2()
    events = json.loads((DATA / "sgo_trend_events.json").read_text())["events"]
    totals = Counter(r["company"] for r in rows)
    result = {"dataset": "SGO crash-report trend shifts and the evidence around them", "complete_through": label(last),
              "method": "Monthly ADS crash counts by incident month are split into straight-line segments (square-root scale, penalised dynamic programming, minimum six months). A break is kept only if the average level or the growth rate changes materially. Evidence lists facts computed from this site's data; coincident public events are context, not proven causes.",
              "series": {}}
    for name, sel in [("All companies", rows)] + [(c, [r for r in rows if r["company"] == c]) for c, n in totals.most_common() if n >= MIN_CRASHES]:
        res = analyse(rows, name, sel, lo, last, cpuc, s2, events)
        if res:
            result["series"][name] = res
    (DATA / "sgo_shift_analysis.json").write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print({k: [b["month"] for b in v["breaks"]] for k, v in result["series"].items()})


if __name__ == "__main__":
    main()
