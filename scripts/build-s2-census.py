#!/usr/bin/env python3
"""Build Census-demographic context for Waymo S2 cells.

Inputs
------
- public/data/waymo_s2_latest.geojson
- public/data/waymo_s2_<vintage>.csv files
- U.S. Census Bureau 2024 TIGER/Line block-group shapefiles
- 2024 ACS 5-year detailed-table estimates at block-group geography

Outputs
-------
- public/data/waymo_s2_census_2024.json
- public/data/waymo_s2_bg_crosswalk_2024.csv
- public/data/waymo_s2_market_history.json

Method
------
Population/race counts are allocated from Census block groups to S2 cells by
area-weighted areal interpolation. Household-weighted block-group median
household income is provided as contextual income, not as an exact S2 median.
"""

from __future__ import annotations

import csv
import glob
import json
import math
import os
import re
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
CACHE = Path(os.environ.get("S2_CENSUS_CACHE", "/tmp/av-observatory-census"))
CACHE.mkdir(parents=True, exist_ok=True)

ACS_YEAR = 2024
ACS_DATASET = "acs/acs5"
TIGER_YEAR = 2024

COUNTIES = {
    ("Arizona", "Maricopa"): ("04", "013", "Phoenix"),
    ("California", "San Francisco"): ("06", "075", "San Francisco Bay Area"),
    ("California", "San Mateo"): ("06", "081", "San Francisco Bay Area"),
    ("California", "Santa Clara"): ("06", "085", "San Francisco Bay Area"),
    ("California", "Los Angeles"): ("06", "037", "Los Angeles"),
    ("Texas", "Travis"): ("48", "453", "Austin"),
    ("Georgia", "Fulton"): ("13", "121", "Atlanta"),
    ("Georgia", "DeKalb"): ("13", "089", "Atlanta"),
}

STATE_NAMES = {"04": "Arizona", "06": "California", "13": "Georgia", "48": "Texas"}

ACS_VARS = {
    "population": "B03002_001E",
    "white_nh": "B03002_003E",
    "black_nh": "B03002_004E",
    "aian_nh": "B03002_005E",
    "asian_nh": "B03002_006E",
    "nhpi_nh": "B03002_007E",
    "other_nh": "B03002_008E",
    "multiracial_nh": "B03002_009E",
    "hispanic": "B03002_012E",
    "households": "B11001_001E",
    "median_household_income": "B19013_001E",
}

CROSSWALK_FIELDS = [
    "s2_cell", "market", "state", "counties", "block_group_geoid",
    "overlap_area_m2", "block_group_area_m2", "block_group_area_share",
    "s2_area_m2", "s2_area_share", "acs_population",
    "allocated_population", "acs_households", "allocated_households",
    "acs_median_household_income",
]


def _safe_float(v):
    try:
        x = float(v)
        if not math.isfinite(x):
            return None
        return x
    except (TypeError, ValueError):
        return None


def _valid_income(v):
    x = _safe_float(v)
    if x is None or x < 0:
        return None
    return x


def download(url: str, path: Path):
    if path.exists() and path.stat().st_size > 0:
        return
    r = requests.get(url, timeout=180)
    r.raise_for_status()
    path.write_bytes(r.content)
    print(f"Downloaded {url} -> {path.name} ({path.stat().st_size:,} bytes)")


def fetch_acs_county(state_fips: str, county_fips: str) -> pd.DataFrame:
    out = CACHE / f"acs5_{ACS_YEAR}_{state_fips}_{county_fips}_blockgroups.json"
    if out.exists():
        payload = json.loads(out.read_text())
    else:
        url = f"https://api.census.gov/data/{ACS_YEAR}/{ACS_DATASET}"
        params = {
            "get": "NAME," + ",".join(ACS_VARS.values()),
            "for": "block group:*",
            "in": f"state:{state_fips} county:{county_fips} tract:*",
        }
        r = requests.get(url, params=params, timeout=120)
        r.raise_for_status()
        payload = r.json()
        out.write_text(json.dumps(payload))
        print(f"Fetched ACS block groups {state_fips}-{county_fips}: {len(payload)-1:,}")

    header, rows = payload[0], payload[1:]
    df = pd.DataFrame(rows, columns=header)
    df["GEOID"] = df["state"] + df["county"] + df["tract"] + df["block group"]
    reverse = {v: k for k, v in ACS_VARS.items()}
    for api_name, short in reverse.items():
        pass
    for short, api_name in ACS_VARS.items():
        df[short] = pd.to_numeric(df[api_name], errors="coerce")
    df.loc[df["median_household_income"] < 0, "median_household_income"] = pd.NA
    return df[["GEOID"] + list(ACS_VARS.keys())]


