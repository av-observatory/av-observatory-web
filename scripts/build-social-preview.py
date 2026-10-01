#!/usr/bin/env python3
import json, math, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
TOPO = ROOT / "public" / "maps" / "us-states-10m.json"
POLICY = ROOT / "public" / "data" / "policy_tracker.json"
OUT = ROOT / "public" / "social-preview-v2.png"

S = 2
W, H = 1200 * S, 627 * S
BG = "#f7f9fb"
NAVY = "#0b1d33"
BLUE = "#2b77bc"
MUTED = "#5f7386"
BORDER = "#d8e2ea"
WHITE = "#ffffff"

CATEGORIES = {
    "both": ("Legislation + Executive Order", "#5547a3"),
    "law": ("Legislation Only", "#2b77bc"),
    "order": ("Executive Order Only", "#db9b38"),
    "none": ("No AV Actions", "#e6e5e0"),
}

def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size=size * S)
    return ImageFont.load_default()

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
    # Lower 48 + D.C.
    if name == "Alaska":
        if lon > 0:
            lon -= 360
        x = 676 + (lon + 180) / 50 * 205
        y = 397 + (72 - lat) / 21 * 110
        return x * S, y * S
    if name == "Hawaii":
        x = 900 + (lon + 161) / 7 * 115
        y = 450 + (23 - lat) / 5 * 66
        return x, y
    x = 470 + (lon + 125) / 59 * 680
    y = 92 + (50 - lat) / 26 * 365
    return x, y

def main():
    topo = json.loads(TOPO.read_text())
    policy = json.loads(POLICY.read_text())
    state_by_name = {s["name"]: s for s in policy["states"]}

    img = Image.new("RGB", (W, H), BG)
    sc = lambda v: int(round(v * S))
    d = ImageDraw.Draw(img)

    # Left text block.
    d.text((sc(56), sc(72)), "A PUBLIC EVIDENCE PLATFORM", fill=BLUE, font=font(18, True))
    d.text((sc(56), sc(122)), "AV Observatory", fill=NAVY, font=font(60, True))
    d.multiline_text(
        (sc(56), sc(210)),
        "Autonomous vehicle policy,\nsafety, and operations in one place.",
        fill=MUTED,
        font=font(27),
        spacing=sc(9),
    )
    d.text((sc(56), sc(475)), "av-observatory.com", fill=MUTED, font=font(19))

    # Map card.
    card = tuple(sc(v) for v in (438, 42, 1155, 585))
    d.rounded_rectangle(card, radius=sc(22), fill=WHITE, outline=BORDER, width=sc(2))
    d.text((sc(470), sc(66)), "U.S. AV Policy Map", fill="#173f61", font=font(22, True))
    d.text((sc(470), sc(100)), "50 states + D.C. · legislation and executive-order history", fill=MUTED, font=font(15))

    for name, polygons in decode_topology(topo):
        state = state_by_name.get(name)
        if not state:
            continue
        if state.get("enacted_legislation"):
            key = "both" if state.get("executive_order_history") else "law"
        else:
            key = "order" if state.get("executive_order_history") else "none"
        fill = CATEGORIES[key][1]
        for poly in polygons:
            for idx, ring in enumerate(poly):
                pts = [project(name, lon, lat) for lon, lat in ring]
                if len(pts) < 3:
                    continue
                # Exterior polygons are what matter visually for the social card.
                if idx == 0:
                    d.polygon(pts, fill=fill)
                    d.line(pts + [pts[0]], fill=WHITE, width=sc(2))

    # Legend.
    x, y = sc(470), sc(526)
    for i, (key, (label, color)) in enumerate(CATEGORIES.items()):
        col = i % 2
        row = i // 2
        xx = x + col * sc(330)
        yy = y + row * sc(28)
        d.rounded_rectangle((xx, yy, xx+sc(13), yy+sc(13)), radius=sc(2), fill=color)
        d.text((xx+sc(21), yy-sc(3)), label, fill=MUTED, font=font(13))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)

if __name__ == "__main__":
    main()
