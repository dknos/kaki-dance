"""Build the production Measure Match shared-biped reference scene.

The final public sprites are cleaned atlas pixels, not these Blender renders.
This scene provides the common armature, orthographic camera-space occlusion,
costume proxies, frame timing, and depth/anchor export consumed during review.

Run from the repository root:

  blender --background --factory-startup \
    --python tools/blender/build_measure_match_rig.py -- \
    --output tools/blender/kaki-measure-match-production.blend
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ART_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "art"))
if ART_DIR not in sys.path:
    sys.path.insert(0, ART_DIR)

from hero_pose_library import (  # noqa: E402
    ANCHORS,
    CLIP_SPECS,
    SEGMENTS,
    approval_samples,
    marker_for_phase,
    sample_clip,
)


BPM = 100
PIXELS_PER_UNIT = 24
PROFILE_NAMES = ("kitty", "soder")
BODY_BONES = {
    "pelvis": ("rightHip", "leftHip"),
    "torso": ("pelvis", "chest"),
    "neck": ("chest", "neck"),
    "head": ("neck", "head"),
}
ALL_BONES = {**BODY_BONES, **SEGMENTS}
PROFILE_COLORS = {
    "kitty": {
        "body": (0.055, 0.06, 0.16, 1),
        "limb": (0.08, 0.09, 0.22, 1),
        "face": (0.9, 0.82, 0.68, 1),
        "accent": (0.05, 0.48, 0.72, 1),
    },
    "soder": {
        "body": (0.14, 0.48, 0.19, 1),
        "limb": (0.18, 0.55, 0.24, 1),
        "face": (0.9, 0.82, 0.68, 1),
        "accent": (0.52, 0.31, 0.16, 1),
    },
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default="tools/blender/kaki-measure-match-production.blend",
    )
    return parser.parse_args(argv)


def project_root():
    return os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocks in (
        bpy.data.armatures,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.curves,
    ):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)


def material(name, color):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    value.roughness = 0.9
    return value


def world_point(point, depth=0.0):
    return Vector(
        (
            (point[0] - 48) / PIXELS_PER_UNIT,
            -depth * 0.12,
            (88 - point[1]) / PIXELS_PER_UNIT,
        )
    )


def bone_points(pose, bone_name):
    start_name, end_name = ALL_BONES[bone_name]
    depth = pose["depth"].get(bone_name, 0.0)
    return (
        world_point(pose["anchors"][start_name], depth),
        world_point(pose["anchors"][end_name], depth),
    )


def build_armature():
    rest = sample_clip("idleGroove", 0)
    data = bpy.data.armatures.new("KakiDanceProductionBiped")
    rig = bpy.data.objects.new("KakiDanceProductionBiped", data)
    bpy.context.collection.objects.link(rig)
    rig["topology"] = "biped"
    rig["profiles"] = "kitty,soder"
    rig["cameraSpaceDepth"] = "per segment"
    rig.show_in_front = True
    rig.data.display_type = "STICK"
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name in ALL_BONES:
        head, tail = bone_points(rest, name)
        if (tail - head).length < 0.01:
            tail.z += 0.02
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = True
    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def create_proxy_segment(profile, name, material_value, width):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
    value = bpy.context.object
    value.name = f"{profile.title()}.{name}"
    value.data.materials.append(material_value)
    value["profile"] = profile
    value["segment"] = name
    value["sharedArmature"] = "KakiDanceProductionBiped"
    value.scale = (width, width, 0.5)
    return value


def build_costume_proxies():
    result = {}
    for profile in PROFILE_NAMES:
        colors = PROFILE_COLORS[profile]
        materials = {
            key: material(f"{profile.title()} {key.title()}", color)
            for key, color in colors.items()
        }
        objects = {}
        bulk = 1.12 if profile == "soder" else 1.0
        for segment in SEGMENTS:
            if "Hand" in segment:
                key = "face"
                width = 0.12
            elif "Foot" in segment:
                key = "limb"
                width = 0.15 * bulk
            elif "Thigh" in segment:
                key = "limb"
                width = 0.19 * bulk
            elif "Shin" in segment:
                key = "limb"
                width = 0.16 * bulk
            elif "UpperArm" in segment:
                key = "body"
                width = 0.16 * bulk
            else:
                key = "body"
                width = 0.14 * bulk
            objects[segment] = create_proxy_segment(
                profile,
                segment,
                materials[key],
                width,
            )
        objects["torso"] = create_proxy_segment(
            profile,
            "Torso",
            materials["body"],
            0.31 * bulk,
        )
        objects["pelvis"] = create_proxy_segment(
            profile,
            "Pelvis",
            materials["limb"],
            0.28 * bulk,
        )
        objects["head"] = create_proxy_segment(
            profile,
            "Head",
            materials["face"],
            0.39 if profile == "kitty" else 0.44,
        )
        objects["head"].data.materials.append(materials["accent"])
        result[profile] = objects
    return result


def orient_object(value, head, tail, width):
    midpoint = (head + tail) * 0.5
    direction = tail - head
    length = max(0.02, direction.length)
    value.location = midpoint
    value.rotation_mode = "QUATERNION"
    value.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    value.scale = (width, width, length * 0.5)


def body_object_points(pose, name):
    if name in ("torso", "pelvis"):
        head, tail = bone_points(pose, name)
        return head, tail
    head = world_point(pose["anchors"]["head"], pose["depth"]["head"])
    return head - Vector((0, 0, 0.08)), head + Vector((0, 0, 0.08))


def keyframe_rig(rig, pose, frame):
    for name, pose_bone in rig.pose.bones.items():
        head, tail = bone_points(pose, name)
        direction = tail - head
        length = max(0.02, direction.length)
        rest_length = max(0.02, rig.data.bones[name].length)
        rotation = Vector((0, 1, 0)).rotation_difference(direction.normalized())
        pose_bone.matrix = (
            Matrix.Translation(head)
            @ rotation.to_matrix().to_4x4()
            @ Matrix.Diagonal((1.0, length / rest_length, 1.0, 1.0))
        )
        pose_bone.keyframe_insert("location", frame=frame)
        pose_bone.keyframe_insert("rotation_quaternion", frame=frame)
        pose_bone.keyframe_insert("scale", frame=frame)


def keyframe_costumes(costumes, pose, frame):
    for profile, objects in costumes.items():
        bulk = 1.12 if profile == "soder" else 1.0
        for name, value in objects.items():
            if name in SEGMENTS:
                head, tail = bone_points(pose, name)
                if "Hand" in name:
                    width = 0.12
                elif "Foot" in name:
                    width = 0.15 * bulk
                elif "Thigh" in name:
                    width = 0.19 * bulk
                elif "Shin" in name:
                    width = 0.16 * bulk
                elif "UpperArm" in name:
                    width = 0.16 * bulk
                else:
                    width = 0.14 * bulk
            else:
                head, tail = body_object_points(pose, name)
                width = (
                    (0.39 if profile == "kitty" else 0.44)
                    if name == "head"
                    else (0.31 if name == "torso" else 0.28) * bulk
                )
            orient_object(value, head, tail, width)
            value.keyframe_insert("location", frame=frame)
            value.keyframe_insert("rotation_quaternion", frame=frame)
            value.keyframe_insert("scale", frame=frame)


def animate(rig, costumes, scene):
    clip_ranges = {}
    cursor = 1
    export = {
        "schemaVersion": 1,
        "topology": "biped",
        "sharedArmature": rig.name,
        "profiles": list(PROFILE_NAMES),
        "fps": 12,
        "camera": "orthographic front; per-segment camera-space depth",
        "clips": {},
    }
    for clip_id, spec in CLIP_SPECS.items():
        count = max(3, round(spec["durationBeats"] * 60 / BPM * spec["fps"]) + 1)
        start = cursor
        end = start + count - 1
        scene.timeline_markers.new(clip_id.upper(), frame=start)
        exported_frames = []
        for index in range(count):
            phase = index / (count - 1)
            frame = start + index
            pose = sample_clip(clip_id, phase)
            keyframe_rig(rig, pose, frame)
            keyframe_costumes(costumes, pose, frame)
            exported_frames.append(
                {
                    "frame": frame,
                    "phase": round(phase, 6),
                    "label": pose["label"],
                    "markers": list(marker_for_phase(clip_id, phase)),
                    "contacts": list(pose["contacts"]),
                    "anchors": {
                        name: [round(value, 4) for value in pose["anchors"][name]]
                        for name in ANCHORS
                    },
                    "segmentDepth": {
                        name: round(pose["depth"][name], 4)
                        for name in SEGMENTS
                    },
                }
            )
        export["clips"][clip_id] = {
            "range": [start, end],
            "durationBeats": spec["durationBeats"],
            "mirroringSafe": spec["mirroringSafe"],
            "frames": exported_frames,
        }
        clip_ranges[clip_id] = (start, end)
        cursor = end + 7
    scene.frame_start = 1
    scene.frame_end = cursor - 7
    return clip_ranges, export


def add_camera(scene):
    camera_data = bpy.data.cameras.new("ProductionOrthoCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 4.25
    camera = bpy.data.objects.new("ProductionOrthoCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, -10, 2.0)
    target = Vector((0, 0, 1.65))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    return camera


def add_floor():
    floor_material = material("Reference Floor", (0.02, 0.03, 0.08, 1))
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0.5, -0.03))
    floor = bpy.context.object
    floor.name = "ReferenceFloor"
    floor.data.materials.append(floor_material)


def configure_render(scene):
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 384
    scene.render.resolution_y = 216
    scene.render.resolution_percentage = 100
    scene.render.fps = 12
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.world.color = (0.008, 0.012, 0.035)
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    scene.display.shading.show_specular_highlight = False


def set_profile_visibility(costumes, active):
    for profile, objects in costumes.items():
        for value in objects.values():
            value.hide_render = profile != active
            value.hide_viewport = profile != active


def render_approval_refs(scene, costumes, clip_ranges, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    for profile in PROFILE_NAMES:
        set_profile_visibility(costumes, profile)
        for label, clip_id, phase in approval_samples():
            start, end = clip_ranges[clip_id]
            scene.frame_set(round(start + phase * (end - start)))
            scene.render.filepath = os.path.join(output_dir, f"{profile}-{label}.png")
            bpy.ops.render.render(write_still=True)
    set_profile_visibility(costumes, "kitty")


def main():
    args = parse_args()
    root = project_root()
    output = args.output if os.path.isabs(args.output) else os.path.join(root, args.output)
    export_path = os.path.join(
        root,
        "tools",
        "blender",
        "exports",
        "kaki-measure-match-camera-depth.json",
    )
    ref_dir = os.path.join(
        root,
        "tools",
        "blender",
        "reference",
        "measure-match",
    )
    clear_scene()
    scene = bpy.context.scene
    rig = build_armature()
    costumes = build_costume_proxies()
    add_floor()
    add_camera(scene)
    configure_render(scene)
    clip_ranges, export = animate(rig, costumes, scene)
    os.makedirs(os.path.dirname(export_path), exist_ok=True)
    with open(export_path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(export, handle, indent=2)
        handle.write("\n")
    render_approval_refs(scene, costumes, clip_ranges, ref_dir)
    scene.frame_set(clip_ranges["babyFreeze"][0] + 4)
    set_profile_visibility(costumes, "kitty")
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=output)
    print(f"KAKI_DANCE_PRODUCTION_RIG={output}")
    print(f"KAKI_DANCE_CAMERA_DEPTH={export_path}")
    print(f"KAKI_DANCE_BLENDER_REFS={ref_dir}")


if __name__ == "__main__":
    main()