def load_census_block_groups() -> gpd.GeoDataFrame:
    frames = []
    needed_by_state = defaultdict(set)
    for (_, _), (sf, cf, _) in COUNTIES.items():
        needed_by_state[sf].add(cf)

    acs_frames = []
    for sf, counties in sorted(needed_by_state.items()):
        zip_path = CACHE / f"tl_{TIGER_YEAR}_{sf}_bg.zip"
        download(
            f"https://www2.census.gov/geo/tiger/TIGER{TIGER_YEAR}/BG/tl_{TIGER_YEAR}_{sf}_bg.zip",
            zip_path,
        )
        g = gpd.read_file(f"zip://{zip_path}")
        g = g[g["COUNTYFP"].isin(counties)].copy()
        keep = ["GEOID", "STATEFP", "COUNTYFP", "geometry"]
        frames.append(g[keep])
        for cf in sorted(counties):
            acs_frames.append(fetch_acs_county(sf, cf))

    geo = pd.concat(frames, ignore_index=True)
    geo = gpd.GeoDataFrame(geo, geometry="geometry", crs=frames[0].crs)
    acs = pd.concat(acs_frames, ignore_index=True)
    merged = geo.merge(acs, on="GEOID", how="left", validate="one_to_one")
    if merged["population"].isna().all():
        raise RuntimeError("ACS join failed: all population estimates are missing")
    return merged


def dedupe_latest_s2() -> gpd.GeoDataFrame:
    payload = json.loads((DATA / "waymo_s2_latest.geojson").read_text())
    grouped = {}
    for feature in payload["features"]:
        p = feature["properties"]
        cell = str(p["s2_cell"])
        state = str(p.get("state") or "")
        county = str(p.get("county") or "")
        key = (state, county)
        if key not in COUNTIES:
            continue
        market = COUNTIES[key][2]
        rec = grouped.setdefault(cell, {
            "s2_cell": cell,
            "market": market,
            "state": state,
            "counties": set(),
            "waymo_ro_miles": 0.0,
            "incremental_miles": 0.0,
            "vintage_end": str(p.get("vintage_end") or ""),
            "geometry": shape(feature["geometry"]),
        })
        if rec["market"] != market:
            raise RuntimeError(f"S2 cell {cell} crosses analytical markets: {rec['market']} vs {market}")
        rec["counties"].add(county)
        rec["waymo_ro_miles"] += float(p.get("waymo_ro_miles") or 0)
        rec["incremental_miles"] += float(p.get("incremental_miles") or 0)

    rows = []
    for rec in grouped.values():
        rec["counties"] = "|".join(sorted(rec["counties"]))
        rows.append(rec)
    gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
    if gdf.empty:
        raise RuntimeError("No latest S2 cells found")
    return gdf


