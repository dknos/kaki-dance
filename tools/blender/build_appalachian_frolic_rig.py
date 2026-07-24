"""Build the Appalachian Frolic shared-biped authoring source.

The checked-in runtime atlases are deliberate pixel cleanup, not raw Blender
renders. This file supplies one complete armature, foot/heel/toe controls,
Soder costume controls, three style actions, an orthographic camera, and a
deterministic anchor/contact export used for animation review.

Run from the repository root:

  blender --background --factory-startup \
    --python tools/blender/build_appalachian_frolic_rig.py
"""

from __future__ import annotations

import json
import os
import sys

import bpy
from mathutils import Matrix, Vector


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ART_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "art"))
if ART_DIR not in sys.path:
    sys.path.insert(0, ART_DIR)

from appalachian_pose_library import (  # noqa: E402
    BPM,
    CHARACTERS,
    CLIP_SPECS,
    STYLES,
    marker_for_phase,
    sample_frolic_clip,
)
from hero_pose_library import ANCHORS, SEGMENTS  # noqa: E402


PIXELS_PER_UNIT = 24
FPS = 24
OUTPUT_NAME = "kaki-appalachian-frolic.blend"
EXPORT_NAME = "kaki-appalachian-frolic-rig.json"

BONES = {
    "root": ("root", "pelvis"),
    "pelvis": ("rightHip", "leftHip"),
    "lowerSpine": ("pelvis", "spineMid"),
    "upperSpine": ("spineMid", "chest"),
    "neck": ("chest", "neck"),
    "head": ("neck", "head"),
    "clavicle.L": ("chest", "leftShoulder"),
    "upperArm.L": ("leftShoulder", "leftElbow"),
    "forearm.L": ("leftElbow", "leftWrist"),
    "hand.L": ("leftWrist", "leftHand"),
    "clavicle.R": ("chest", "rightShoulder"),
    "upperArm.R": ("rightShoulder", "rightElbow"),
    "forearm.R": ("rightElbow", "rightWrist"),
    "hand.R": ("rightWrist", "rightHand"),
    "thigh.L": ("leftHip", "leftKnee"),
    "shin.L": ("leftKnee", "leftAnkle"),
    "ankle.L": ("leftAnkle", "leftFoot"),
    "heel.L": ("leftHeel", "leftAnkle"),
    "toe.L": ("leftAnkle", "leftFoot"),
    "footIK.L": ("leftFoot", "leftFootIK"),
    "kneePole.L": ("leftKnee", "leftKneePole"),
    "thigh.R": ("rightHip", "rightKnee"),
    "shin.R": ("rightKnee", "rightAnkle"),
    "ankle.R": ("rightAnkle", "rightFoot"),
    "heel.R": ("rightHeel", "rightAnkle"),
    "toe.R": ("rightAnkle", "rightFoot"),
    "footIK.R": ("rightFoot", "rightFootIK"),
    "kneePole.R": ("rightKnee", "rightKneePole"),
    "costume.hood": ("neck", "costumeHood"),
    "costume.fabric": ("pelvis", "costumeFabric"),
}


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
        bpy.data.actions,
    ):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)


def derived_points(pose):
    anchors = pose["anchors"]
    pelvis = anchors["pelvis"]
    chest = anchors["chest"]
    result = dict(anchors)
    result["spineMid"] = (
        pelvis[0] * 0.52 + chest[0] * 0.48,
        pelvis[1] * 0.52 + chest[1] * 0.48,
    )
    for side, sign in (("left", 1), ("right", -1)):
        ankle = anchors[f"{side}Ankle"]
        foot = anchors[f"{side}Foot"]
        knee = anchors[f"{side}Knee"]
        result[f"{side}Heel"] = (ankle[0] - sign * 2.4, ankle[1] + 1.2)
        result[f"{side}FootIK"] = (foot[0] + sign * 2.0, foot[1])
        result[f"{side}KneePole"] = (knee[0] + sign * 4.0, knee[1] - 0.5)
    result["costumeHood"] = (anchors["head"][0], anchors["head"][1] - 4.0)
    result["costumeFabric"] = (pelvis[0], pelvis[1] + 7.0)
    return result


