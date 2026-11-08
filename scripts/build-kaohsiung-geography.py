#!/usr/bin/env python3
"""Build the canonical 38-district Kaohsiung geography used by the miniature world.

Source: 內政部國土測繪中心, 鄉(鎮、市、區)界線(TWD97經緯度), dataset 7441,
TOWN_MOI_1140318 (modified 2025-12-16), Government Open Data License v1.
Run with pyshp on PYTHONPATH, e.g.:
  PYTHONPATH=/tmp/kaohsiung-pylibs python3 scripts/build-kaohsiung-geography.py
The generated file is committed so the static site build does not need Python.
"""
from __future__ import annotations

import collections
import json
import math
import importlib
import os

shapefile = importlib.import_module("shapefile")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data/geography/source/tw-town-1140318/TOWN_MOI_1140318.shp")
OUT = os.path.join(ROOT, "src/data/geography/kaohsiung-districts.json")
README = os.path.join(ROOT, "data/geography/README.md")

LAT0 = 22.70
LON0 = 120.30
KM_PER_DEG_LAT = 110.57
KM_PER_DEG_LON = 111.32 * math.cos(math.radians(LAT0))
RDP_EPSILON = 0.0002

TERRAIN = {
    "桃源": "mountain", "那瑪夏": "mountain", "茂林": "mountain",
    "甲仙": "mountain", "六龜": "mountain", "杉林": "mountain",
    "內門": "hill", "旗山": "hill", "美濃": "hill", "田寮": "hill",
    "阿蓮": "hill", "燕巢": "hill", "大樹": "hill", "大社": "hill",
    "鳥松": "hill", "仁武": "hill",
    "茄萣": "coastal", "湖內": "coastal", "路竹": "coastal",
    "永安": "coastal", "彌陀": "coastal", "梓官": "coastal",
    "岡山": "coastal", "橋頭": "coastal", "楠梓": "urban",
    "左營": "urban", "鼓山": "coastal", "鹽埕": "coastal",
    "旗津": "coastal", "前金": "urban", "新興": "urban",
    "苓雅": "urban", "前鎮": "coastal", "三民": "urban",
    "鳳山": "urban", "大寮": "urban", "林園": "coastal",
    "小港": "coastal",
}


def signed_ring_area(ring):
    total = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        total += x1 * y2 - x2 * y1
    return total / 2


def ring_area(ring):
    return abs(signed_ring_area(ring))


def rdp(points, epsilon):
    """Simplify a closed ring with Ramer-Douglas-Peucker."""
    if len(points) < 5:
        return points
    pts = points[:-1]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        x1, y1 = pts[a]
        x2, y2 = pts[b]
        dx, dy = x2 - x1, y2 - y1
        den = math.hypot(dx, dy)
        best = -1.0
        best_index = None
        for index in range(a + 1, b):
            x, y = pts[index]
            distance = (
                math.hypot(x - x1, y - y1)
                if den == 0
                else abs(dx * (y - y1) - dy * (x - x1)) / den
            )
            if distance > best:
                best = distance
                best_index = index
        if best > epsilon and best_index is not None:
            keep[best_index] = True
            stack.append((a, best_index))
            stack.append((best_index, b))
    simplified = [pts[index] for index in range(len(pts)) if keep[index]]
    simplified.append(simplified[0])
    return simplified


def point_in_ring(x, y, ring):
    inside = False
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        if (y1 > y) != (y2 > y):
            crossing = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < crossing:
                inside = not inside
    return inside


def point_in_polygons(x, y, polygons):
    return any(point_in_ring(x, y, ring) for ring in polygons)


def inside_point(rings, centroid):
    if point_in_ring(centroid[0], centroid[1], rings[0]):
        return centroid
    xs = [p[0] for ring in rings for p in ring]
    ys = [p[1] for ring in rings for p in ring]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    best = None
    best_clearance = -1.0
    for ix in range(1, 30):
        for iy in range(1, 30):
            x = minx + (maxx - minx) * ix / 30
            y = miny + (maxy - miny) * iy / 30
            if not point_in_polygons(x, y, rings):
                continue
            clearance = min(
                math.hypot(x - px, y - py)
                for ring in rings
                for px, py in ring
            )
            if clearance > best_clearance:
                best_clearance = clearance
                best = [x, y]
    return best or list(centroid)


def polygon_centroid(ring):
    area = signed_ring_area(ring)
    if abs(area) < 1e-14:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return [sum(xs) / len(xs), sum(ys) / len(ys)]
    cx = cy = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        cross = x1 * y2 - x2 * y1
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    return [cx / (6 * area), cy / (6 * area)]


def area_km2(polygons):
    total = 0.0
    for ring in polygons:
        projected = [
            ((x - LON0) * KM_PER_DEG_LON, -(y - LAT0) * KM_PER_DEG_LAT)
            for x, y in ring
        ]
        total += abs(signed_ring_area(projected))
    return round(total, 4)


