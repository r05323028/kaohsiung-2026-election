# pyright: reportMissingImports=false, reportMissingModuleSource=false
"""Field-driven sculpted chibi head-kit generator.

`head_kit.py` reshapes the imported base head with a handful of
global bumps and then bolts primitive props onto it. That keeps the silhouette
inside the site's art direction but is too coarse to carry a recognisable face:
the jaw stays round, the eyes stay protruding balls, and hair/glasses are placed
by guessed coordinates instead of sampled from the surface.

This generator keeps the same contract (same params JSON, same HeadPivot-local
authoring space, same GLB export settings, a material named exactly "Skin") but
re-authors the head as a sculpture:

1. the imported shell is deformed by additive anatomical displacement fields
   (jaw band, chin, cheekbones, jowl mass, eye sockets, brow ridge, temples,
   muzzle, forehead slope);
2. every added feature is *sampled from the deformed surface* through a BVH, so
   nothing floats, nothing cuts through the face, and glasses follow the brow;
3. hair is a shell grown from the skull itself along a hairline curve, so it can
   never cover the eyes again.

Run through scripts/avatar/likeness/generate.ts (modelProfile: "sculpted").

    blender -b --factory-startup -P scripts/avatar/blender/head_sculpt.py -- \
        --params tmp/avatar-pipeline/params/lai-rui-long-2026.json \
        --out data/avatars/likeness/kits/lai-rui-long-2026-head.glb
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))

import head_kit  # noqa: E402  (needs the sys.path mutation above)

TAU = math.tau
HEAD_Z_TOP = 1.017
DEBUG = bool(os.environ.get("HEAD_SCULPT_DEBUG"))


def dbg(*parts) -> None:
    if DEBUG:
        print("[sculpt]", *parts)


# ------------------------------------------------------------------- math


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return low if value < low else high if value > high else value


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def sstep(edge0: float, edge1: float, x: float) -> float:
    """Smoothstep that also accepts a reversed (edge0 > edge1) range."""
    if edge0 == edge1:
        return 0.0 if x < edge0 else 1.0
    t = clamp((x - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def gauss(x: float, center: float, sigma: float) -> float:
    d = (x - center) / sigma
    return math.exp(-0.5 * d * d)


def table_lookup(table: list[tuple[float, float]], x: float) -> float:
    """Piecewise-linear interpolation over a sorted (x, y) table."""
    if x <= table[0][0]:
        return table[0][1]
    if x >= table[-1][0]:
        return table[-1][1]
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x0 <= x <= x1:
            return lerp(y0, y1, (x - x0) / (x1 - x0))
    return table[-1][1]


# ---------------------------------------------------------------- styling


def num(params: dict, key: str, fallback: float) -> float:
    value = params.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return fallback
    return float(value)


class Style:
    """Numeric style derived from the appearance parameter set."""

    def __init__(self, params: dict) -> None:
        self.face_shape = str(params.get("faceShape", "oval"))
        self.face_width = num(params, "faceWidth", 0.5)
        self.face_length = num(params, "faceLength", 0.5)
        self.jaw = num(params, "jawWidth", 0.5)
        self.chin_round = num(params, "chinRoundness", 0.6)
        self.cheek = num(params, "cheekFullness", 0.5)

        # Eye geometry in HeadPivot units (head is 1.028 wide, 1.017 tall).
        self.eye_cx = 0.150 + 0.055 * num(params, "eyeSpacing", 0.5)
        self.eye_cz = 0.402
        self.eye_hw = 0.054 + 0.042 * num(params, "eyeSize", 0.55)
        self.eye_hh = 0.030 + 0.018 * num(params, "eyeHeight", 0.48)
        self.eye_tilt = num(params, "eyeTilt", 0.0) * 10.0  # degrees
        self.iris_r = 0.028 + 0.012 * num(params, "eyeSize", 0.55)

        self.brow_hh = 0.0100 + 0.0100 * num(params, "eyebrowThickness", 0.4)
        self.brow_angle = num(params, "eyebrowAngle", 0.0)

        self.nose_w = 0.052 + 0.055 * num(params, "noseWidth", 0.4)
        self.nose_len = 0.020 + 0.026 * num(params, "noseLength", 0.5)
        self.nose_root_z = 0.462
        self.nose_tip_z = 0.352

        self.mouth_hw = 0.055 + 0.085 * num(params, "mouthWidth", 0.5)
        self.mouth_cz = 0.226
        self.mouth_full = num(params, "mouthFullness", 0.5)

        self.hair_style = str(params.get("hairStyle", "short-crop"))
        self.hair_volume = num(params, "hairVolume", 0.5)

        glasses = params.get("glasses") or {}
        self.glasses = bool(glasses.get("enabled"))
        self.glasses_style = str(glasses.get("style", "none"))
        self.frame_t = float(glasses.get("frameThickness", 0.3) or 0.3)

        # Per-face-shape bias applied to the displacement fields.
        bias = {
            "oval": (0.85, 1.0, 0.95, 1.0, 1.0),
            "round": (0.70, 0.85, 1.05, 1.05, 1.0),
            "square": (1.12, 1.10, 0.88, 1.00, 0.96),
            "heart": (0.80, 1.10, 1.05, 0.95, 1.0),
            "oblong": (0.95, 0.95, 0.90, 0.95, 1.10),
            "diamond": (0.75, 1.05, 1.10, 1.0, 1.0),
        }.get(self.face_shape, (1.0, 1.0, 1.0, 1.0, 1.0))
        self.b_jaw, self.b_chin, self.b_cheek, self.b_jowl, self.b_len = bias


# ------------------------------------------------------------- surface access


class Surface:
    """Ray/sampling helper over the deformed head shell."""

    def __init__(self, obj: bpy.types.Object) -> None:
        mesh = obj.data
        verts = [v.co.copy() for v in mesh.vertices]
        faces = [tuple(poly.vertices) for poly in mesh.polygons]
        self.bvh = BVHTree.FromPolygons(verts, faces)

    def hit(self, x: float, z: float, start_y: float = -2.0):
        """Cast from in front of the face toward +Y onto the shell."""
        location, normal, _index, _dist = self.bvh.ray_cast(
            Vector((x, start_y, z)), Vector((0.0, 1.0, 0.0))
        )
        return location, normal

    def cast(self, origin: Vector, direction: Vector):
        location, normal, _index, _dist = self.bvh.ray_cast(origin, direction)
        return location, normal

    def front_y(self, x: float, z: float, fallback: float = -0.40) -> float:
        location, _normal = self.hit(x, z)
        return location.y if location is not None else fallback

    def front_point(self, x: float, z: float) -> Vector:
        location, normal = self.hit(x, z)
        if location is None:
            return Vector((x, -0.40, z))
        return location


# ------------------------------------------------------------------ meshes


def new_object(name: str, verts, faces, material: bpy.types.Material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], [list(f) for f in faces])
    mesh.validate(verbose=False)
    mesh.update()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def recalc_normals(obj: bpy.types.Object) -> None:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def grid_faces(rows: int, cols: int, closed_cols: bool = False):
    """Quad indices for a rows x cols vertex grid stored row-major."""
    faces = []
    span = cols if closed_cols else cols - 1
    for row in range(rows - 1):
        for col in range(span):
            a = row * cols + col
            b = row * cols + (col + 1) % cols
            c = (row + 1) * cols + (col + 1) % cols
            d = (row + 1) * cols + col
            faces.append((a, b, c, d))
    return faces


def ribbon(stations, material: bpy.types.Material, name: str, closed: bool = False):
    """Sweep a quad strip through stations of (left, right) vertex pairs."""
    verts = []
    for left, right in stations:
        verts.append(left)
        verts.append(right)
    faces = []
    for index in range(len(stations) - 1):
        a = index * 2
        faces.append((a, a + 2, a + 3, a + 1))
    obj = new_object(name, verts, faces, material)
    recalc_normals(obj)
    return obj


def tube(path, radius_of, material: bpy.types.Material, name: str, sides: int = 4,
         up: Vector | None = None):
    """Sweep a small polygonal cross-section along a 3D path."""
    up = up or Vector((0.0, 0.0, 1.0))
    verts = []
    for index, point in enumerate(path):
        if index == 0:
            tangent = (path[1] - path[0])
        elif index == len(path) - 1:
            tangent = (path[-1] - path[-2])
        else:
            tangent = (path[index + 1] - path[index - 1])
        tangent.normalize()
        side = tangent.cross(up)
        if side.length < 1e-6:
            side = tangent.cross(Vector((0.0, 1.0, 0.0)))
        side.normalize()
        normal = side.cross(tangent).normalized()
        radius = radius_of(index, point)
        for step in range(sides):
            angle = TAU * step / sides + math.pi / sides
            verts.append(
                point + side * (math.cos(angle) * radius) + normal * (math.sin(angle) * radius)
            )
    faces = grid_faces(len(path), sides, closed_cols=True)
    # radial caps keep the tube closed at both ends
    base = len(verts)
    verts.append(path[0] - (path[1] - path[0]).normalized() * radius_of(0, path[0]))
    verts.append(path[-1] + (path[-1] - path[-2]).normalized() * radius_of(len(path) - 1, path[-1]))
    for step in range(sides):
        nxt = (step + 1) % sides
        faces.append((step, nxt, base))
        last = (len(path) - 1) * sides
        faces.append((last + nxt, last + step, base + 1))
    obj = new_object(name, verts, faces, material)
    recalc_normals(obj)
    return obj


# ------------------------------------------------------------- deformation


def sculpt_shell(obj: bpy.types.Object, st: Style) -> None:
    """Apply the additive anatomical fields to the imported head shell."""
    mesh = obj.data
    eye_cx = st.eye_cx
    eye_cz = st.eye_cz
    jaw_gain = (0.030 + 0.090 * st.jaw) * st.b_jaw
    chin_push = (0.012 + 0.026 * (1.0 - st.chin_round)) * st.b_chin

    for vert in mesh.vertices:
        x, y, z = vert.co
        nz = z / HEAD_Z_TOP
        ax = abs(x) / 0.514
        front = sstep(0.12, -0.20, y)

        # 1. jaw band widening: the widest point of a square face sits low.
        x *= 1.0 + jaw_gain * gauss(nz, 0.225, 0.130)
        gonion = gauss(nz, 0.245, 0.095) * gauss(ax, 0.88, 0.20) * st.b_jaw
        if x:
            x += math.copysign(0.050 * gonion, x)

        # 2. chin: forward mass, wide rather than pointed.
        chin = gauss(nz, 0.135, 0.080) * gauss(x / 0.514, 0.0, 0.34) * front
        y -= chin_push * chin

        # 3. cheekbones: lateral + slight forward.
        cheek_z = gauss(nz, 0.415, 0.070)
        cheek_x = gauss(ax, 0.68, 0.17)
        cheek = cheek_z * cheek_x * front * (0.55 + 0.75 * st.cheek) * st.b_cheek
        x += math.copysign(0.019 * cheek, x) if x else 0.0
        y -= 0.009 * cheek

        # 4. jowl / lower-cheek mass: the trait that makes a face read as mature.
        jowl = (
            gauss(nz, 0.280, 0.075)
            * gauss(ax, 0.62, 0.19)
            * front
            * (0.45 + 0.85 * st.cheek)
            * st.b_jowl
        )
        x += math.copysign(0.016 * jowl, x) if x else 0.0
        y -= 0.007 * jowl

        # 5. eye sockets: recess so the eyeball has somewhere to sit.
        socket = 0.0
        for sign in (-1.0, 1.0):
            socket += math.exp(
                -0.5
                * (
                    ((x - sign * eye_cx) / (st.eye_hw * 1.55)) ** 2
                    + ((z - eye_cz) / (st.eye_hh * 2.10)) ** 2
                )
            )
        y += 0.011 * socket * front

        # 6. brow ridge.
        brow = gauss(nz, 0.545, 0.052) * gauss(ax, 0.42, 0.26) * front
        y -= 0.008 * brow

        # 7. temple hollow (keeps the hairline from looking inflated).
        temple = gauss(nz, 0.545, 0.080) * gauss(ax, 0.93, 0.085)
        if x:
            x -= math.copysign(0.013 * temple, x)

        # 8. muzzle: the mouth plate sits on a shallow forward mass.
        muzzle = gauss(nz, 0.245, 0.055) * gauss(x / 0.514, 0.0, 0.45) * front
        y -= 0.007 * muzzle

        # 9. forehead slope.
        y += 0.010 * sstep(0.55, 0.82, nz) * front

        # 10. cranium: taper the crown instead of leaving a perfect dome.
        x *= 1.0 - 0.030 * sstep(0.80, 1.02, nz)

        vert.co = Vector((x, y, z))
    mesh.update()


# -------------------------------------------------------------------- hair

# Base props rebuilt from scratch below; keeping them would double up features
# (the imported eye is a protruding ball and the imported nose a small sphere).
REPLACED_BASE_OBJECTS = (
    "Nose",
    "Smile",
    "Eye_L",
    "Eye_R",
    "EyeHighlight_L",
    "EyeHighlight_R",
    "Eyebrow_L",
    "Eyebrow_R",
    "Cheek_L",
    "Cheek_R",
    "Hair_Scalp",
    "HairSide_L",
    "HairSide_R",
)

# Angles are atan2(y, x) in degrees: -90 is dead ahead (-Y), +90 is the back of
# the skull (+Y), 0 / 180 are the sides. The hairline sits highest over the
# brow, drops over the temples and runs low at the nape.
HAIRLINE_TABLE = [
    (-180.0, 0.512),
    (-160.0, 0.560),
    (-135.0, 0.612),
    (-112.0, 0.652),
    (-90.0, 0.668),
    (-68.0, 0.672),
    (-45.0, 0.632),
    (-22.0, 0.586),
    (0.0, 0.534),
    (22.0, 0.518),
    (50.0, 0.442),
    (90.0, 0.302),
    (130.0, 0.342),
    (160.0, 0.440),
    (180.0, 0.512),
]


def hairline_height_of_angle(angle: float, st: Style) -> float:
    height = table_lookup(HAIRLINE_TABLE, angle)
    if st.hair_style in ("short-side-part", "side-sweep", "slick-back"):
        # Side part on the wearer's right (-X): the fringe is combed across the
        # brow toward +X, so the hairline dips on that side and lifts at the part.
        dipped = 0.085 * gauss(angle, -42.0, 26.0)
        lifted = 0.075 * gauss(angle, -142.0, 26.0)
        height += lifted - dipped
    if st.hair_style == "bald":
        return 2.0
    return height


SKULL_CENTRE = Vector((0.0, -0.008, 0.52))


def build_hair(surface: Surface, st: Style, material) -> bpy.types.Object:
    """Procedural hair cap conforming to the skull, cut on the analytic hairline.

    The cap is parameterised by direction from the skull centre instead of by
    the head's own topology, so the hairline is a smooth curve at any
    tessellation and can never leave a face-sized staircase or dive through the
    scalp where the mesh is coarse.
    """
    if st.hair_style == "bald":
        return None

    theta_steps = 72
    row_steps = 13
    crown = 0.030 + 0.058 * st.hair_volume

    top_phi = 82.0
    bottoms = []
    for column in range(theta_steps):
        theta = -180.0 + 360.0 * column / theta_steps
        # z = centre.z + R * sin(phi)  ->  invert the hairline height.
        target = (hairline_height_of_angle(theta - 90.0, st) - SKULL_CENTRE.z) / 0.505
        bottoms.append(max(-52.0, min(60.0, math.degrees(math.asin(clamp(target, -0.86, 0.86))))))

    # Sample the skull once per grid node. Rays that graze the surface return
    # noisy radii, so smooth them around the ring before they reach the mesh;
    # unsmoothed radii show up as a saw-tooth hairline on the far side.
    directions = []
    skull_radius = []
    for column in range(theta_steps):
        theta = -180.0 + 360.0 * column / theta_steps
        bottom = bottoms[column]
        dirs = []
        radii = []
        for row in range(row_steps):
            t = row / (row_steps - 1)
            phi = lerp(top_phi, bottom, t ** 0.86)
            direction = direction_of(theta, phi)
            hit, _normal = surface.cast(SKULL_CENTRE, direction)
            dirs.append(direction)
            radii.append((hit - SKULL_CENTRE).length if hit is not None else 0.50)
        directions.append(dirs)
        skull_radius.append(radii)

    span = 2
    smoothed = [[0.0] * row_steps for _ in range(theta_steps)]
    for column in range(theta_steps):
        for row in range(row_steps):
            total = 0.0
            for offset in range(-span, span + 1):
                total += skull_radius[(column + offset) % theta_steps][row]
            smoothed[column][row] = total / (2 * span + 1)

    verts = []
    for column in range(theta_steps):
        theta = -180.0 + 360.0 * column / theta_steps
        for row in range(row_steps):
            t = row / (row_steps - 1)
            direction = directions[column][row]
            radius = max(skull_radius[column][row], smoothed[column][row])
            rise = sstep(0.0, 1.0, 1.0 - t)
            thickness = 0.0090 + crown * rise
            # Comb groove along the part on the wearer's right.
            px = SKULL_CENTRE.x + direction.x * radius
            py = SKULL_CENTRE.y + direction.y * radius
            part_x = -0.115 - 0.10 * (py + 0.45) / 0.55
            groove = gauss(px - part_x, 0.0, 0.018) * sstep(0.45, 0.12, t)
            thickness *= 1.0 - 0.30 * groove
            thickness *= 1.0 - 0.22 * sstep(0.72, 1.0, t)
            # Fringe: the front rows hang out over the brow instead of hugging
            # the skull, which is what reads as combed hair rather than a cap.
            angle = theta - 90.0
            thickness += (
                0.030
                * gauss(angle, -96.0, 62.0)
                * sstep(0.40, 1.0, t)
                * (1.0 - 0.75 * sstep(0.88, 1.0, t))
            )
            # A little side weight so the silhouette is not a perfect dome.
            thickness *= 1.0 + 0.14 * gauss(angle, 6.0, 40.0)
            # The rim sits just proud of the scalp; the shell is closed below by
            # an inward skirt (see below) so the far side never shows the open
            # underside of the shell as a saw-tooth edge.
            thickness = lerp(thickness, 0.0025, sstep(0.90, 1.0, t))
            verts.append(SKULL_CENTRE + direction * (radius + thickness))

    faces = []
    for column in range(theta_steps):
        nxt = (column + 1) % theta_steps
        for row in range(row_steps - 1):
            a = column * row_steps + row
            b = nxt * row_steps + row
            faces.append((a, b + 1, a + 1))
            faces.append((a, b, b + 1))
    # Close the crown with a fan through the pole.
    pole = len(verts)
    top_hit, _top_normal = surface.cast(SKULL_CENTRE, Vector((0.0, 0.0, 1.0)))
    top_radius = (top_hit - SKULL_CENTRE).length if top_hit is not None else 0.497
    verts.append(SKULL_CENTRE + Vector((0.0, 0.0, top_radius + crown + 0.004)))
    for column in range(theta_steps):
        nxt = (column + 1) % theta_steps
        faces.append((pole, column * row_steps, nxt * row_steps))
    # Inward skirt at the hairline: without it the shell is a single-sided cap
    # and the open rim shows the scalp through it wherever the rim is seen edge-on.
    inner_ring = []
    for column in range(theta_steps):
        direction = directions[column][row_steps - 1]
        radius = skull_radius[column][row_steps - 1]
        inner_ring.append(len(verts))
        verts.append(SKULL_CENTRE + direction * (radius - 0.006))
    for column in range(theta_steps):
        nxt = (column + 1) % theta_steps
        a = column * row_steps + (row_steps - 1)
        b = nxt * row_steps + (row_steps - 1)
        faces.append((a, inner_ring[column], inner_ring[nxt], b))

    obj = new_object("Hair", verts, faces, material)
    recalc_normals(obj)
    return obj


def direction_of(theta_deg: float, phi_deg: float) -> Vector:
    theta = math.radians(theta_deg)
    phi = math.radians(phi_deg)
    return Vector(
        (
            math.sin(theta) * math.cos(phi),
            -math.cos(theta) * math.cos(phi),
            math.sin(phi),
        )
    ).normalized()


# -------------------------------------------------------------------- face


def build_eye(surface: Surface, st: Style, sign: float, materials) -> list:
    """Almond eye patch that hugs the face, plus iris and highlight."""
    cx = sign * st.eye_cx
    cz = st.eye_cz
    hw = st.eye_hw
    hh = st.eye_hh
    tilt = math.radians(st.eye_tilt * -sign)
    cs, sn = math.cos(tilt), math.sin(tilt)

    rings, segs = 4, 20
    verts = []
    center = surface.front_point(cx, cz)
    verts.append(center + Vector((0.0, -0.004, 0.0)))
    for ring in range(1, rings + 1):
        radius = ring / rings
        for step in range(segs):
            angle = TAU * step / segs
            superellipse = 1.0 / (
                abs(math.cos(angle)) ** 1.55 + abs(math.sin(angle)) ** 1.55
            ) ** (1.0 / 1.55)
            ex = math.cos(angle) * superellipse * hw * radius
            ez = math.sin(angle) * superellipse * hh * radius
            # tilted almond: outer corner slightly higher
            px = cx + ex * cs - ez * sn
            pz = cz + ex * sn + ez * cs
            point = surface.front_point(px, pz)
            bulge = 0.009 * (1.0 - radius * radius) + 0.004
            verts.append(point + Vector((0.0, -bulge, 0.0)))
    faces = []
    for step in range(segs):  # centre fan
        faces.append((0, 1 + step, 1 + (step + 1) % segs))
    for ring in range(rings - 1):
        offset = 1 + ring * segs
        nxt = offset + segs
        for step in range(segs):
            a = offset + step
            b = offset + (step + 1) % segs
            faces.append((a, nxt + step, nxt + (step + 1) % segs, b))
    eye = new_object("EyePatch", verts, faces, materials["EyeWhite"])
    recalc_normals(eye)

    # Iris: shallow dome riding on the eye surface.
    iris_verts = []
    iris_faces = []
    iris_c = Vector((cx + sign * 0.004, 0.0, cz - 0.002))
    iris_point = surface.front_point(iris_c.x, iris_c.z) + Vector((0.0, -0.012, 0.0))
    iris_verts.append(iris_point)
    seg = 18
    for step in range(seg):
        angle = TAU * step / seg
        iris_verts.append(
            iris_point
            + Vector(
                (
                    math.cos(angle) * st.iris_r,
                    0.0035,
                    math.sin(angle) * st.iris_r * 1.06,
                )
            )
        )
    for step in range(seg):
        iris_faces.append((0, 1 + step, 1 + (step + 1) % seg))
    iris = new_object("Iris", iris_verts, iris_faces, materials["Eye"])
    recalc_normals(iris)

    # Catch-light: a small sphere keeps a soft specular-ish dot.
    hl = []
    hl_faces = []
    hl_r = st.iris_r * 0.34
    hl_c = iris_point + Vector((-st.iris_r * 0.34, -0.004, st.iris_r * 0.36))
    steps, slices = 6, 8
    hl.append(hl_c + Vector((0.0, 0.0, hl_r)))
    for i in range(1, steps):
        phi = math.pi * i / steps
        for j in range(slices):
            theta = TAU * j / slices
            hl.append(
                hl_c
                + Vector(
                    (
                        math.sin(phi) * math.cos(theta) * hl_r,
                        math.sin(phi) * math.sin(theta) * hl_r * 0.7,
                        math.cos(phi) * hl_r,
                    )
                )
            )
    hl.append(hl_c - Vector((0.0, 0.0, hl_r)))
    bottom = len(hl) - 1
    for j in range(slices):
        hl_faces.append((0, 1 + (j + 1) % slices, 1 + j))
    for i in range(steps - 2):
        base = 1 + i * slices
        nxt = base + slices
        for j in range(slices):
            hl_faces.append(
                (
                    base + j,
                    base + (j + 1) % slices,
                    nxt + (j + 1) % slices,
                    nxt + j,
                )
            )
    base = 1 + (steps - 2) * slices
    for j in range(slices):
        hl_faces.append((bottom, base + j, base + (j + 1) % slices))
    highlight = new_object("EyeGlint", hl, hl_faces, materials["EyeHighlight"])
    recalc_normals(highlight)

    # Upper lid line: follows the almond's upper rim and gives the eye a fold.
    lash = []
    lash_faces = []
    count = 16
    for step in range(count + 1):
        angle = math.pi * (0.06 + 0.88 * step / count)
        superellipse = 1.0 / (
            abs(math.cos(angle)) ** 1.55 + abs(math.sin(angle)) ** 1.55
        ) ** (1.0 / 1.55)
        ex = math.cos(angle) * superellipse * hw
        ez = math.sin(angle) * superellipse * hh
        px = cx + ex * cs - ez * sn
        pz = cz + ex * sn + ez * cs
        point = surface.front_point(px, pz) + Vector((0.0, -0.006, 0.0))
        taper = 0.004 + 0.0055 * math.sin(math.pi * step / count)
        lash.append(point + Vector((0.0, 0.0, taper)))
        lash.append(point + Vector((0.0, 0.0, -taper * 0.55)))
    for index in range(count):
        a = index * 2
        lash_faces.append((a, a + 2, a + 3, a + 1))
    lid = new_object("Lid", lash, lash_faces, materials["Brow"])
    recalc_normals(lid)
    return [eye, iris, highlight, lid]


def build_brow(surface: Surface, st: Style, sign: float, material):
    stations = []
    count = 12
    x_in = 0.044
    x_out = 0.044 + st.eye_hw * 2.0 + 0.095
    for step in range(count + 1):
        t = step / count
        x = sign * lerp(x_in, x_out, t)
        # gentle arch peaking laterally, outer end dropping
        z = (
            0.494
            + 0.007 * math.sin(math.pi * min(1.0, t * 1.25))
            - 0.022 * sstep(0.60, 1.0, t)
            + st.brow_angle * 0.012 * t
        )
        point = surface.front_point(x, z) + Vector((0.0, -0.006, 0.0))
        height = st.brow_hh * (0.55 + 0.65 * math.sin(math.pi * clamp(t * 1.15 + 0.1)))
        stations.append(
            (point + Vector((0.0, 0.0, height)), point + Vector((0.0, 0.0, -height)))
        )
    return ribbon(stations, material, "Brow")


def ellipsoid(centre: Vector, radii: tuple, material, name: str,
              segments: int = 14, rings: int = 10):
    """UV-sphere primitive with independent radii per axis."""
    verts = [centre + Vector((0.0, 0.0, radii[2]))]
    for ring in range(1, rings):
        phi = math.pi * ring / rings
        sin_phi, cos_phi = math.sin(phi), math.cos(phi)
        for step in range(segments):
            theta = TAU * step / segments
            verts.append(
                centre
                + Vector(
                    (
                        sin_phi * math.cos(theta) * radii[0],
                        sin_phi * math.sin(theta) * radii[1],
                        cos_phi * radii[2],
                    )
                )
            )
    verts.append(centre - Vector((0.0, 0.0, radii[2])))
    bottom = len(verts) - 1
    faces = []
    for step in range(segments):
        faces.append((0, 1 + (step + 1) % segments, 1 + step))
    for ring in range(rings - 2):
        base = 1 + ring * segments
        nxt = base + segments
        for step in range(segments):
            faces.append(
                (base + step, base + (step + 1) % segments,
                 nxt + (step + 1) % segments, nxt + step)
            )
    base = 1 + (rings - 2) * segments
    for step in range(segments):
        faces.append((bottom, base + step, base + (step + 1) % segments))
    obj = new_object(name, verts, faces, material)
    recalc_normals(obj)
    return obj


def build_nose(surface: Surface, st: Style, materials):
    """Bridge wedge plus a round tip and alae, the classic chibi nose mass."""
    tip_z = st.nose_tip_z + 0.014
    root_z = st.nose_root_z - 0.020
    tip_front = surface.front_y(0.0, tip_z, fallback=-0.46)
    parts = []

    # Bulb
    bulb_c = Vector((0.0, tip_front - st.nose_len * 0.52, tip_z))
    parts.append(
        ellipsoid(
            bulb_c,
            (st.nose_w * 0.30 + 0.010, st.nose_len * 0.72, 0.019),
            materials["Skin"],
            "NoseTip",
            segments=14,
            rings=10,
        )
    )

    # Alae
    for sign in (-1.0, 1.0):
        ala_c = Vector(
            (sign * (st.nose_w * 0.26 + 0.005), tip_front - st.nose_len * 0.26, tip_z - 0.005)
        )
        parts.append(
            ellipsoid(
                ala_c,
                (st.nose_w * 0.17 + 0.005, st.nose_len * 0.52, 0.013),
                materials["Skin"],
                "NoseAla",
                segments=10,
                rings=7,
            )
        )

    # Bridge: narrow loft from between the brows down to the bulb.
    rings, segs = 8, 14
    verts = []
    for ring in range(rings):
        t = ring / (rings - 1)
        z = lerp(root_z, tip_z - 0.004, t)
        base_y = surface.front_y(0.0, z, fallback=-0.44)
        width = lerp(0.013, st.nose_w * 0.24 + 0.007, sstep(0.0, 0.85, t))
        protrusion = st.nose_len * (0.10 + 0.76 * sstep(-0.15, 0.60, t))
        y_front = base_y - protrusion
        y_back = base_y + 0.026
        y_mid = 0.5 * (y_front + y_back)
        y_rad = 0.5 * (y_back - y_front)
        for step in range(segs):
            angle = TAU * step / segs
            px = width * math.copysign(abs(math.cos(angle)) ** 0.75, math.cos(angle))
            py = y_mid + y_rad * math.sin(angle)
            verts.append(Vector((px, py, z)))
    faces = grid_faces(rings, segs, closed_cols=True)
    top = len(verts)
    verts.append(Vector((0.0, surface.front_y(0.0, root_z) + 0.008, root_z + 0.006)))
    bottom = len(verts)
    verts.append(Vector((0.0, tip_front - st.nose_len * 0.55, tip_z - 0.020)))
    for step in range(segs):
        nxt = (step + 1) % segs
        faces.append((top, nxt, step))
        last = (rings - 1) * segs
        faces.append((bottom, last + step, last + nxt))
    parts.append(new_object("NoseBridge", verts, faces, materials["Skin"]))
    recalc_normals(parts[-1])

    # Nostrils: small dark dimples on the underside of the bulb.
    for sign in (-1.0, 1.0):
        cx = sign * (st.nose_w * 0.22 + 0.010)
        cz = tip_z - 0.012
        centre = Vector((cx, tip_front - st.nose_len * 0.34, cz))
        radius = 0.0060
        nv = [
            centre + Vector((0.0, 0.0, radius * 0.8)),
            centre + Vector((-radius, -0.004, 0.0)),
            centre + Vector((0.0, -0.008, 0.0)),
            centre + Vector((radius, -0.004, 0.0)),
            centre + Vector((0.0, 0.005, 0.0)),
            centre + Vector((0.0, 0.0, -radius * 0.5)),
        ]
        nf = [
            (0, 1, 2), (0, 2, 3),
            (5, 2, 1), (5, 3, 2),
            (4, 1, 0), (4, 3, 1), (4, 0, 3),
        ]
        parts.append(new_object("Nostril", nv, nf, materials["Nose"]))
        recalc_normals(parts[-1])
    return parts


def build_mouth(surface: Surface, st: Style, material):
    stations = []
    count = 14
    for step in range(count + 1):
        t = step / count
        x = lerp(-st.mouth_hw, st.mouth_hw, t)
        lift = 0.016 * (2.0 * t - 1.0) ** 2
        z = st.mouth_cz + lift
        point = surface.front_point(x, z) + Vector((0.0, -0.005, 0.0))
        height = (0.0060 + 0.0045 * st.mouth_full) * (
            0.35 + 0.85 * math.sin(math.pi * clamp(0.06 + 0.94 * (1.0 - abs(2 * t - 1)) ** 0.7))
        )
        stations.append(
            (point + Vector((0.0, 0.0, height)), point + Vector((0.0, 0.0, -height)))
        )
    return ribbon(stations, material, "Mouth")


# ----------------------------------------------------------------- glasses


def rounded_rect_path(cx: float, cz: float, hw: float, hh: float, radius: float, steps: int):
    """Closed rounded-rectangle outline in the (x, z) plane."""
    radius = min(radius, hw * 0.6, hh * 0.6)
    corners = [
        (cx + hw - radius, cz + hh - radius, 0.0),
        (cx - hw + radius, cz + hh - radius, math.pi * 0.5),
        (cx - hw + radius, cz - hh + radius, math.pi),
        (cx + hw - radius, cz - hh + radius, math.pi * 1.5),
    ]
    points = []
    per_corner = max(2, steps // 4)
    for ox, oz, start in corners:
        for index in range(per_corner):
            angle = start + (math.pi * 0.5) * index / per_corner
            points.append(
                (
                    ox + radius * math.cos(angle),
                    oz + radius * math.sin(angle),
                    start,
                )
            )
    return points


def build_glasses(surface: Surface, st: Style, material):
    if not st.glasses:
        return []
    cx = st.eye_cx
    cz = st.eye_cz
    flat = st.glasses_style in ("rectangular", "square", "half-rim")
    lens_hw = st.eye_hw * (1.62 if flat else 1.35) + (0.014 if flat else 0.004)
    lens_hh = st.eye_hh * (1.58 if flat else 1.55) + (0.006 if flat else 0.0)
    radius = 0.018 if flat else lens_hh * 0.72
    rim_r = 0.0026 + 0.0036 * st.frame_t

    objects = []
    plane_y = surface.front_y(cx, cz) - (0.010 + lens_hh * 0.06)
    for sign in (-1.0, 1.0):
        center_x = sign * cx
        path_points = rounded_rect_path(center_x, cz, lens_hw, lens_hh, radius, 32)
        path = []
        for px, pz, corner in path_points:
            # Frame recedes at its outer edge so it follows the cheek.
            curve = ((px - center_x) / max(lens_hw, 1e-6)) ** 2 * 0.016
            path.append(Vector((px, plane_y + curve, pz)))
        path.append(path[0])
        top_side = (1.25 if flat else 1.10)

        def radius_of(index, point, center_x=center_x, top_side=top_side, cz=cz):
            return rim_r * (top_side if point.z > cz else 1.0)

        objects.append(tube(path, radius_of, material, "GlassesRim", sides=4))
    # Bridge
    bridge = []
    for step in range(7):
        t = step / 6
        x = lerp(-st.eye_hw * 0.42, st.eye_hw * 0.42, t)
        z = cz + lens_hh * 0.52 + 0.014 * math.sin(math.pi * t)
        bridge.append(Vector((x, plane_y + 0.004, z)))
    objects.append(tube(bridge, lambda _i, _p: rim_r * 0.85, material, "GlassesBridge", sides=4))

    # Temples: from the outer corner back to the ear.
    for sign in (-1.0, 1.0):
        ear_x = 0.442 * sign
        outer_x = sign * (cx + lens_hw)
        path = [
            Vector((outer_x, plane_y + 0.010, cz + lens_hh * 0.30)),
            Vector((outer_x + 0.028 * sign, plane_y + 0.075, cz + lens_hh * 0.22)),
            Vector((lerp(outer_x, ear_x, 0.55), plane_y + 0.180, cz + lens_hh * 0.10)),
            Vector((ear_x, -0.008, cz + 0.010)),
        ]
        dense = []
        for index in range(9):
            t = index / 8
            # Catmull-ish blend of the four control points
            p = (
                path[0] * ((1 - t) ** 3)
                + path[1] * (3 * (1 - t) ** 2 * t)
                + path[2] * (3 * (1 - t) * t * t)
                + path[3] * (t**3)
            )
            dense.append(p)
        objects.append(tube(dense, lambda _i, _p: rim_r * 0.72, material, "GlassesTemple", sides=4))

    # Nose pads: short arms from the bridge back to the nose.
    for sign in (-1.0, 1.0):
        x = sign * st.eye_hw * 0.55
        z = cz + lens_hh * 0.20
        inner = Vector((x, plane_y + 0.002, z))
        surface_y = surface.front_y(sign * 0.030, z, fallback=plane_y)
        outer = Vector((sign * 0.028, surface_y + 0.004, z))
        objects.append(
            tube([inner, outer], lambda _i, _p: rim_r * 0.55, material, "GlassesPad", sides=4)
        )
    return objects


# ------------------------------------------------------------------- build


def build(params: dict, base_path: Path):
    head_kit.reset_scene()
    objects = head_kit.import_base_head(base_path)
    materials = head_kit.assign_materials()
    head_kit.apply_palette(materials, params)
    st = Style(params)

    # Recolour the imported eye material to a warm iris tone.
    head_kit.set_color(materials["Eye"], (0.235, 0.150, 0.105))
    materials["EyeWhite"] = head_kit.colored_material("EyeWhite", (0.945, 0.925, 0.890))
    if "Mouth" in materials:
        head_kit.set_color(materials["Mouth"], (0.255, 0.135, 0.125))

    shell = objects["SculptedHead"]
    sculpt_shell(shell, st)

    # Enlarge the ears: a defining trait on the reference portrait.
    for name in ("Ear_L", "Ear_R", "EarInner_L", "EarInner_R"):
        ear = objects.get(name)
        if ear is None:
            continue
        center = Vector()
        for vert in ear.data.vertices:
            center += vert.co
        center /= len(ear.data.vertices)
        sign = -1.0 if center.x < 0 else 1.0
        ear.data.transform(
            Matrix.Translation(Vector((sign * 0.020, 0.030, -0.026)))
            @ Matrix.Translation(center)
            @ Matrix.Scale(1.12, 4)
            @ Matrix.Translation(-center)
        )
        ear.data.update()

    # Every feature authored below replaces its imported counterpart, so drop
    # the base props before anything is built on top of them.
    for name in REPLACED_BASE_OBJECTS:
        if name in objects:
            bpy.data.objects.remove(objects.pop(name), do_unlink=True)

    head_kit.decimate(shell, 0.30)
    bpy.context.view_layer.update()
    surface = Surface(shell)
    hair = build_hair(surface, st, materials["Hair"])
    extras = []
    for sign in (-1.0, 1.0):
        extras.extend(build_eye(surface, st, sign, materials))
        extras.append(build_brow(surface, st, sign, materials["Brow"]))
    extras.extend(build_nose(surface, st, materials))
    extras.append(build_mouth(surface, st, materials["Mouth"]))
    extras.extend(build_glasses(surface, st, materials["Glasses"]))

    # Decimation happens before joining so the nose and brows keep their shape.
    for name, obj in list(objects.items()):
        if obj is shell:
            continue
        head_kit.decimate(obj, 0.16 if name.startswith("Ear") else 0.60)
    head_kit.decimate(hair, 0.90)
    for obj in extras:
        head_kit.decimate(obj, 0.65)

    kit = [obj for obj in objects.values()] + [hair] + extras
    dbg("before decimation", {o.name: head_kit.triangle_count(o) for o in kit})
    kit = [obj for obj in kit if obj.name in bpy.data.objects]
    joined = head_kit.join_by_material(kit)
    head_kit.trim_to_budget(joined, 13000)
    for obj in joined:
        for polygon in obj.data.polygons:
            polygon.use_smooth = not obj.name.startswith("Glasses")
    return joined, kit


def render_view(path: str, yaw_deg: float) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.color = (0.92, 0.90, 0.86)
    cam_data = bpy.data.cameras.new("PreviewCamera")
    cam = bpy.data.objects.new("PreviewCamera", cam_data)
    bpy.context.collection.objects.link(cam)
    yaw = math.radians(yaw_deg)
    distance = 3.35
    cam.location = (distance * math.sin(yaw), -distance * math.cos(yaw), 0.50)
    cam.rotation_euler = (math.radians(90), 0.0, yaw)
    cam_data.lens = 85
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


VIEW_YAWS = {"front": 0.0, "three-quarter-left": 35.0, "three-quarter": -35.0,
             "side": -90.0, "back": 180.0}


def main() -> None:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--params", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--render", default=None)
    parser.add_argument("--views", default="front")
    parser.add_argument("--base", default=str(head_kit.DEFAULT_BASE))
    args = parser.parse_args(argv)

    try:
        params = head_kit.load_params(args.params)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        sys.exit(f"head_sculpt: cannot read params {args.params}: {exc}")

    try:
        joined, _kit = build(params, Path(args.base))
    except (FileNotFoundError, RuntimeError) as exc:
        sys.exit(f"head_sculpt: {exc}")

    try:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        head_kit.export_glb(args.out, joined)
    except (OSError, RuntimeError) as exc:
        sys.exit(f"head_sculpt: cannot export {args.out}: {exc}")

    if args.render:
        views = [item.strip() for item in args.views.split(",") if item.strip()]
        for view in views:
            yaw = VIEW_YAWS.get(view)
            if yaw is None:
                try:
                    yaw = float(view)
                except ValueError:
                    sys.exit(f"head_sculpt: unknown view {view!r}")
            stem, dot, ext = args.render.rpartition(".")
            target = args.render if len(views) == 1 else f"{stem}-{view}.{ext}"
            render_view(target, yaw)

    stats = {
        "objects": len(joined),
        "triangles": sum(head_kit.triangle_count(obj) for obj in joined),
        "meshes": {obj.name: head_kit.triangle_count(obj) for obj in joined},
        "out": args.out,
    }
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