def point_depth(pose, name):
    if name.startswith("left"):
        segment = next((key for key in SEGMENTS if key.startswith("left") and name[4:] in key), "")
    elif name.startswith("right"):
        segment = next((key for key in SEGMENTS if key.startswith("right") and name[5:] in key), "")
    else:
        segment = "torso"
    return pose["depth"].get(segment, pose["depth"].get(name, 0.0))


def world_point(pose, name):
    point = derived_points(pose)[name]
    depth = point_depth(pose, name)
    return Vector(((point[0] - 48) / PIXELS_PER_UNIT, -depth * 0.12, (88 - point[1]) / PIXELS_PER_UNIT))


def bone_points(pose, bone_name):
    start_name, end_name = BONES[bone_name]
    return world_point(pose, start_name), world_point(pose, end_name)


def build_armature():
    rest = sample_frolic_clip("flatfoot", "walkingStep", 0, "kitty")
    data = bpy.data.armatures.new("KakiFrolicSharedBiped")
    rig = bpy.data.objects.new("KakiFrolicSharedBiped", data)
    bpy.context.collection.objects.link(rig)
    rig["topology"] = "biped"
    rig["profiles"] = ",".join(CHARACTERS)
    rig["styles"] = ",".join(STYLES)
    rig["plantContract"] = "board-space foot contacts"
    rig.show_in_front = True
    data.display_type = "STICK"
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name in BONES:
        head, tail = bone_points(rest, name)
        if (tail - head).length < 0.025:
            tail.z += 0.04
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = not name.startswith(("footIK", "kneePole", "costume"))
    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        if pose_bone.name.startswith(("footIK", "kneePole", "heel", "toe")):
            pose_bone.custom_shape_scale_xyz = (0.6, 0.6, 0.6)
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def material(name, color):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    value.roughness = 0.92
    return value


def add_costume_proxy(rig, character):
    collection = bpy.data.collections.new(f"{character.title()} Costume Proxy")
    bpy.context.scene.collection.children.link(collection)
    colors = (
        ((0.04, 0.07, 0.16, 1), (0.18, 0.48, 0.72, 1))
        if character == "kitty"
        else ((0.11, 0.45, 0.18, 1), (0.44, 0.72, 0.24, 1))
    )
    body_material = material(f"{character.title()} Body", colors[0])
    accent_material = material(f"{character.title()} Accent", colors[1])
    for bone_name in (
        "pelvis", "lowerSpine", "upperSpine", "head",
        "upperArm.L", "forearm.L", "hand.L", "upperArm.R", "forearm.R", "hand.R",
        "thigh.L", "shin.L", "ankle.L", "thigh.R", "shin.R", "ankle.R",
    ):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.18)
        value = bpy.context.object
        for target_collection in list(value.users_collection):
            target_collection.objects.unlink(value)
        collection.objects.link(value)
        value.name = f"{character.title()}.{bone_name}"
        value.data.materials.append(accent_material if bone_name == "head" else body_material)
        value.parent = rig
        value.parent_type = "BONE"
        value.parent_bone = bone_name
        value.scale = (1.35 if character == "soder" else 1.0,) * 3
        value["anatomy"] = "costume over shared biped"
    if character == "soder":
        for bone_name, label in (("costume.hood", "Snake Hood"), ("costume.fabric", "Padded Fabric Tail")):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.22)
            value = bpy.context.object
            for target_collection in list(value.users_collection):
                target_collection.objects.unlink(value)
            collection.objects.link(value)
            value.name = label
            value.data.materials.append(accent_material)
            value.parent = rig
            value.parent_type = "BONE"
            value.parent_bone = bone_name
            value["contactBearing"] = False


