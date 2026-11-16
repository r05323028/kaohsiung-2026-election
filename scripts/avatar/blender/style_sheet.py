# pyright: reportMissingImports=false
"""Render a labelled contact sheet of every hairstyle from the shared chibi head kit."""
import argparse
import json
import math
import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import head_kit  # noqa: E402

STYLES = (
    "short-crop",
    "short-side-part",
    "side-sweep",
    "center-part",
    "short-waves",
    "short-curl",
    "slick-back",
    "medium-straight",
    "bob",
    "shoulder-length",
    "bun",
    "ponytail",
    "bald",
)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            block.remove(item)


def add_label(text: str, x: float, z: float) -> None:
    bpy.ops.object.text_add(location=(x, -0.70, z))
    obj = bpy.context.object
    obj.rotation_euler = (math.radians(90), 0.0, 0.0)
    obj.data.body = text
    obj.data.size = 0.085
    obj.data.align_x = "CENTER"
    obj.data.align_y = "TOP"
    mat = bpy.data.materials.new("Label_" + text)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.15, 0.16, 0.18, 1.0)
    obj.data.materials.append(mat)


def main() -> None:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--columns", type=int, default=5)
    args = parser.parse_args(argv)

    base_path = pathlib.Path(__file__).resolve().parents[3] / "tmp" / "avatar-pipeline" / "poc-params" / "default.json"
    try:
        base = json.loads(base_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        sys.exit(f"style_sheet: cannot read {base_path}: {exc}")

    clear_scene()
    columns = args.columns
    span_x = 1.30
    span_y = 1.42
    for index, style in enumerate(STYLES):
        params = {**base, "hairStyle": style}
        objs, head = head_kit.build_head_kit(params)
        col = index % columns
        row = index // columns
        dx = (col - (columns - 1) / 2.0) * span_x
        dy = -row * span_y
        for obj in objs:
            obj.location.x += dx
            obj.location.z += dy
        add_label(style, dx, dy - 0.06)

    bpy.context.view_layer.update()

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    rows = math.ceil(len(STYLES) / columns)
    scene.render.resolution_x = 320 * columns
    scene.render.resolution_y = 360 * rows
    scene.world = bpy.data.worlds.new("SheetWorld")
    scene.world.color = (0.94, 0.93, 0.90)

    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    width = 320 * columns
    height = 360 * rows
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = columns * span_x * 1.08
    cam.location = (0.0, -8.0, 0.52 - (rows - 1) * span_y / 2.0)
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    scene.camera = cam
    scene.render.filepath = args.out
    scene.render.film_transparent = False
    bpy.ops.render.render(write_still=True)
    print(json.dumps({"out": args.out, "width": width, "height": height, "styles": len(STYLES)}))


if __name__ == "__main__":
    main()
