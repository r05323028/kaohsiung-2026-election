"""Procedural chibi head-kit generator.

Imports the head carrier meshes of the shared chibi base model and deforms
them per candidate. Importing the base sculpt means every likeness kit
inherits the site's proven facial style and topology instead of inventing a
new head, and the kit lands in HeadPivot-local space automatically.

Run:
    blender -b --factory-startup -P scripts/avatar/blender/head_kit.py -- \
        --params <appearance.json> --out <kit.glb> [--render <png>] [--views front,three-quarter]
"""

# Blender's bpy/mathutils ship with the host application, not with pip.
# pyright: reportMissingImports=false
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_BASE = REPO_ROOT / "public" / "models" / "kaohsiung_chibi_base.glb"
PIVOT_Z = 2.035

HEAD_OBJECTS = (
    "SculptedHead",
    "Hair_Scalp",
    "HairSide_L",
    "HairSide_R",
    "Ear_L",
    "Ear_R",
    "EarInner_L",
    "EarInner_R",
    "Eye_L",
    "Eye_R",
    "EyeHighlight_L",
    "EyeHighlight_R",
    "Eyebrow_L",
    "Eyebrow_R",
    "Cheek_L",
    "Cheek_R",
    "Nose",
    "Smile",
    "Neck",
)

MATERIAL_ROLES = {
    "Material_4": "Skin",
    "Material_9": "EyeHighlight",
    "Material_11": "Hair",
    "Material_12": "Nose",
    "Material_13": "Eye",
    "Material_14": "Brow",
    "Material_15": "Blush",
    "Material_16": "Mouth",
}

NUMERIC_KEYS = (
    "faceWidth",
    "faceLength",
    "jawWidth",
    "chinRoundness",
    "cheekFullness",
    "eyeSize",
    "eyeSpacing",
    "eyeHeight",
    "eyeTilt",
    "eyebrowThickness",
    "eyebrowAngle",
    "noseWidth",
    "noseLength",
    "mouthWidth",
    "mouthFullness",
    "hairVolume",
)

DEFAULTS = {
    "faceShape": "oval",
    "faceWidth": 0.5,
    "faceLength": 0.5,
    "jawWidth": 0.5,
    "chinRoundness": 0.6,
    "cheekFullness": 0.5,
    "eyeSize": 0.55,
    "eyeSpacing": 0.5,
    "eyeHeight": 0.48,
    "eyeTilt": 0.0,
    "eyebrowThickness": 0.4,
    "eyebrowAngle": 0.0,
    "noseWidth": 0.4,
    "noseLength": 0.45,
    "mouthWidth": 0.45,
    "mouthFullness": 0.45,
    "hairStyle": "short-crop",
    "hairVolume": 0.5,
    "glasses": {"enabled": False, "style": "none", "frameThickness": 0.3},
    "facialHair": {"enabled": False, "style": "none", "density": 0.5},
}

# Categorical face shapes nudge the numeric parameters so a schematically
# classified face still shifts the silhouette even when measurements are mid.
SHAPE_BIAS = {
    "oval": {},
    "round": {"cheekFullness": 0.10, "faceLength": -0.05, "jawWidth": 0.04},
    "square": {"jawWidth": 0.12, "chinRoundness": -0.15},
    "heart": {"jawWidth": -0.10, "cheekFullness": 0.08},
    "oblong": {"faceLength": 0.10, "faceWidth": -0.03},
    "diamond": {"cheekFullness": 0.10, "jawWidth": -0.12},
}

# Base-model eye line in HeadPivot-local space (model 2.451 - pivot 2.035).
EYE_LINE = 0.416