def main():
    reader = shapefile.Reader(SRC, encoding="utf-8")
    records = []
    for index in range(reader.numRecords):
        record = reader.record(index).as_dict()
        if record.get("COUNTYNAME") != "高雄市":
            continue
        shape = reader.shape(index)
        parts = list(shape.parts) + [len(shape.points)]
        rings = []
        for part in range(len(parts) - 1):
            points = [
                (float(x), float(y))
                for x, y in shape.points[parts[part] : parts[part + 1]]
            ]
            if len(points) < 4:
                continue
            if points[0] != points[-1]:
                points.append(points[0])
            rings.append(points)
        records.append((record, rings))

    districts = []
    remote_territories = []
    for record, rings in sorted(records, key=lambda item: item[0]["TOWNID"]):
        short_name = record["TOWNNAME"].replace("區", "")
        main_rings = rings
        remote = []
        if record["TOWNNAME"] == "旗津區":
            main_rings = [max(rings, key=ring_area)]
            for index, ring in enumerate(rings):
                if ring is main_rings[0]:
                    continue
                xs = [p[0] for p in ring]
                ys = [p[1] for p in ring]
                centroid = polygon_centroid(ring)
                remote.append({
                    "name": "離島 " + str(index + 1),
                    "bbox": [round(min(xs), 6), round(min(ys), 6), round(max(xs), 6), round(max(ys), 6)],
                    "centroid": [round(centroid[0], 6), round(centroid[1], 6)],
                    "areaKm2": area_km2([ring]),
                })
            remote_territories.extend(
                {**item, "districtId": record["TOWNID"], "districtName": record["TOWNNAME"]}
                for item in remote
            )

        polygons = []
        for ring in main_rings:
            simplified = rdp(ring, RDP_EPSILON)
            polygons.append([[round(x, 6), round(y, 6)] for x, y in simplified])

        largest = max(main_rings, key=ring_area)
        centroid = polygon_centroid(largest)
        label_point = inside_point(main_rings, centroid)
        all_points = [p for ring in main_rings for p in ring]
        xs = [p[0] for p in all_points]
        ys = [p[1] for p in all_points]

        districts.append({
            "id": record["TOWNID"],
            "code": record["TOWNCODE"],
            "name": record["TOWNNAME"],
            "shortName": short_name,
            "nameEn": record.get("TOWNENG", "").replace(" District", ""),
            "slug": record.get("TOWNENG", "").replace(" District", "").lower().replace("'", ""),
            "bbox": [round(min(xs), 6), round(min(ys), 6), round(max(xs), 6), round(max(ys), 6)],
            "centroid": [round(label_point[0], 6), round(label_point[1], 6)],
            "labelPoint": [round(label_point[0], 6), round(label_point[1], 6)],
            "areaKm2": area_km2(main_rings),
            "terrain": TERRAIN.get(short_name, "urban"),
            "polygons": polygons,
            "remoteCount": len(remote),
        })

    shared = {}
    for record, rings in records:
        points = set()
        for ring in rings:
            points.update((round(x, 7), round(y, 7)) for x, y in ring)
        shared[record["TOWNNAME"].replace("區", "")] = points
    names = sorted(shared)
    adjacency = collections.defaultdict(set)
    gates = []
    for i, first in enumerate(names):
        for second in names[i + 1 :]:
            common = shared[first] & shared[second]
            if len(common) < 2:
                continue
            adjacency[first].add(second)
            adjacency[second].add(first)
            ordered = sorted(common)
            p1 = ordered[0]
            p2 = max(ordered, key=lambda p: (p[0] - p1[0]) ** 2 + (p[1] - p1[1]) ** 2)
            gates.append({
                "a": first,
                "b": second,
                "point": [round((p1[0] + p2[0]) / 2, 6), round((p1[1] + p2[1]) / 2, 6)],
            })

    output = {
        "metadata": {
            "dataset": "高雄市 38 行政區邊界（簡化展示幾何）",
            "source": "內政部國土測繪中心，鄉(鎮、市、區)界線(TWD97經緯度)，TOWN_MOI_1140318",
            "sourceUrl": "https://data.gov.tw/dataset/7441",
            "sourceModified": "2025-12-16",
            "retrieved": "2026-11-08",
            "license": "政府資料開放授權條款第1版",
            "licenseUrl": "https://data.gov.tw/license",
            "crs": "TWD97[2020] 經緯度，依 WGS84 近似使用；差異小於 1 公尺",
            "projection": "以 120.30E, 22.70N 為原點的局部等距圓柱投影；1 世界單位 = 1 公里",
            "simplification": "RDP epsilon=0.0002 度（約 22 公尺）",
            "caveat": "邊界經簡化，僅供互動地圖與藝術化模型定位，不可作為測量、門牌或選舉資格依據。",
        },
        "districts": districts,
        "adjacency": {name: sorted(neighbours) for name, neighbours in adjacency.items()},
        "gates": gates,
        "remoteTerritories": remote_territories,
    }

    try:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w", encoding="utf-8") as handle:
            json.dump(output, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")

        with open(README, "w", encoding="utf-8") as handle:
            handle.write(
                "# Kaohsiung administrative geography\n\n"
                "- Source: 內政部國土測繪中心, 鄉(鎮、市、區)界線(TWD97經緯度), "
                "TOWN_MOI_1140318, via https://data.gov.tw/dataset/7441.\n"
                "- License: 政府資料開放授權條款第1版 (https://data.gov.tw/license).\n"
                "- Snapshot: modified 2025-12-16, retrieved 2026-11-08.\n"
                "- Generated display geometry: src/data/geography/kaohsiung-districts.json.\n"
                "- Rebuild: PYTHONPATH=/tmp/kaohsiung-pylibs python3 scripts/build-kaohsiung-geography.py "
                "(requires pyshp; the committed JSON is used by the app).\n"
                "- Simplification: RDP epsilon 0.0002 degrees (~22 m). Boundaries are for "
                "interactive display only, not surveying or legal eligibility.\n"
                "- Qijin remote islands (Dongsha/Pratas and Taiping) are retained as explicit "
                "remote territory records and excluded from the main citywide camera bounds.\n"
            )
    except OSError as error:
        raise SystemExit("Could not write geography output: " + str(error)) from error

    print("wrote " + OUT + " (" + str(os.path.getsize(OUT)) + " bytes), " + str(len(districts)) + " districts, " + str(len(gates)) + " gates")


if __name__ == "__main__":
    main()
