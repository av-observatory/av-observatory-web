#!/usr/bin/env python3
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TOPO = ROOT / "public" / "maps" / "us-states-10m.json"
POLICY = ROOT / "public" / "data" / "policy_tracker.json"
OUT = ROOT / "public" / "social-preview-v4.png"

S = 2
W, H = 1200 * S, 627 * S
BG = "#f7f9fb"
WHITE = "#ffffff"

CATEGORIES = {
    "both": "#5547a3",
    "law": "#2b77bc",
    "order": "#db9b38",
    "none": "#e6e5e0",
}

def decode_topology(topo):
    scale = topo["transform"]["scale"]
    translate = topo["transform"]["translate"]
    cache = {}

    def arc(index):
        reverse = index < 0
        idx = ~index if reverse else index
        if idx not in cache:
            x = y = 0
            pts = []
            for dx, dy in topo["arcs"][idx]:
                x += dx
                y += dy
                pts.append((x * scale[0] + translate[0], y * scale[1] + translate[1]))
            cache[idx] = pts
        pts = cache[idx]
        return list(reversed(pts)) if reverse else pts

    def ring(indexes):
        pts = []
        for i, a in enumerate(indexes):
            seg = arc(a)
            pts.extend(seg if i == 0 else seg[1:])
        return pts

    states = []
    for geom in topo["objects"]["states"]["geometries"]:
        polygons = [geom["arcs"]] if geom["type"] == "Polygon" else geom["arcs"]
        rings = []
        for poly in polygons:
            rings.append([ring(r) for r in poly])
        states.append((geom["properties"]["name"], rings))
    return states

def project(name, lon, lat):
    # Large map-only composition, with Alaska and Hawaii inset.
    if name == "Alaska":
        if lon > 0:
            lon -= 360
        x = 150 + (lon + 180) / 50 * 390
        y = 420 + (72 - lat) / 21 * 170
        return x * S, y * S
    if name == "Hawaii":
        x = 580 + (lon + 161) / 7 * 220
        y = 505 + (23 - lat) / 5 * 105
        return x * S, y * S

    # Lower 48 + D.C. fill nearly the whole canvas.
    x = 65 + (lon + 125) / 59 * 1070
    y = 45 + (50 - lat) / 26 * 510
    return x * S, y * S

def main():
    topo = json.loads(TOPO.read_text())
    policy = json.loads(POLICY.read_text())
    state_by_name = {s["name"]: s for s in policy["states"]}

    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    for name, polygons in decode_topology(topo):
        state = state_by_name.get(name)
        if not state:
            continue
        if state.get("enacted_legislation"):
            key = "both" if state.get("executive_order_history") else "law"
        else:
            key = "order" if state.get("executive_order_history") else "none"
        fill = CATEGORIES[key]

        for poly in polygons:
            for idx, ring in enumerate(poly):
                if idx != 0:
                    continue
                pts = [project(name, lon, lat) for lon, lat in ring]
                if len(pts) < 3:
                    continue
                d.polygon(pts, fill=fill)
                d.line(pts + [pts[0]], fill=WHITE, width=4)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)

if __name__ == "__main__":
    main()
