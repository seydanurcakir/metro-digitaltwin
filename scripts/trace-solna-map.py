"""
Traces the static context around Solna from a reference map screenshot into world-frame geometry.

    python3 scripts/trace-solna-map.py <screenshot.png> app/twin/solna-map.json

The screenshot (a Google Maps view of Solna/Frösunda at zoom 14.5, 1024 × 446 px) is not part of the
repository. It is georeferenced with a uniform scale of 0.2900 px/m (Web Mercator, zoom 14.5) and an
offset fitted to Strawberry Arena and Råstasjön (residual ≈ 13 px ≈ 45 m). Output coordinates are in
the twin's local metric frame (origin T-Centralen, +x east, +z south).

Classes are separated by the map's colours: water, parks/forest, commercial areas, motorways, local roads
and rail-yard tracks. Polygons are simplified (Douglas–Peucker); roads are skeletonised to centre lines.
"""
import json
import sys
import warnings

warnings.filterwarnings('ignore', category=FutureWarning)

import numpy as np
from PIL import Image
from skimage import measure, morphology

SRC, OUT = sys.argv[1], sys.argv[2]
# Georeference (see docstring): px = AX + S * x_world, py = AY + S * z_world
S = 0.29004047578628056
AX, AY = 1333.7701317133592, 1502.051877997903
ARENA_PX = (332.0, 183.0)  # projected position of the arena twin
ARENA_AXES_PX = (140 * S + 4, 115 * S + 4)  # half axes plus margin
ARENA_ROT = np.deg2rad(340 - 90)  # pitch axis bearing 340°, as an image angle

im = np.asarray(Image.open(SRC).convert("RGB")).astype(int)
H, W = im.shape[:2]
r, g, b = im[..., 0], im[..., 1], im[..., 2]


def world(px, py):
    return [round((px - AX) / S, 1), round((py - AY) / S, 1)]


water = (abs(r - 144) < 9) & (abs(g - 217) < 9) & (abs(b - 236) < 9)
green = (g > r + 22) & (g > b + 8) & ~water
motorway = (r < 178) & (b > r + 18) & ~water
commercial = (r > 238) & (g > 226) & (g < 243) & (b < 230) & (b > 195)
road = (r > 168) & (r < 236) & (b >= r + 3) & ~water & ~green & ~motorway
railyard = (abs(r - g) < 6) & (abs(b - r) < 7) & (r > 185) & (r < 226)


def clean(mask, close=2, min_px=60, holes=300):
    m = morphology.closing(mask, morphology.disk(close)) if close else mask
    m = morphology.remove_small_objects(m, min_px)
    return morphology.remove_small_holes(m, holes)


def polygons(mask, tol=1.2, min_area=80):
    padded = np.pad(mask, 1)
    out = []
    for c in measure.find_contours(padded.astype(float), 0.5):
        c = measure.approximate_polygon(c, tol) - 1  # (row, col), undo padding
        if len(c) < 4:
            continue
        xs, ys = c[:, 1], c[:, 0]
        area = 0.5 * abs(np.dot(xs, np.roll(ys, 1)) - np.dot(ys, np.roll(xs, 1)))
        if area < min_area:
            continue
        signed = 0.5 * (np.dot(xs, np.roll(ys, 1)) - np.dot(ys, np.roll(xs, 1)))
        if signed > 0:
            continue  # remaining holes (small) are dropped; outlines are drawn filled
        out.append({"area": round(area / S / S), "pts": [world(x, y) for x, y in zip(xs, ys)]})
    return out


NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def centrelines(mask, min_len=10, tol=0.9):
    """Skeleton → polylines between endpoints / junctions."""
    sk = morphology.skeletonize(mask)
    pts = set(zip(*np.nonzero(sk)))
    deg = {p: sum((p[0] + dy, p[1] + dx) in pts for dy, dx in NB) for p in pts}
    nodes = {p for p, d in deg.items() if d != 2}
    seen = set()
    lines = []

    def walk(a, b):
        path = [a, b]
        prev, cur = a, b
        while cur not in nodes:
            nxt = [(cur[0] + dy, cur[1] + dx) for dy, dx in NB if (cur[0] + dy, cur[1] + dx) in pts and (cur[0] + dy, cur[1] + dx) != prev]
            nxt = [n for n in nxt if (cur, n) not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            seen.add((prev, cur)); seen.add((cur, prev))
            path.append(cur)
        return path

    for n in nodes:
        for dy, dx in NB:
            m = (n[0] + dy, n[1] + dx)
            if m in pts and (n, m) not in seen:
                seen.add((n, m)); seen.add((m, n))
                lines.append(walk(n, m))
    out = []
    for line in lines:
        if len(line) < min_len:
            continue
        arr = measure.approximate_polygon(np.array(line, float), tol)
        out.append([world(x, y) for y, x in arr])
    return out


# Arena footprint in the image (the arena twin is drawn separately)
yy, xx = np.mgrid[0:H, 0:W]
dx, dy = xx - ARENA_PX[0], yy - ARENA_PX[1]
ca, sa = np.cos(ARENA_ROT), np.sin(ARENA_ROT)
u, v = dx * ca + dy * sa, -dx * sa + dy * ca
arena = (u / ARENA_AXES_PX[0]) ** 2 + (v / ARENA_AXES_PX[1]) ** 2 <= 1

# Map labels leave holes in water and parks: fill holes up to label size
water_m = clean(water, 2, 80, 4000)
green_m = clean(green, 5, 90, 2500) & ~water_m
# Motorways: keep only long, ribbon-like components (drops POI icons and label text in the same blue)
mw = clean(motorway, 1, 40, 30)
lab = measure.label(mw)
keep = np.zeros_like(mw)
for p in measure.regionprops(lab):
    h_, w_ = p.bbox[2] - p.bbox[0], p.bbox[3] - p.bbox[1]
    comp = lab == p.label
    width = p.area / max(1, morphology.skeletonize(comp).sum())  # mean stroke width (px)
    ring = morphology.dilation(comp, morphology.disk(3)) & ~comp
    on_water = (ring & water_m).sum() / max(1, ring.sum())  # labels drawn over lakes
    if p.area >= 120 and max(h_, w_) >= 40 and p.area / (h_ * w_) < 0.6 and width >= 4 and on_water < 0.25:
        keep |= comp
motorway_m = keep
commercial_m = clean(commercial, 3, 150, 400)
# Mall of Scandinavia: the commercial block south of y ≈ 205 px, minus the arena
mall_m = commercial_m & (yy > 205) & (yy < 306) & (xx > 288) & ~arena
mall_m = morphology.closing(morphology.opening(mall_m, morphology.disk(2)), morphology.disk(7))
lab = measure.label(mall_m)
mall_m = lab == (np.argmax(np.bincount(lab.ravel())[1:]) + 1)
road_m = morphology.remove_small_objects(road & ~commercial_m, 25)
yard_m = morphology.remove_small_objects(railyard & ~commercial_m & ~road_m, 20)

data = {
    "source": "Traced from the user's reference map screenshot (Google Maps, zoom 14.5); geometry approximate.",
    "extent": [world(0, 0), world(W, H)],
    "water": polygons(water_m, 1.0, 40),
    "green": polygons(green_m, 1.2, 90),
    "commercial": polygons(commercial_m & ~arena & ~mall_m, 1.2, 120),
    "mall": polygons(mall_m, 1.0, 400),
    "motorway": polygons(motorway_m, 0.8, 30),
    "roads": centrelines(road_m, 8, 0.9),
    "railyard": centrelines(yard_m, 10, 0.9),
}
# Obstacle raster for placing representative blocks: free = plain background, away from features
busy = water_m | green_m | motorway_m | commercial_m | arena | morphology.dilation(road_m | yard_m, morphology.disk(1))
free = ~morphology.dilation(busy, morphology.disk(1))
step = 2  # store at half resolution, row strings of 0/1
data["free"] = {"step": step, "rows": ["".join("1" if free[y, x] else "0" for x in range(0, W, step)) for y in range(0, H, step)],
                "ax": AX, "ay": AY, "s": S}
json.dump(data, open(OUT, "w"), separators=(",", ":"))
for k in ("water", "green", "commercial", "mall", "motorway"):
    print(k, len(data[k]), "polygons", sum(p["area"] for p in data[k]), "m²")
print("roads", len(data["roads"]), "lines; railyard", len(data["railyard"]))