def pose_bone_to_points(rig, pose, bone_name):
    head, tail = bone_points(pose, bone_name)
    direction = tail - head
    length = max(0.025, direction.length)
    rest_length = max(0.025, rig.data.bones[bone_name].length)
    rotation = Vector((0, 1, 0)).rotation_difference(direction.normalized())
    rig.pose.bones[bone_name].matrix = (
        Matrix.Translation(head)
        @ rotation.to_matrix().to_4x4()
        @ Matrix.Diagonal((1.0, length / rest_length, 1.0, 1.0))
    )


def animate(rig):
    export = {
        "schemaVersion": 1,
        "topology": "biped",
        "sharedArmature": rig.name,
        "profiles": list(CHARACTERS),
        "styles": list(STYLES),
        "fps": FPS,
        "ppq": 96,
        "bones": list(BONES),
        "actions": {},
    }
    rig.animation_data_create()
    scene = bpy.context.scene
    longest_action = 1
    for style in STYLES:
        action = bpy.data.actions.new(f"Frolic.{style.title()}")
        rig.animation_data.action = action
        cursor = 1
        style_export = {}
        for clip_id, spec in CLIP_SPECS.items():
            count = max(3, round(spec["durationBeats"] * 60 / BPM * FPS) + 1)
            start = cursor
            end = start + count - 1
            scene.timeline_markers.new(f"{style.upper()}_{clip_id}", frame=start)
            frames = []
            for index in range(count):
                phase = index / (count - 1)
                frame = start + index
                pose = sample_frolic_clip(style, clip_id, phase, "kitty")
                for bone_name in BONES:
                    pose_bone_to_points(rig, pose, bone_name)
                    bone = rig.pose.bones[bone_name]
                    bone.keyframe_insert("location", frame=frame, group=bone_name)
                    bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone_name)
                    bone.keyframe_insert("scale", frame=frame, group=bone_name)
                frames.append({
                    "frame": frame,
                    "phase": round(phase, 6),
                    "contacts": list(pose["contacts"]),
                    "support": pose["support"],
                    "centerOfMass": [round(value, 4) for value in pose["centerOfMass"]],
                    "markers": list(marker_for_phase(clip_id, phase)),
                    "anchors": {
                        name: [round(value, 4) for value in pose["anchors"][name]]
                        for name in ANCHORS
                    },
                })
            style_export[clip_id] = {
                "range": [start, end],
                "durationBeats": spec["durationBeats"],
                "frames": frames,
            }
            cursor = end + 5
        export["actions"][style] = style_export
        longest_action = max(longest_action, cursor - 5)
    scene.frame_start = 1
    scene.frame_end = longest_action
    rig.animation_data.action = bpy.data.actions["Frolic.Flatfoot"]
    return export


def add_stage_guides(scene):
    floor_material = material("Resonant Board", (0.47, 0.22, 0.1, 1))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.45, -0.08), scale=(3.4, 1.2, 0.08))
    board = bpy.context.object
    board.name = "ResonantDanceBoard"
    board.data.materials.append(floor_material)
    camera_data = bpy.data.cameras.new("FrolicOrthoCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 4.25
    camera = bpy.data.objects.new("FrolicOrthoCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, -10, 2.0)
    target = Vector((0, 0, 1.65))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    scene.render.resolution_x = 384
    scene.render.resolution_y = 216
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.world.color = (0.01, 0.025, 0.022)


def main():
    root = project_root()
    output = os.path.join(root, "tools", "blender", OUTPUT_NAME)
    export_path = os.path.join(root, "tools", "blender", "exports", EXPORT_NAME)
    clear_scene()
    rig = build_armature()
    add_costume_proxy(rig, "kitty")
    add_costume_proxy(rig, "soder")
    export = animate(rig)
    add_stage_guides(bpy.context.scene)
    os.makedirs(os.path.dirname(export_path), exist_ok=True)
    with open(export_path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(export, handle, indent=2)
        handle.write("\n")
    bpy.ops.wm.save_as_mainfile(filepath=output)
    print(f"KAKI_FROLIC_BLEND={output}")
    print(f"KAKI_FROLIC_EXPORT={export_path}")


if __name__ == "__main__":
    main()