# Per-mesh decimation ratios. The imported base head is 33k triangles; the
# visible silhouette survives a heavy collapse because every surface here is
# smooth, so the kit lands under the 8k budget without visible faceting.
DECIMATE = {
    "SculptedHead": 0.26,
    "Hair_Scalp": 1.0,
    "HairSide_L": 1.0,
    "HairSide_R": 1.0,
    "Ear_L": 0.18,
    "Ear_R": 0.18,
    "EarInner_L": 0.20,
    "EarInner_R": 0.20,
    "Eye_L": 0.12,
    "Eye_R": 0.12,
    "EyeHighlight_L": 0.20,
    "EyeHighlight_R": 0.20,
    "Eyebrow_L": 0.50,
    "Eyebrow_R": 0.50,
    "Cheek_L": 0.30,
    "Cheek_R": 0.30,
    "Nose": 0.60,
    "Smile": 0.60,
    "Neck": 0.35,
}


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = clamp((x - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def parse_hex(value: object) -> tuple[float, float, float] | None:
    """Hex sRGB to linear RGB, ready for a Principled Base Color."""
    if not isinstance(value, str) or not value.startswith("#") or len(value) != 7:
        return None
    try:
        channels = [int(value[i : i + 2], 16) / 255.0 for i in (1, 3, 5)]
    except ValueError:
        return None

    def linear(channel: float) -> float:
        return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4

    return (linear(channels[0]), linear(channels[1]), linear(channels[2]))


def darken(rgb: tuple[float, float, float], factor: float) -> tuple[float, float, float]:
    return (rgb[0] * factor, rgb[1] * factor, rgb[2] * factor)


def load_params(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as handle:
            raw = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise ValueError("params must be a JSON object")
    params = {**DEFAULTS, **raw}
    params["glasses"] = {**DEFAULTS["glasses"], **(raw.get("glasses") or {})}
    params["facialHair"] = {**DEFAULTS["facialHair"], **(raw.get("facialHair") or {})}
    for key in NUMERIC_KEYS:
        params[key] = clamp(float(params[key]), -1.0, 1.0)
    return params


def effective(params: dict) -> dict:
    values = {key: clamp(float(params[key])) for key in NUMERIC_KEYS}
    for key, bias in SHAPE_BIAS.get(str(params["faceShape"]), {}).items():
        values[key] = clamp(values[key] + bias)
    return values


# ---------------------------------------------------------------- scene setup


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            block.remove(item)


def import_base_head(path: Path) -> dict[str, bpy.types.Object]:
    if not path.exists():
        raise FileNotFoundError(f"base model not found: {path}")
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects: dict[str, bpy.types.Object] = {}
    for name in HEAD_OBJECTS:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            raise RuntimeError(f"base model is missing head mesh {name!r}")
        objects[name] = obj

    # Strip the imported hierarchy and bake HeadPivot-local coordinates so the
    # kit can be parented straight to HeadPivot at runtime.
    for obj in objects.values():
        world = obj.matrix_world.copy()
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(world)
        obj.data.transform(Matrix.Translation((0.0, 0.0, -PIVOT_Z)))
        obj.data.update()

    keep = {obj.name for obj in objects.values()}
    for obj in list(bpy.data.objects):
        if obj.name not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    return objects


def assign_materials() -> dict[str, bpy.types.Material]:
    materials: dict[str, bpy.types.Material] = {}
    for source, role in MATERIAL_ROLES.items():
        material = bpy.data.materials.get(source)
        if material is None:
            raise RuntimeError(f"base model is missing material {source!r}")
        material.name = role
        materials[role] = material
    return materials


def set_color(material: bpy.types.Material, rgb: tuple[float, float, float]) -> None:
    material.diffuse_color = (*rgb, 1.0)
    if not material.use_nodes:
        return
    for node in material.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            node.inputs["Base Color"].default_value = (*rgb, 1.0)


def colored_material(name: str, rgb: tuple[float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*rgb, 1.0)
    for node in material.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            node.inputs["Base Color"].default_value = (*rgb, 1.0)
            node.inputs["Roughness"].default_value = 0.75
    return material


def apply_palette(materials: dict[str, bpy.types.Material], params: dict) -> None:
    skin = parse_hex(params.get("skinColor"))
    if skin:
        # Half-strength so every candidate keeps the site's warm chibi palette;
        # photo skin tones are saturated and read sunburnt at full strength.
        base_skin = tuple(materials["Skin"].diffuse_color[:3])
        set_color(
            materials["Skin"],
            tuple(base_skins * 0.30 + observed * 0.70 for base_skins, observed in zip(base_skin, skin)),
        )
    hair = parse_hex(params.get("hairColor"))
    if hair:
        set_color(materials["Hair"], hair)
        set_color(materials["Brow"], darken(hair, 0.82))
    materials["Glasses"] = colored_material("Glasses", (0.085, 0.070, 0.060))
    materials["FacialHair"] = colored_material(
        "FacialHair", darken(hair, 0.88) if hair else (0.16, 0.11, 0.08)
    )
    for role in ("Eye", "EyeHighlight", "Blush", "Mouth", "Nose"):
        if role in materials:
            material = materials[role]
            material.diffuse_color = material.diffuse_color  # keep imported viewport colour


# ------------------------------------------------------------------ geometry


def for_vertices(obj: bpy.types.Object, fn) -> None:
    for vertex in obj.data.vertices:
        vertex.co = fn(vertex.co.copy())
    obj.data.update()


def bbox(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    xs = [vertex.co.x for vertex in obj.data.vertices]
    ys = [vertex.co.y for vertex in obj.data.vertices]
    zs = [vertex.co.z for vertex in obj.data.vertices]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def center_of(obj: bpy.types.Object) -> Vector:
    low, high = bbox(obj)
    return (low + high) * 0.5


def scale_about(obj: bpy.types.Object, pivot: Vector, sx: float, sy: float, sz: float) -> None:
    for_vertices(
        obj,
        lambda co: Vector(
            (
                pivot.x + (co.x - pivot.x) * sx,
                pivot.y + (co.y - pivot.y) * sy,
                pivot.z + (co.z - pivot.z) * sz,
            )
        ),
    )


def rotate_y_about(obj: bpy.types.Object, pivot: Vector, angle: float) -> None:
    rotation = Matrix.Rotation(angle, 4, "Y")
    for_vertices(obj, lambda co: pivot + (rotation @ (co - pivot)))


def head_map(co: Vector, p: dict) -> Vector:
    x, y, z = co
    z = EYE_LINE + (z - EYE_LINE) * (0.93 + 0.14 * p["faceLength"])
    mid = smoothstep(0.0, 0.10, z) * (1.0 - smoothstep(0.80, 0.95, z))
    jaw = 1.0 - smoothstep(0.34, 0.50, z)
    cheek = math.exp(-((z - 0.30) ** 2) / (2.0 * 0.070**2))
    chin = 1.0 - smoothstep(0.05, 0.17, z)

    width_factor = 0.88 + 0.24 * p["faceWidth"]
    jaw_factor = 0.82 + 0.36 * p["jawWidth"]
    x *= 1.0 + (width_factor - 1.0) * mid * (1.0 - 0.65 * jaw) + (jaw_factor - 1.0) * jaw
    x *= 1.0 + 0.10 * (p["cheekFullness"] - 0.5) * cheek
    x *= 1.0 + 0.10 * (p["chinRoundness"] - 0.5) * chin
    y -= 0.020 * (p["cheekFullness"] - 0.5) * cheek
    z -= 0.030 * (p["chinRoundness"] - 0.5) * chin
    return Vector((x, y, z))


def transform_features(objects: dict[str, bpy.types.Object], p: dict) -> None:
    for name, obj in objects.items():
        if name != "Neck":
            for_vertices(obj, lambda co: head_map(co, p))

    eye_scale = 1.0 + 0.10 * p["eyeSize"]
    eye_dx = (p["eyeSpacing"] - 0.5) * 0.030
    eye_dz = (p["eyeHeight"] - 0.48) * 0.020
    tilt = math.radians(10.0) * p["eyeTilt"]
    for sign, eye_name, highlight_name in (
        (1.0, "Eye_R", "EyeHighlight_R"),
        (-1.0, "Eye_L", "EyeHighlight_L"),
    ):
        eye = objects[eye_name]
        highlight = objects[highlight_name]
        pivot = center_of(eye)
        offset = Vector((sign * eye_dx, 0.0, eye_dz))
        for obj in (eye, highlight):
            for_vertices(obj, lambda co: co + offset)
        for obj in (eye, highlight):
            scale_about(obj, pivot + offset, eye_scale, 1.0, eye_scale)
            rotate_y_about(obj, pivot + offset, -tilt * sign)

    brow_scale = 0.70 + 0.60 * p["eyebrowThickness"]
    brow_angle = math.radians(12.0) * p["eyebrowAngle"]
    for sign, name in ((1.0, "Eyebrow_R"), (-1.0, "Eyebrow_L")):
        brow = objects[name]
        pivot = center_of(brow)
        for_vertices(
            brow,
            lambda co: co + Vector((sign * eye_dx * 0.5, 0.0, eye_dz * 0.4)),
        )
        pivot = pivot + Vector((sign * eye_dx * 0.5, 0.0, eye_dz * 0.4))
        scale_about(brow, pivot, 1.0, 1.0, brow_scale)
        rotate_y_about(brow, pivot, -brow_angle * sign)

    nose = objects["Nose"]
    nose_pivot = center_of(nose)
    scale_about(
        nose,
        nose_pivot,
        0.85 + 0.30 * p["noseWidth"],
        1.0,
        0.85 + 0.30 * p["noseLength"],
    )
    for_vertices(nose, lambda co: co + Vector((0.0, 0.0, (p["noseLength"] - 0.45) * 0.030)))

    mouth = objects["Smile"]
    mouth_pivot = center_of(mouth)
    scale_about(
        mouth,
        mouth_pivot,
        0.85 + 0.30 * p["mouthWidth"],
        1.0,
        0.85 + 0.30 * p["mouthFullness"],
    )


def lengthen(
    obj: bpy.types.Object,
    anchor: float,
    target: float,
    tuck: float = 0.0,
    sway: float = 0.0,
    guard_front: bool = True,
) -> None:
    """Stretch the part of a hair shell below *anchor* down to *target*.

    The base fringe reaches down over the brow, so long styles must not pull
    those front tips down with the sides and back. *guard_front* fades the
    stretch out towards the face.
    """
    zs = [vertex.co.z for vertex in obj.data.vertices]
    low = min(zs)
    if anchor - low < 1e-5:
        return
    ratio = (anchor - target) / (anchor - low)
    for vertex in obj.data.vertices:
        if vertex.co.z >= anchor:
            continue
        t = (anchor - vertex.co.z) / (anchor - low)
        weight = 1.0 if not guard_front else max(
            smoothstep(-0.34, -0.16, vertex.co.y), smoothstep(0.32, 0.42, abs(vertex.co.x))
        )
        vertex.co.z -= (anchor - vertex.co.z) * (ratio - 1.0) * weight
        vertex.co.x *= 1.0 - tuck * t * weight
        vertex.co.y += sway * t


def _widen_locks(sides: list[bpy.types.Object], factor: float) -> None:
    """Thicken the thin base side locks so stretched hair reads as a sheet."""
    for obj in sides:
        pivot = center_of(obj)
        scale_about(obj, pivot, 1.0, factor, 1.0)


def lift_front_hem(obj: bpy.types.Object, amount: float) -> None:
    """Raise the fringe tips so they sit above the brows instead of in the eyes."""
    for vertex in obj.data.vertices:
        if vertex.co.y >= -0.20 or vertex.co.z >= 0.66:
            continue
        weight = smoothstep(-0.20, -0.38, vertex.co.y) * (1.0 - smoothstep(0.44, 0.66, vertex.co.z))
        vertex.co.z += amount * weight
    obj.data.update()


def inflate(obj: bpy.types.Object, amount: float, center: Vector) -> None:
    """Push a shell radially off the skull so the face never pokes through it."""
    for vertex in obj.data.vertices:
        direction = vertex.co - center
        length = direction.length
        if length < 1e-6:
            continue
        vertex.co += direction * (amount / length)
    obj.data.update()


def ripple(obj: bpy.types.Object, amplitude: float, frequency: float) -> None:
    for vertex in obj.data.vertices:
        direction = Vector((vertex.co.x, vertex.co.y - 0.02, 0.0))
        if direction.length < 1e-6:
            continue
        wave = math.sin(vertex.co.z * frequency + vertex.co.x * frequency * 0.7)
        vertex.co += direction.normalized() * (amplitude * wave)
    obj.data.update()


def add_ellipsoid(
    name: str,
    center: Vector,
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segments: int = 20,
    rings: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rotation
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def apply_style_hair(
    objects: dict[str, bpy.types.Object], materials: dict[str, bpy.types.Material], params: dict, p: dict
) -> list[bpy.types.Object]:
    scalp = objects["Hair_Scalp"]
    sides = [objects["HairSide_L"], objects["HairSide_R"]]
    style = str(params["hairStyle"])
    volume = p["hairVolume"]

    if style == "bald":
        for obj in [scalp, *sides]:
            bpy.data.objects.remove(obj, do_unlink=True)
        for name in ("Hair_Scalp", "HairSide_L", "HairSide_R"):
            objects.pop(name, None)
        return []

    growth = 1.0 + 0.10 * (volume - 0.5)
    for obj in [scalp, *sides]:
        scale_about(obj, Vector((0.0, 0.02, 0.55)), growth, growth, 1.0 + 0.05 * (volume - 0.5))

    extras: list[bpy.types.Object] = []

    if style in ("short-crop", "short-side-part", "side-sweep", "center-part", "slick-back", "short-waves", "short-curl"):
        lengthen(scalp, 0.47, 0.30 if style == "short-crop" else 0.22, tuck=0.04)
        for obj in sides:
            lengthen(obj, 0.80, 0.50 if style == "short-crop" else 0.42, tuck=0.10, sway=0.02)
    elif style == "bob":
        lengthen(scalp, 0.47, 0.04, tuck=0.10, sway=0.01)
    elif style == "medium-straight":
        lengthen(scalp, 0.47, -0.10, tuck=0.03, sway=0.02)
    elif style == "shoulder-length":
        lengthen(scalp, 0.47, -0.30, tuck=0.06, sway=0.03)
    elif style == "long-straight":
        lengthen(scalp, 0.47, -0.48, tuck=0.06, sway=0.03)

    if style == "short-waves":
        ripple(scalp, 0.006, 26.0)
    elif style == "short-curl":
        ripple(scalp, 0.011, 38.0)
    elif style == "center-part":
        for_vertices(
            scalp,
            lambda co: co + Vector((0.0, 0.030 * math.exp(-(co.x**2) / 0.004), 0.0))
            if co.y < -0.22
            else co,
        )
    elif style == "side-sweep":
        for_vertices(
            scalp,
            lambda co: co + Vector((0.045 * math.exp(-((co.z - 0.72) ** 2) / 0.06), 0.0, 0.0))
            if co.y < -0.10
            else co,
        )
    elif style == "slick-back":
        for_vertices(
            scalp,
            lambda co: co + Vector((0.0, 0.035, 0.012))
            if co.y < -0.18 and co.z > 0.60
            else co,
        )
    elif style == "bun":
        extras.append(
            add_ellipsoid("Hair_Bun", Vector((0.0, 0.34, 0.86)), (0.155, 0.140, 0.130), materials["Hair"])
        )
        extras.append(
            add_ellipsoid(
                "Hair_BunTie", Vector((0.0, 0.27, 0.78)), (0.105, 0.080, 0.070), materials["Hair"], segments=14, rings=8
            )
        )
    elif style == "ponytail":
        extras.append(
            add_ellipsoid(
                "Hair_Tail",
                Vector((0.0, 0.46, 0.58)),
                (0.105, 0.095, 0.270),
                materials["Hair"],
                rotation=(math.radians(28.0), 0.0, 0.0),
            )
        )
        extras.append(
            add_ellipsoid(
                "Hair_TailTie", Vector((0.0, 0.36, 0.78)), (0.090, 0.075, 0.060), materials["Hair"], segments=14, rings=8
            )
        )
    inflate(scalp, 0.008, Vector((0.0, 0.0, 0.42)))
    for obj in sides:
        inflate(obj, 0.004, Vector((0.0, 0.0, 0.42)))
    return extras


# ------------------------------------------------------------------- accents


def surface_hit(bvh: BVHTree, origin: Vector, direction: Vector) -> tuple[Vector, Vector] | None:
    location, normal, _index, _distance = bvh.ray_cast(origin, direction)
    if location is None:
        return None
    return location, normal


def add_glasses(
    objects: dict[str, bpy.types.Object], materials: dict[str, bpy.types.Material], params: dict, bvh: BVHTree
) -> list[bpy.types.Object]:
    settings = params["glasses"]
    if not settings.get("enabled"):
        return []
    style = str(settings.get("style", "rectangular"))
    thickness = 0.005 + 0.007 * clamp(float(settings.get("frameThickness", 0.3)))
    material = materials["Glasses"]
    created: list[bpy.types.Object] = []
    eye_centers = [center_of(objects["Eye_R"]), center_of(objects["Eye_L"])]

    if style == "round":
        half_w, half_h = 0.074, 0.074
    elif style == "square":
        half_w, half_h = 0.072, 0.068
    elif style == "half-rim":
        half_w, half_h = 0.078, 0.060
    else:
        half_w, half_h = 0.080, 0.058

    lens_y: list[float] = []
    for eye_center in eye_centers:
        hit = surface_hit(bvh, Vector((eye_center.x, -1.4, eye_center.z)), Vector((0.0, 1.0, 0.0)))
        lens_y.append((hit[0].y if hit else -0.47) - 0.020 - 0.010 * float(settings.get("frameThickness", 0.3)))

    for index, eye_center in enumerate(eye_centers):
        cx = eye_center.x
        cz = eye_center.z + 0.004
        cy = lens_y[index]

        def bar(name: str, bx: float, bz: float, sx: float, sz: float) -> None:
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, cy, bz))
            obj = bpy.context.object
            obj.name = name
            obj.scale = (sx, thickness, sz)
            obj.data.materials.append(material)
            created.append(obj)

        if style == "round":
            bpy.ops.mesh.primitive_torus_add(
                major_radius=half_w,
                minor_radius=thickness,
                major_segments=24,
                minor_segments=6,
                location=(cx, cy, cz),
                rotation=(math.radians(90.0), 0.0, 0.0),
            )
            ring = bpy.context.object
            ring.name = f"Glasses_Ring_{index}"
            ring.scale = (1.0, 1.0, 0.92)
            ring.data.materials.append(material)
            for polygon in ring.data.polygons:
                polygon.use_smooth = True
            created.append(ring)
        else:
            bar(f"Glasses_Top_{index}", cx, cz + half_h, half_w * 2.0, thickness * 2.0)
            if style != "half-rim":
                bar(f"Glasses_Bottom_{index}", cx, cz - half_h, half_w * 2.0, thickness * 1.6)
            bar(f"Glasses_SideA_{index}", cx - half_w, cz, thickness * 1.8, half_h * 2.0)
            bar(f"Glasses_SideB_{index}", cx + half_w, cz, thickness * 1.8, half_h * 2.0)

    bridge_from = eye_centers[1].x + half_w
    bridge_to = eye_centers[0].x - half_w
    bridge_z = eye_centers[0].z + 0.004 + half_h * 0.45
    bridge_y = (lens_y[0] + lens_y[1]) * 0.5
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=((bridge_from + bridge_to) * 0.5, bridge_y, bridge_z),
    )
    bridge = bpy.context.object
    bridge.name = "Glasses_Bridge"
    bridge.scale = (abs(bridge_to - bridge_from) + thickness * 2.0, thickness, thickness * 1.4)
    bridge.data.materials.append(material)
    created.append(bridge)

    for sign, eye_center in ((1.0, eye_centers[0]), (-1.0, eye_centers[1])):
        outer_x = eye_center.x + sign * half_w
        start = Vector((outer_x, lens_y[0] if sign > 0 else lens_y[1], eye_center.z + half_h * 0.55))
        hit = surface_hit(bvh, Vector((sign * 1.4, 0.0, start.z)), Vector((-sign, 0.0, 0.0)))
        end = Vector((hit[0].x if hit else sign * 0.52, 0.02, start.z + 0.03))
        mid = (start + end) * 0.5 + Vector((0.0, -0.02, 0.015))

        for point_from, point_to, label in ((start, mid, "A"), (mid, end, "B")):
            direction = point_to - point_from
            length = direction.length
            if length < 1e-5:
                continue
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=6,
                radius=thickness * 0.8,
                depth=length,
                location=(point_from + point_to) * 0.5,
                rotation=Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized()).to_euler(),
            )
            temple = bpy.context.object
            temple.name = f"Glasses_Temple_{sign:+.0f}{label}"
            temple.data.materials.append(material)
            created.append(temple)
    return created


def add_beard(
    objects: dict[str, bpy.types.Object], materials: dict[str, bpy.types.Material], params: dict, bvh: BVHTree
) -> list[bpy.types.Object]:
    settings = params["facialHair"]
    if not settings.get("enabled"):
        return []
    style = str(settings.get("style", "none"))
    if style == "none":
        return []
    density = clamp(float(settings.get("density", 0.5)))
    material = materials["FacialHair"]
    created: list[bpy.types.Object] = []

    def patch(name: str, theta_max: float, z_bottom: float, z_top_base: float, z_top_spread: float,
              segments: int, rings: int, offset: float, z_scale: float = 1.0) -> None:
        vertices: list[Vector] = []
        rows: list[list[int]] = []
        for ring in range(rings + 1):
            u = ring / rings
            row: list[int] = []
            for segment in range(segments):
                theta = -theta_max + 2.0 * theta_max * segment / (segments - 1)
                top = z_top_base + z_top_spread * (abs(math.sin(theta)) ** 0.9)
                z = z_bottom + (top - z_bottom) * u
                direction = Vector((math.sin(theta), -math.cos(theta), 0.0))
                hit = surface_hit(bvh, Vector((direction.x * 1.6, direction.y * 1.6, z)), -direction)
                if hit is None:
                    row.append(-1)
                    continue
                location, normal = hit
                row.append(len(vertices))
                vertices.append(location + normal * offset)
            rows.append(row)

        faces: list[tuple[int, int, int, int]] = []
        for ring in range(rings):
            for segment in range(segments - 1):
                quad = (rows[ring][segment], rows[ring][segment + 1], rows[ring + 1][segment + 1], rows[ring + 1][segment])
                if all(index >= 0 for index in quad):
                    faces.append(quad)  # type: ignore[arg-type]
        if not faces:
            return
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([tuple(vertex) for vertex in vertices], [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(material)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        created.append(obj)

    if style in ("full-beard", "stubble"):
        offset = 0.004 + 0.012 * density if style == "stubble" else 0.008 + 0.014 * density
        patch("Beard", 1.05, 0.015, 0.115, 0.110, 26, 9, offset)
    if style in ("goatee", "mustache", "full-beard"):
        patch("Mustache", 0.42, 0.238, 0.276, 0.010, 14, 4, 0.010 + 0.008 * density)
    if style == "goatee":
        patch("Goatee", 0.34, 0.012, 0.090, 0.020, 14, 5, 0.008 + 0.010 * density)
    return created


# ------------------------------------------------------------ export pipeline


def decimate(obj: bpy.types.Object, ratio: float) -> None:
    if ratio >= 0.999:
        return
    modifier = obj.modifiers.new(name="Decimate", type="DECIMATE")
    modifier.ratio = ratio
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def join_by_material(objects: list[bpy.types.Object]) -> list[bpy.types.Object]:
    groups: dict[str, list[bpy.types.Object]] = {}
    for obj in objects:
        if not obj.data.materials:
            continue
        groups.setdefault(obj.data.materials[0].name, []).append(obj)

    joined: list[bpy.types.Object] = []
    for material_name, members in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for member in members:
            member.select_set(True)
        bpy.context.view_layer.objects.active = members[0]
        if len(members) > 1:
            bpy.ops.object.join()
        result = bpy.context.view_layer.objects.active
        result.name = material_name
        joined.append(result)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return joined


def trim_to_budget(objects: list[bpy.types.Object], limit: int) -> None:
    total = sum(triangle_count(obj) for obj in objects)
    if total <= limit:
        return
    # Second pass: shave the largest surface further rather than touching
    # small facial accents that carry the likeness.
    head = next((obj for obj in objects if obj.name == "Skin"), None)
    if head is not None:
        excess = total - limit
        current = triangle_count(head)
        target = max(int(current * 0.55), current - excess - 200)
        if target < current:
            decimate(head, target / current)
            head.data.update()


def export_glb(path: str, objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_extras=False,
        export_cameras=False,
        export_lights=False,
    )


VIEW_YAWS = {
    "front": 0.0,
    "three-quarter": -35.0,
    "side": -90.0,
    "back": 180.0,
}
PREVIEW_CENTER_Z = 0.52


def render_preview(path: str, yaw_deg: float = 0.0) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.color = (0.92, 0.90, 0.86)
    cam_data = bpy.data.cameras.new("PreviewCamera")
    cam = bpy.data.objects.new("PreviewCamera", cam_data)
    bpy.context.collection.objects.link(cam)
    yaw = math.radians(yaw_deg)
    cam.location = (4.6 * math.sin(yaw), -4.6 * math.cos(yaw), PREVIEW_CENTER_Z)
    cam.rotation_euler = (math.radians(90), 0.0, yaw)
    cam_data.lens = 85
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def build(params: dict, base_path: Path) -> tuple[list[bpy.types.Object], list[bpy.types.Object]]:
    reset_scene()
    objects = import_base_head(base_path)
    materials = assign_materials()
    apply_palette(materials, params)
    p = effective(params)

    transform_features(objects, p)
    extras = apply_style_hair(objects, materials, params, p)

    for name, obj in list(objects.items()):
        decimate(obj, DECIMATE.get(name, 1.0))

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(objects["SculptedHead"], depsgraph)

    accents = add_glasses(objects, materials, params, bvh) + add_beard(objects, materials, params, bvh)

    kit = [obj for obj in objects.values() if obj.name in HEAD_OBJECTS] + extras + accents
    kit = [obj for obj in kit if obj.name in bpy.data.objects]
    joined = join_by_material(kit)
    trim_to_budget(joined, 12000)
    for obj in joined:
        for polygon in obj.data.polygons:
            polygon.use_smooth = obj.name not in ("Glasses",)
    return joined, kit


def main() -> None:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--params", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--render", default=None)
    parser.add_argument("--views", default="front")
    parser.add_argument("--base", default=str(DEFAULT_BASE))
    args = parser.parse_args(argv)

    try:
        params = load_params(args.params)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        sys.exit(f"head_kit: cannot read params {args.params}: {exc}")

    try:
        joined, _kit = build(params, Path(args.base))
    except (FileNotFoundError, RuntimeError) as exc:
        sys.exit(f"head_kit: {exc}")

    try:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        export_glb(args.out, joined)
    except (OSError, RuntimeError) as exc:
        sys.exit(f"head_kit: cannot export {args.out}: {exc}")

    if args.render:
        views = [item.strip() for item in args.views.split(",") if item.strip()]
        for view in views:
            if view in VIEW_YAWS:
                yaw = VIEW_YAWS[view]
            else:
                try:
                    yaw = float(view)
                except ValueError:
                    sys.exit(f"head_kit: unknown view {view!r}")
            stem, dot, ext = args.render.rpartition(".")
            target = args.render if len(views) == 1 else f"{stem}-{view}.{ext}"
            render_preview(target, yaw)

    stats = {
        "objects": len(joined),
        "triangles": sum(triangle_count(obj) for obj in joined),
        "meshes": {obj.name: triangle_count(obj) for obj in joined},
        "out": args.out,
    }
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