def build_crosswalk(s2: gpd.GeoDataFrame, bg: gpd.GeoDataFrame):
    s2a = s2.to_crs("EPSG:5070").copy()
    bga = bg.to_crs("EPSG:5070").copy()
    s2a["s2_area_m2"] = s2a.geometry.area
    bga["block_group_area_m2"] = bga.geometry.area

    s2_keep = s2a[[
        "s2_cell", "market", "state", "counties", "waymo_ro_miles",
        "incremental_miles", "vintage_end", "s2_area_m2", "geometry"
    ]]
    bg_keep = bga[[
        "GEOID", "population", "white_nh", "black_nh", "aian_nh",
        "asian_nh", "nhpi_nh", "other_nh", "multiracial_nh", "hispanic",
        "households", "median_household_income", "block_group_area_m2", "geometry"
    ]]

    pieces = gpd.overlay(s2_keep, bg_keep, how="intersection", keep_geom_type=False)
    pieces = pieces[~pieces.geometry.is_empty].copy()
    pieces["overlap_area_m2"] = pieces.geometry.area
    pieces = pieces[pieces["overlap_area_m2"] > 0].copy()
    pieces["block_group_area_share"] = pieces["overlap_area_m2"] / pieces["block_group_area_m2"]
    pieces["s2_area_share"] = pieces["overlap_area_m2"] / pieces["s2_area_m2"]

    for field in [
        "population", "white_nh", "black_nh", "aian_nh", "asian_nh",
        "nhpi_nh", "other_nh", "multiracial_nh", "hispanic", "households",
    ]:
        pieces[f"allocated_{field}"] = pieces[field].fillna(0) * pieces["block_group_area_share"]

    cw_path = DATA / "waymo_s2_bg_crosswalk_2024.csv"
    with cw_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CROSSWALK_FIELDS)
        w.writeheader()
        for _, r in pieces.iterrows():
            w.writerow({
                "s2_cell": r["s2_cell"],
                "market": r["market"],
                "state": r["state"],
                "counties": r["counties"],
                "block_group_geoid": r["GEOID"],
                "overlap_area_m2": round(float(r["overlap_area_m2"]), 2),
                "block_group_area_m2": round(float(r["block_group_area_m2"]), 2),
                "block_group_area_share": round(float(r["block_group_area_share"]), 8),
                "s2_area_m2": round(float(r["s2_area_m2"]), 2),
                "s2_area_share": round(float(r["s2_area_share"]), 8),
                "acs_population": "" if pd.isna(r["population"]) else int(r["population"]),
                "allocated_population": round(float(r["allocated_population"]), 4),
                "acs_households": "" if pd.isna(r["households"]) else int(r["households"]),
                "allocated_households": round(float(r["allocated_households"]), 4),
                "acs_median_household_income": "" if pd.isna(r["median_household_income"]) else round(float(r["median_household_income"]), 2),
            })
    print(f"Wrote {cw_path.name}: {len(pieces):,} intersections")
    return pieces


def build_census_context(s2: gpd.GeoDataFrame, pieces: gpd.GeoDataFrame):
    by_cell = {}
    count_fields = [
        "population", "white_nh", "black_nh", "aian_nh", "asian_nh",
        "nhpi_nh", "other_nh", "multiracial_nh", "hispanic", "households",
    ]

    meta = s2.set_index("s2_cell").to_dict("index")
    for cell, g in pieces.groupby("s2_cell"):
        sums = {f: float(g[f"allocated_{f}"].sum()) for f in count_fields}
        income_mask = g["median_household_income"].notna() & (g["allocated_households"] > 0)
        income_denom = float(g.loc[income_mask, "allocated_households"].sum())
        income = None
        if income_denom > 0:
            income = float(
                (g.loc[income_mask, "median_household_income"] * g.loc[income_mask, "allocated_households"]).sum()
                / income_denom
            )
        pop = sums["population"]
        def pct(field):
            return round(100 * sums[field] / pop, 2) if pop > 0 else None

        m = meta[str(cell)]
        by_cell[str(cell)] = {
            "s2_cell": str(cell),
            "market": m["market"],
            "state": m["state"],
            "counties": m["counties"],
            "estimated_population": round(pop, 1),
            "estimated_households": round(sums["households"], 1),
            "household_weighted_bg_median_income": round(income, 0) if income is not None else None,
            "pct_white_non_hispanic": pct("white_nh"),
            "pct_black_non_hispanic": pct("black_nh"),
            "pct_asian_non_hispanic": pct("asian_nh"),
            "pct_aian_non_hispanic": pct("aian_nh"),
            "pct_nhpi_non_hispanic": pct("nhpi_nh"),
            "pct_other_non_hispanic": pct("other_nh"),
            "pct_multiracial_non_hispanic": pct("multiracial_nh"),
            "pct_hispanic": pct("hispanic"),
            "contributing_block_groups": int(g["GEOID"].nunique()),
            "census_overlap_share_of_s2_area": round(min(1.0, float(g["overlap_area_m2"].sum() / g["s2_area_m2"].iloc[0])), 4),
        }

    # Retain cells that overlap no land block-group polygon (usually water fringe).
    for _, r in s2.iterrows():
        cell = str(r["s2_cell"])
        if cell not in by_cell:
            by_cell[cell] = {
                "s2_cell": cell, "market": r["market"], "state": r["state"], "counties": r["counties"],
                "estimated_population": 0.0, "estimated_households": 0.0,
                "household_weighted_bg_median_income": None,
                "pct_white_non_hispanic": None, "pct_black_non_hispanic": None,
                "pct_asian_non_hispanic": None, "pct_aian_non_hispanic": None,
                "pct_nhpi_non_hispanic": None, "pct_other_non_hispanic": None,
                "pct_multiracial_non_hispanic": None, "pct_hispanic": None,
                "contributing_block_groups": 0, "census_overlap_share_of_s2_area": 0.0,
            }

    payload = {
        "dataset": "Waymo S2 Census demographic context",
        "census_vintage": "2024 ACS 5-year",
        "geometry_vintage": "2024 TIGER/Line block groups",
        "latest_waymo_vintage": str(s2["vintage_end"].max()),
        "methodology": {
            "population_and_race_ethnicity": "2024 ACS 5-year block-group counts allocated to S2 cells using intersection area / block-group area (areal interpolation).",
            "income": "Household-weighted average of contributing block groups' 2024 ACS median household income (B19013). This is contextual and is not an exact S2-cell median.",
            "important_limit": "These are estimated characteristics of residents in the published S2 footprint, not Waymo riders, crash victims, or causal exposure estimates. Areal interpolation assumes residents are distributed uniformly within each block group.",
        },
        "source_tables": {
            "race_ethnicity": "ACS B03002",
            "households": "ACS B11001",
            "median_household_income": "ACS B19013",
        },
        "cell_count": len(by_cell),
        "cells": by_cell,
    }
    path = DATA / "waymo_s2_census_2024.json"
    path.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"Wrote {path.name}: {len(by_cell):,} cells")


