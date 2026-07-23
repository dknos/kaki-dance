"""Build the shared Kaki-Dance hero biped and golden-chain references.

Run:
  blender --background --factory-startup \
    --python tools/blender/build_kaki_proxy.py -- \
    --output tools/blender/kaki-hero-biped.blend

Blender is an offline anatomy and contact-reference tool. Nothing in this file
is loaded by the browser runtime.
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector


CLIPS = {
    "basicRock": {
        "label": "Basic Rock",
        "start": 1,
        "end": 25,
        "contacts": [["foot.L", "foot.R"]] * 5,
    },
    "basicGoDown": {
        "label": "Go Down",
        "start": 31,
        "end": 55,
        "contacts": [
            ["foot.L", "foot.R"],
            ["foot.L", "foot.R"],
            ["hand.L", "foot.L", "foot.R"],
            ["hand.L", "foot.R"],
            ["hand.L", "foot.L", "foot.R"],
        ],
    },
    "sixStep": {
        "label": "6-Step",
        "start": 61,
        "end": 85,
        "contacts": [
            ["hand.L", "foot.L", "foot.R"],
            ["hand.L", "hand.R", "foot.L"],
            ["hand.R", "foot.R"],
            ["hand.L", "hand.R"],
            ["hand.L", "foot.L"],
        ],
    },
    "windmill": {
        "label": "Windmill",
        "start": 91,
        "end": 115,
        "contacts": [
            ["shoulder.L"],
            ["back"],
            ["shoulder.R"],
            ["hand.L"],
            ["shoulder.L"],
        ],
    },
    "babyFreeze": {
        "label": "Baby Freeze",
        "start": 121,
        "end": 145,
        "contacts": [["hand.L", "hand.R"]] * 5,
    },
    "cleanGetUp": {
        "label": "Clean Get-Up",
        "start": 151,
        "end": 175,
        "contacts": [
            ["hand.L", "hand.R"],
            ["hand.R", "foot.R"],
            ["hand.R", "foot.L", "foot.R"],
            ["foot.L", "foot.R"],
            ["foot.L", "foot.R"],
        ],
    },
}

SAMPLE_PHASES = (0.0, 0.25, 0.5, 0.75, 1.0)
PROFILE_NAMES = ("kitty", "soder")
EXPORT_BONES = (
    "root",
    "pelvis",
    "chest",
    "neck",
    "head",
    "shoulder.L",
    "upper_arm.L",
    "elbow.L",
    "forearm.L",
    "wrist.L",
    "hand.L",
    "shoulder.R",
    "upper_arm.R",
    "elbow.R",
    "forearm.R",
    "wrist.R",
    "hand.R",
    "hip.L",
    "thigh.L",
    "knee.L",
    "shin.L",
    "ankle.L",
    "foot.L",
    "hip.R",
    "thigh.R",
    "knee.R",
    "shin.R",
    "ankle.R",
    "foot.R",
    "tail",
)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="tools/blender/kaki-hero-biped.blend")
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.armatures,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.curves,
    ):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name, color, roughness=0.82):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1)
    value.roughness = roughness
    return value


def build_shared_biped():
    data = bpy.data.armatures.new("KakiDanceSharedBiped")
    rig = bpy.data.objects.new("KakiDanceSharedBiped", data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    rig.show_in_front = True
    rig.data.display_type = "STICK"
    rig["topology"] = "biped"
    rig["profiles"] = "kitty,soder"
    bpy.ops.object.mode_set(mode="EDIT")
    bones = {}

    def add(name, head, tail, parent=None):
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = bones[parent]
        bones[name] = bone

    add("root", (0, 0, 0.0), (0, 0, 0.3))
    add("pelvis", (0, 0, 0.55), (0, 0, 0.92), "root")
    add("chest", (0, 0, 0.92), (0, 0, 1.55), "pelvis")
    add("neck", (0, 0, 1.55), (0, 0, 1.72), "chest")
    add("head", (0, 0, 1.72), (0, 0, 2.3), "neck")
    add("ear.L", (-0.2, 0, 2.12), (-0.39, 0, 2.47), "head")
    add("ear.R", (0.2, 0, 2.12), (0.39, 0, 2.47), "head")
    add("tail", (0, 0.13, 0.72), (0, 0.64, 0.3), "pelvis")

    for suffix, sign in (("L", -1), ("R", 1)):
        add(
            f"shoulder.{suffix}",
            (0, 0, 1.48),
            (0.24 * sign, 0, 1.48),
            "chest",
        )
        add(
            f"upper_arm.{suffix}",
            (0.24 * sign, 0, 1.48),
            (0.68 * sign, 0, 1.17),
            f"shoulder.{suffix}",
        )
        add(
            f"elbow.{suffix}",
            (0.68 * sign, 0, 1.17),
            (0.69 * sign, 0, 1.16),
            f"upper_arm.{suffix}",
        )
        add(
            f"forearm.{suffix}",
            (0.68 * sign, 0, 1.17),
            (1.02 * sign, 0, 0.83),
            f"elbow.{suffix}",
        )
        add(
            f"wrist.{suffix}",
            (1.02 * sign, 0, 0.83),
            (1.13 * sign, 0, 0.75),
            f"forearm.{suffix}",
        )
        add(
            f"hand.{suffix}",
            (1.13 * sign, 0, 0.75),
            (1.32 * sign, -0.04, 0.7),
            f"wrist.{suffix}",
        )
        add(
            f"hip.{suffix}",
            (0, 0, 0.78),
            (0.18 * sign, 0, 0.78),
            "pelvis",
        )
        add(
            f"thigh.{suffix}",
            (0.18 * sign, 0, 0.78),
            (0.36 * sign, 0, 0.34),
            f"hip.{suffix}",
        )
        add(
            f"knee.{suffix}",
            (0.36 * sign, 0, 0.34),
            (0.361 * sign, 0, 0.33),
            f"thigh.{suffix}",
        )
        add(
            f"shin.{suffix}",
            (0.36 * sign, 0, 0.34),
            (0.4 * sign, 0, -0.08),
            f"knee.{suffix}",
        )
        add(
            f"ankle.{suffix}",
            (0.4 * sign, 0, -0.08),
            (0.42 * sign, -0.04, -0.18),
            f"shin.{suffix}",
        )
        add(
            f"foot.{suffix}",
            (0.42 * sign, -0.04, -0.18),
            (0.68 * sign, -0.24, -0.18),
            f"ankle.{suffix}",
        )

    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    add_joint_limits(rig)
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def add_joint_limits(rig):
    limits = {
        "upper_arm": ((-2.7, 2.7), (-1.45, 1.45), (-2.8, 2.8)),
        "forearm": ((-0.15, 2.75), (-0.35, 0.35), (-0.4, 0.4)),
        "thigh": ((-2.35, 2.35), (-1.4, 1.4), (-1.8, 1.8)),
        "shin": ((-0.05, 2.8), (-0.25, 0.25), (-0.25, 0.25)),
    }
    for side in ("L", "R"):
        for stem, bounds in limits.items():
            bone = rig.pose.bones[f"{stem}.{side}"]
            constraint = bone.constraints.new("LIMIT_ROTATION")
            constraint.name = "Anatomical joint limit"
            constraint.owner_space = "LOCAL"
            constraint.use_limit_x = True
            constraint.use_limit_y = True
            constraint.use_limit_z = True
            constraint.min_x, constraint.max_x = bounds[0]
            constraint.min_y, constraint.max_y = bounds[1]
            constraint.min_z, constraint.max_z = bounds[2]


def build_profile_parts(rig):
    palettes = {
        "kitty": {
            "ink": material("Kitty Ink", (0.025, 0.035, 0.09)),
            "body": material("Kitty Hoodie", (0.055, 0.07, 0.16)),
            "skin": material("Kitty Plush", (0.9, 0.82, 0.68)),
            "accent": material("Kitty Hair", (0.05, 0.48, 0.72)),
            "sole": material("Kitty Sole", (0.72, 0.64, 0.54)),
        },
        "soder": {
            "ink": material("Soder Ink", (0.02, 0.07, 0.055)),
            "body": material("Soder Kigurumi", (0.14, 0.48, 0.19)),
            "skin": material("Soder Face", (0.9, 0.82, 0.68)),
            "accent": material("Soder Belly", (0.52, 0.7, 0.22)),
            "sole": material("Soder Sole", (0.06, 0.22, 0.1)),
        },
    }
    profile_objects = {}

    def part(profile, name, bone, scale, value, offset=(0, 0, 0)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
        obj = bpy.context.object
        obj.name = f"{profile.title()}.{name}"
        obj.scale = scale
        obj.data.materials.append(value)
        obj.parent = rig
        obj.parent_type = "BONE"
        obj.parent_bone = bone
        bone_length = rig.data.bones[bone].length
        obj.location = (
            offset[0],
            -bone_length * 0.5 + offset[1],
            offset[2],
        )
        obj["profile"] = profile
        profile_objects[profile].append(obj)
        return obj

    for profile in PROFILE_NAMES:
        values = palettes[profile]
        profile_objects[profile] = []
        bulk = 1.08 if profile == "soder" else 1.0
        part(profile, "Chest", "chest", (0.5 * bulk, 0.38, 0.33 * bulk), values["body"])
        part(profile, "Pelvis", "pelvis", (0.45 * bulk, 0.27, 0.31 * bulk), values["body"])
        if profile == "kitty":
            part(profile, "Head", "head", (0.6, 0.54, 0.43), values["skin"])
            part(profile, "Hair", "head", (0.63, 0.28, 0.45), values["accent"], (0, 0.18, 0.02))
            part(profile, "Ear.L", "ear.L", (0.14, 0.23, 0.1), values["accent"])
            part(profile, "Ear.R", "ear.R", (0.14, 0.23, 0.1), values["accent"])
        else:
            part(profile, "Hood", "head", (0.7, 0.64, 0.5), values["body"])
            part(profile, "Face", "head", (0.48, 0.43, 0.38), values["skin"], (0, -0.02, 0.34))
            part(profile, "Belly", "chest", (0.3, 0.34, 0.16), values["accent"], (0, -0.03, 0.32))
        part(
            profile,
            "CostumeTail",
            "tail",
            (0.13 * bulk, 0.38 if profile == "soder" else 0.32, 0.13 * bulk),
            values["body"],
        )
        for side in ("L", "R"):
            part(profile, f"UpperArm.{side}", f"upper_arm.{side}", (0.15 * bulk, 0.32, 0.15 * bulk), values["body"])
            part(profile, f"Forearm.{side}", f"forearm.{side}", (0.13 * bulk, 0.29, 0.13 * bulk), values["body"] if profile == "soder" else values["skin"])
            part(profile, f"Wrist.{side}", f"wrist.{side}", (0.14 * bulk, 0.1, 0.13 * bulk), values["body"])
            part(profile, f"Hand.{side}", f"hand.{side}", (0.2, 0.16, 0.12), values["skin"])
            part(profile, f"Thigh.{side}", f"thigh.{side}", (0.19 * bulk, 0.35, 0.19 * bulk), values["body"] if profile == "soder" else values["ink"])
            part(profile, f"Shin.{side}", f"shin.{side}", (0.16 * bulk, 0.32, 0.16 * bulk), values["body"] if profile == "soder" else values["ink"])
            part(profile, f"Ankle.{side}", f"ankle.{side}", (0.15 * bulk, 0.1, 0.13 * bulk), values["body"])
            part(profile, f"Foot.{side}", f"foot.{side}", (0.2, 0.28, 0.14), values["sole"])
    return profile_objects


def add_floor_and_contacts():
    ink = material("Reference Floor", (0.015, 0.025, 0.07))
    accent = material("Contact Marker", (0.95, 0.2, 0.08))
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=3.2, depth=0.08, location=(0, 0, -0.22))
    floor = bpy.context.object
    floor.name = "ReferenceFloor"
    floor.data.materials.append(ink)
    for index, (x, y) in enumerate(((-1.2, 0), (1.2, 0), (0, 0.55), (0, -0.55))):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.13,
            minor_radius=0.025,
            location=(x, y, -0.165),
        )
        marker = bpy.context.object
        marker.name = f"ContactMarker.{index + 1}"
        marker.data.materials.append(accent)


def reset_pose(rig):
    rig.location = (0, 0, 0)
    rig.rotation_euler = (0, 0, 0)
    rig.scale = (1, 1, 1)
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)


def set_rot(rig, name, xyz):
    rig.pose.bones[name].rotation_euler = xyz


def symmetric_limb(rig, stem, left, right=None):
    set_rot(rig, f"{stem}.L", left)
    set_rot(rig, f"{stem}.R", right if right is not None else tuple(-value for value in left))


def pose_clip(rig, clip, phase):
    turn = phase * math.tau
    pulse = math.sin(turn)
    if clip == "basicRock":
        rig.location = (0.12 * pulse, 0, 0.03 - 0.04 * abs(pulse))
        set_rot(rig, "pelvis", (0, 0.12 * pulse, 0.16 * pulse))
        set_rot(rig, "chest", (0, -0.1 * pulse, -0.13 * pulse))
        set_rot(rig, "upper_arm.L", (0.05, 0.15, -0.25 - 0.12 * pulse))
        set_rot(rig, "upper_arm.R", (-0.05, -0.15, 0.25 - 0.12 * pulse))
        set_rot(rig, "thigh.L", (0.08 * max(0, pulse), -0.08, 0.08 * pulse))
        set_rot(rig, "thigh.R", (0.08 * max(0, -pulse), 0.08, 0.08 * pulse))
    elif clip == "basicGoDown":
        ease = phase * phase * (3 - 2 * phase)
        rig.location = (-0.1 * ease, 0, -0.38 * ease)
        rig.rotation_euler = (0.08 * ease, 0.58 * ease, -0.18 * ease)
        set_rot(rig, "pelvis", (0.15 * ease, 0.42 * ease, 0))
        set_rot(rig, "chest", (-0.1 * ease, -0.2 * ease, 0))
        set_rot(rig, "upper_arm.L", (0.1, 1.18 * ease, -0.58 * ease))
        set_rot(rig, "forearm.L", (1.45 * ease, 0, 0))
        symmetric_limb(rig, "thigh", (0.72 * ease, -0.28, 0.2), (0.42 * ease, 0.28, -0.25))
        symmetric_limb(rig, "shin", (1.2 * ease, 0, 0), (0.92 * ease, 0, 0))
    elif clip == "sixStep":
        rig.location = (0.08 * math.cos(turn), 0, -0.42 + 0.05 * math.sin(turn * 2))
        rig.rotation_euler = (0.12, 0.28 * math.sin(turn), 0.16 * math.sin(turn))
        set_rot(rig, "upper_arm.L", (0.1, 1.28, -0.42))
        set_rot(rig, "forearm.L", (1.42, 0, 0))
        set_rot(rig, "upper_arm.R", (-0.1, -1.22, 0.42))
        set_rot(rig, "forearm.R", (1.38, 0, 0))
        set_rot(rig, "thigh.L", (0.4 + 0.45 * math.sin(turn), -0.88, turn))
        set_rot(rig, "shin.L", (0.8 + 0.55 * math.cos(turn), 0, 0))
        set_rot(rig, "thigh.R", (0.4 - 0.45 * math.sin(turn), 0.88, turn + math.pi))
        set_rot(rig, "shin.R", (0.8 - 0.55 * math.cos(turn), 0, 0))
    elif clip == "windmill":
        rig.location = (0, 0, 0.66)
        rig.rotation_euler = (math.radians(72), 0.28 * math.sin(turn), turn)
        set_rot(rig, "thigh.L", (1.02, -1.12, -1.05))
        set_rot(rig, "shin.L", (0.28, 0, 0))
        set_rot(rig, "thigh.R", (-1.02, 1.12, 1.05))
        set_rot(rig, "shin.R", (0.22, 0, 0))
        set_rot(rig, "upper_arm.L", (0, 0.72, -0.92))
        set_rot(rig, "upper_arm.R", (0, -0.72, 0.92))
    elif clip == "babyFreeze":
        rig.location = (0, 0, 0.22)
        rig.rotation_euler = (0.08, math.radians(68), -0.12)
        set_rot(rig, "upper_arm.L", (0.08, 1.28, -0.52))
        set_rot(rig, "forearm.L", (1.58, 0, 0))
        set_rot(rig, "upper_arm.R", (-0.08, -1.2, 0.48))
        set_rot(rig, "forearm.R", (1.48, 0, 0))
        set_rot(rig, "thigh.L", (0.86, -0.98, -0.45))
        set_rot(rig, "shin.L", (1.34, 0, 0))
        set_rot(rig, "thigh.R", (0.72, 0.9, 0.58))
        set_rot(rig, "shin.R", (1.2, 0, 0))
        rig.location.z += 0.025 * math.sin(turn)
    elif clip == "cleanGetUp":
        release = phase * phase * (3 - 2 * phase)
        rig.location = (0, 0, 0.22 * (1 - release))
        rig.rotation_euler = (
            0.08 * (1 - release),
            math.radians(68) * (1 - release),
            -0.12 * (1 - release),
        )
        set_rot(rig, "upper_arm.L", (0.08, 1.28 * (1 - release), -0.52 * (1 - release)))
        set_rot(rig, "forearm.L", (1.58 * (1 - release), 0, 0))
        set_rot(rig, "upper_arm.R", (-0.08, -1.2 * (1 - release), 0.48 * (1 - release)))
        set_rot(rig, "forearm.R", (1.48 * (1 - release), 0, 0))
        set_rot(rig, "thigh.L", (0.86 * (1 - release), -0.98 * (1 - release), -0.45 * (1 - release)))
        set_rot(rig, "shin.L", (1.34 * (1 - release), 0, 0))
        set_rot(rig, "thigh.R", (0.72 * (1 - release), 0.9 * (1 - release), 0.58 * (1 - release)))
        set_rot(rig, "shin.R", (1.2 * (1 - release), 0, 0))


def animate(rig, scene):
    for clip, definition in CLIPS.items():
        scene.timeline_markers.new(definition["label"].upper(), frame=definition["start"])
        for index, phase in enumerate(SAMPLE_PHASES):
            frame = round(definition["start"] + phase * (definition["end"] - definition["start"]))
            reset_pose(rig)
            pose_clip(rig, clip, phase)
            rig.keyframe_insert("location", frame=frame, group=clip)
            rig.keyframe_insert("rotation_euler", frame=frame, group=clip)
            rig.keyframe_insert("scale", frame=frame, group=clip)
            for bone in rig.pose.bones:
                bone.keyframe_insert("location", frame=frame, group=clip)
                bone.keyframe_insert("rotation_euler", frame=frame, group=clip)
                bone.keyframe_insert("scale", frame=frame, group=clip)
    scene.frame_start = 1
    scene.frame_end = max(value["end"] for value in CLIPS.values())


def add_camera(scene):
    camera_data = bpy.data.cameras.new("GameThreeQuarterOrtho")
    camera = bpy.data.objects.new("GameThreeQuarterOrtho", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 5.6
    scene.camera = camera
    place_camera(camera, "threeQuarter")
    return camera


def place_camera(camera, view):
    positions = {
        "front": (0, -8.2, 3.4),
        "threeQuarter": (5.6, -7.2, 4.4),
        "mirrored": (-5.6, -7.2, 4.4),
    }
    camera.location = positions[view]
    target = Vector((0, 0, 1.0))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def configure_render(scene):
    scene.render.resolution_x = 384
    scene.render.resolution_y = 216
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.world.color = (0.008, 0.012, 0.035)
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    scene.display.shading.show_specular_highlight = False


def profile_visibility(profile_objects, active_profile):
    for profile, objects in profile_objects.items():
        hidden = profile != active_profile
        for obj in objects:
            obj.hide_render = hidden
            obj.hide_viewport = hidden


def export_pose_json(rig, scene, output_path):
    payload = {
        "schemaVersion": 2,
        "coordinateSystem": "Blender XYZ, Z-up",
        "fps": scene.render.fps,
        "topology": "biped",
        "profiles": list(PROFILE_NAMES),
        "sharedArmature": rig.name,
        "anchors": list(EXPORT_BONES),
        "clips": {},
    }
    for clip, definition in CLIPS.items():
        clip_frames = []
        for index, phase in enumerate(SAMPLE_PHASES):
            frame = round(definition["start"] + phase * (definition["end"] - definition["start"]))
            scene.frame_set(frame)
            bones = {}
            for name in EXPORT_BONES:
                pose_bone = rig.pose.bones[name]
                head = rig.matrix_world @ pose_bone.head
                tail = rig.matrix_world @ pose_bone.tail
                bones[name] = {
                    "head": [round(value, 6) for value in head],
                    "tail": [round(value, 6) for value in tail],
                    "length": round((tail - head).length, 6),
                }
            clip_frames.append({
                "frame": frame,
                "phase": phase,
                "contacts": definition["contacts"][index],
                "bones": bones,
            })
        payload["clips"][clip] = {
            "label": definition["label"],
            "range": [definition["start"], definition["end"]],
            "frames": clip_frames,
        }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def render_references(scene, camera, profile_objects, output_directory):
    os.makedirs(output_directory, exist_ok=True)
    for profile in PROFILE_NAMES:
        profile_visibility(profile_objects, profile)
        for clip, definition in CLIPS.items():
            scene.frame_set(round((definition["start"] + definition["end"]) / 2))
            place_camera(camera, "threeQuarter")
            scene.display.shading.color_type = "MATERIAL"
            scene.render.filepath = os.path.join(output_directory, f"{profile}-{clip}.png")
            bpy.ops.render.render(write_still=True)
            scene.display.shading.color_type = "SINGLE"
            scene.display.shading.single_color = (0.82, 0.82, 0.76)
            scene.render.filepath = os.path.join(output_directory, f"{profile}-{clip}-silhouette.png")
            bpy.ops.render.render(write_still=True)
        scene.frame_set(CLIPS["basicRock"]["start"])
        scene.display.shading.color_type = "MATERIAL"
        for view in ("front", "threeQuarter", "mirrored"):
            place_camera(camera, view)
            scene.render.filepath = os.path.join(output_directory, f"{profile}-turnaround-{view}.png")
            bpy.ops.render.render(write_still=True)
    scene.display.shading.color_type = "MATERIAL"
    profile_visibility(profile_objects, "kitty")
    place_camera(camera, "threeQuarter")


def main():
    options = parse_args()
    bpy.context.preferences.filepaths.save_version = 0
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    output = (
        os.path.abspath(os.path.join(project_root, options.output))
        if not os.path.isabs(options.output)
        else options.output
    )
    reference_directory = os.path.join(project_root, "tools/blender/reference/hero-rescue")
    json_output = os.path.join(project_root, "tools/blender/exports/kaki-hero-golden-chain.json")

    clear_scene()
    scene = bpy.context.scene
    scene.render.fps = 24
    rig = build_shared_biped()
    profile_objects = build_profile_parts(rig)
    add_floor_and_contacts()
    animate(rig, scene)
    camera = add_camera(scene)
    configure_render(scene)
    export_pose_json(rig, scene, json_output)
    render_references(scene, camera, profile_objects, reference_directory)
    scene.frame_set(CLIPS["windmill"]["start"] + 12)
    profile_visibility(profile_objects, "kitty")
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=output)
    print(f"KAKI_DANCE_SHARED_BIPED={output}")
    print(f"KAKI_DANCE_GOLDEN_CHAIN={json_output}")
    print(f"KAKI_DANCE_HERO_REFERENCES={reference_directory}")


if __name__ == "__main__":
    main()