def market_for(state: str, county: str):
    x = COUNTIES.get((state, county))
    if x:
        return x[2]
    legacy = str(county or "").upper().replace(" ", "_")
    aliases = {
        "PHOENIX": "Phoenix",
        "SAN_FRANCISCO": "San Francisco Bay Area",
        "LOS_ANGELES": "Los Angeles",
        "AUSTIN": "Austin",
        "ATLANTA": "Atlanta",
    }
    return aliases.get(legacy)


def build_market_history():
    market_vintage = defaultdict(lambda: defaultdict(lambda: {"miles": 0.0, "cells": set()}))
    cell_vintage = defaultdict(lambda: defaultdict(float))

    pat = re.compile(r"waymo_s2_(\d{6})\.csv$")
    for path_s in glob.glob(str(DATA / "waymo_s2_*.csv")):
        path = Path(path_s)
        m = pat.search(path.name)
        if not m:
            continue
        vintage = m.group(1)
        with path.open(newline="") as f:
            for row in csv.DictReader(f):
                market = market_for(str(row.get("state") or ""), str(row.get("county") or ""))
                if not market:
                    continue
                cell = str(row["s2_cell"])
                miles = float(row.get("waymo_ro_miles") or 0)
                cell_vintage[(market, vintage)][cell] += miles

    for (market, vintage), cells in cell_vintage.items():
        market_vintage[market][vintage] = {
            "miles": sum(cells.values()),
            "cell_count": len(cells),
        }

    all_vintages = sorted({v for d in market_vintage.values() for v in d})
    markets = {}
    for market, data in sorted(market_vintage.items()):
        rows = []
        prior = 0.0
        for vintage in all_vintages:
            if vintage not in data:
                continue
            miles = float(data[vintage]["miles"])
            rows.append({
                "vintage_end": vintage,
                "cumulative_miles": round(miles, 1),
                "incremental_miles_vs_prior_release": round(miles - prior, 1),
                "cell_count": int(data[vintage]["cell_count"]),
            })
            prior = miles
        markets[market] = rows

    payload = {
        "dataset": "Waymo S2 mileage by analytical market and release",
        "market_definition": {
            "Phoenix": "Maricopa County, Arizona",
            "San Francisco Bay Area": "San Francisco, San Mateo, and Santa Clara counties, California",
            "Los Angeles": "Los Angeles County, California",
            "Austin": "Travis County, Texas",
            "Atlanta": "Fulton and DeKalb counties, Georgia",
        },
        "vintages": all_vintages,
        "markets": markets,
    }
    path = DATA / "waymo_s2_market_history.json"
    path.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {path.name}: {len(markets)} markets, {len(all_vintages)} vintages")


def main():
    s2 = dedupe_latest_s2()
    bg = load_census_block_groups()
    pieces = build_crosswalk(s2, bg)
    build_census_context(s2, pieces)
    build_market_history()


if __name__ == "__main__":
    main()
