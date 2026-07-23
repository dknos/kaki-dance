"""Build the offline Kaki power-move proxy and deterministic reference passes.

Run:
  blender --background --factory-startup \
    --python tools/blender/build_kaki_proxy.py -- \
    --output tools/blender/kaki-power-proxy.blend
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector


CLIPS = {
    "backspin": {"start": 1, "mid": 13, "end": 25, "contacts": ["back"]},
    "swipe": {"start": 31, "mid": 43, "end": 55, "contacts": ["paws", "feet"]},
    "windmill": {"start": 61, "mid": 73, "end": 85, "contacts": ["shoulders", "back", "paw"]},
    "flare": {"start": 91, "mid": 103, "end": 115, "contacts": ["alternatingPaws"]},
    "headspin": {"start": 121, "mid": 133, "end": 145, "contacts": ["head", "optionalPawTaps"]},
}


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="tools/blender/kaki-power-proxy.blend")
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.armatures, bpy.data.meshes, bpy.data.materials, bpy.data.cameras):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name, color, metallic=0.0, roughness=0.75):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1)
    value.metallic = metallic
    value.roughness = roughness
    return value


def build_armature():
    data = bpy.data.armatures.new("KakiProxyRig")
    rig = bpy.data.objects.new("KakiProxyRig", data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    rig.show_in_front = True
    rig.rotation_mode = "XYZ"
    rig.data.display_type = "STICK"
    bpy.ops.object.mode_set(mode="EDIT")

    bones = {}

    def add(name, head, tail, parent=None):
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = bones[parent]
        bones[name] = bone
        return bone

    add("root", (0, 0, 0), (0, 0, 0.35))
    add("pelvis", (0, 0, 0.55), (0, 0, 1.0), "root")
    add("chest", (0, 0, 1.0), (0, 0, 1.62), "pelvis")
    add("head", (0, 0, 1.62), (0, 0, 2.25), "chest")
    add("ear.L", (-0.22, 0, 2.12), (-0.42, 0, 2.52), "head")
    add("ear.R", (0.22, 0, 2.12), (0.42, 0, 2.52), "head")
    add("tail", (0, 0.15, 0.72), (0, 0.72, 0.28), "pelvis")

    add("upper_arm.L", (-0.22, 0, 1.52), (-0.72, 0, 1.23), "chest")
    add("forearm.L", (-0.72, 0, 1.23), (-1.08, 0, 0.84), "upper_arm.L")
    add("paw.L", (-1.08, 0, 0.84), (-1.24, 0, 0.68), "forearm.L")
    add("upper_arm.R", (0.22, 0, 1.52), (0.72, 0, 1.23), "chest")
    add("forearm.R", (0.72, 0, 1.23), (1.08, 0, 0.84), "upper_arm.R")
    add("paw.R", (1.08, 0, 0.84), (1.24, 0, 0.68), "forearm.R")

    add("thigh.L", (-0.18, 0, 0.78), (-0.42, 0, 0.35), "pelvis")
    add("shin.L", (-0.42, 0, 0.35), (-0.45, 0, -0.08), "thigh.L")
    add("foot.L", (-0.45, 0, -0.08), (-0.72, -0.2, -0.08), "shin.L")
    add("thigh.R", (0.18, 0, 0.78), (0.42, 0, 0.35), "pelvis")
    add("shin.R", (0.42, 0, 0.35), (0.45, 0, -0.08), "thigh.R")
    add("foot.R", (0.45, 0, -0.08), (0.72, -0.2, -0.08), "shin.R")

    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def add_proxy_parts(rig):
    ink = material("Deep Navy", (0.025, 0.03, 0.09))
    hoodie = material("Hoodie", (0.06, 0.075, 0.17))
    fur = material("Plush Fur", (0.91, 0.83, 0.68))
    hair = material("Kaki Blue", (0.08, 0.45, 0.72))
    accent = material("Contact Accent", (0.95, 0.17, 0.08), metallic=0.1)

    def part(name, bone, scale, value):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
        obj = bpy.context.object
        obj.name = name
        obj.scale = scale
        obj.data.materials.append(value)
        obj.parent = rig
        obj.parent_type = "BONE"
        obj.parent_bone = bone
        obj.location = (0, 0, 0)
        return obj

    part("HoodieMass", "chest", (0.52, 0.34, 0.48), hoodie)
    part("LowerHoodie", "pelvis", (0.48, 0.32, 0.38), hoodie)
    part("OversizedHead", "head", (0.62, 0.46, 0.56), fur)
    part("HairCap", "head", (0.65, 0.48, 0.25), hair).location.z = 0.28
    part("Ear.L", "ear.L", (0.16, 0.1, 0.28), hair)
    part("Ear.R", "ear.R", (0.16, 0.1, 0.28), hair)
    part("Tail", "tail", (0.16, 0.16, 0.48), hoodie)

    for side in ("L", "R"):
        part(f"UpperArm.{side}", f"upper_arm.{side}", (0.16, 0.16, 0.34), hoodie)
        part(f"Forearm.{side}", f"forearm.{side}", (0.14, 0.14, 0.3), hoodie)
        part(f"Paw.{side}", f"paw.{side}", (0.22, 0.18, 0.14), fur)
        part(f"Thigh.{side}", f"thigh.{side}", (0.2, 0.2, 0.36), ink)
        part(f"Shin.{side}", f"shin.{side}", (0.17, 0.17, 0.34), ink)
        part(f"Foot.{side}", f"foot.{side}", (0.3, 0.18, 0.13), fur)

    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=3.2, depth=0.08, location=(0, 0, -0.12))
    floor = bpy.context.object
    floor.name = "CypherFloor"
    floor.data.materials.append(ink)
    for x, y in [(-1.2, 0), (1.2, 0), (0, 0.45)]:
        bpy.ops.mesh.primitive_torus_add(major_radius=0.14, minor_radius=0.025, location=(x, y, -0.055))
        marker = bpy.context.object
        marker.name = f"ContactMarker.{x:+.1f}.{y:+.1f}"
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


def pose_clip(rig, clip, phase):
    turn = phase * math.tau
    if clip == "backspin":
        rig.location = (0, 0, 0.7)
        rig.rotation_euler = (math.radians(78), 0, turn)
        set_rot(rig, "thigh.L", (0, -0.7, -0.65))
        set_rot(rig, "thigh.R", (0, 0.7, 0.65))
    elif clip == "swipe":
        rig.location = (0, 0, 0.28 + 0.18 * math.sin(turn))
        rig.rotation_euler = (0.45 * math.sin(turn), 0.2, turn)
        set_rot(rig, "upper_arm.L", (0, 0.9, -0.45))
        set_rot(rig, "upper_arm.R", (0, -0.9, 0.45))
        set_rot(rig, "thigh.L", (0, -0.85, turn))
        set_rot(rig, "thigh.R", (0, 0.85, turn + math.pi))
    elif clip == "windmill":
        rig.location = (0, 0, 0.7)
        rig.rotation_euler = (math.radians(72), 0.28 * math.sin(turn), turn)
        set_rot(rig, "thigh.L", (0, -0.95, -0.72))
        set_rot(rig, "thigh.R", (0, 0.95, 0.72))
        set_rot(rig, "upper_arm.L", (0, 0.7, -0.9))
        set_rot(rig, "upper_arm.R", (0, -0.7, 0.9))
    elif clip == "flare":
        rig.location = (0, 0, 0.18 + 0.08 * math.sin(turn * 2))
        rig.rotation_euler = (0.12, 0.2 * math.sin(turn), turn * 0.35)
        set_rot(rig, "thigh.L", (0, -1.12, turn))
        set_rot(rig, "thigh.R", (0, 1.12, turn + math.pi))
        set_rot(rig, "upper_arm.L", (0, 0.85, -0.35 * math.sin(turn)))
        set_rot(rig, "upper_arm.R", (0, -0.85, 0.35 * math.sin(turn)))
    elif clip == "headspin":
        rig.location = (0, 0, 2.35)
        rig.rotation_euler = (math.pi, 0, turn)
        set_rot(rig, "thigh.L", (0, -0.65, -0.42))
        set_rot(rig, "thigh.R", (0, 0.65, 0.42))
        set_rot(rig, "upper_arm.L", (0, 0.45, -0.65))
        set_rot(rig, "upper_arm.R", (0, -0.45, 0.65))


def animate(rig, scene):
    frames_by_clip = {}
    for clip, definition in CLIPS.items():
        scene.timeline_markers.new(clip.upper(), frame=definition["start"])
        frames = [
            definition["start"],
            (definition["start"] + definition["mid"]) // 2,
            definition["mid"],
            (definition["mid"] + definition["end"]) // 2,
            definition["end"],
        ]
        frames_by_clip[clip] = frames
        for index, frame in enumerate(frames):
            reset_pose(rig)
            pose_clip(rig, clip, index / (len(frames) - 1))
            rig.keyframe_insert("location", frame=frame, group=clip)
            rig.keyframe_insert("rotation_euler", frame=frame, group=clip)
            rig.keyframe_insert("scale", frame=frame, group=clip)
            for bone in rig.pose.bones:
                bone.keyframe_insert("location", frame=frame, group=clip)
                bone.keyframe_insert("rotation_euler", frame=frame, group=clip)
                bone.keyframe_insert("scale", frame=frame, group=clip)
    scene.frame_start = 1
    scene.frame_end = 145
    return frames_by_clip


def add_camera(scene):
    camera_data = bpy.data.cameras.new("ThreeQuarterOrtho")
    camera = bpy.data.objects.new("ThreeQuarterOrtho", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (5.6, -7.2, 4.7)
    target = Vector((0, 0, 1.0))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 6.0
    scene.camera = camera


def configure_render(scene):
    scene.render.resolution_x = 384
    scene.render.resolution_y = 216
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.012, 0.015, 0.045)
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    scene.display.shading.show_specular_highlight = False
    scene.render.image_settings.color_mode = "RGBA"


def export_pose_json(rig, scene, output_path):
    payload = {
        "schemaVersion": 1,
        "coordinateSystem": "Blender XYZ, Z-up",
        "fps": scene.render.fps,
        "clips": {},
    }
    for clip, definition in CLIPS.items():
        clip_frames = []
        for frame in [definition["start"], definition["mid"], definition["end"]]:
            scene.frame_set(frame)
            bones = {}
            for name in [
                "root", "pelvis", "chest", "head", "paw.L", "paw.R",
                "thigh.L", "thigh.R", "foot.L", "foot.R", "tail",
            ]:
                pose_bone = rig.pose.bones[name]
                head = rig.matrix_world @ pose_bone.head
                tail = rig.matrix_world @ pose_bone.tail
                bones[name] = {
                    "head": [round(value, 6) for value in head],
                    "tail": [round(value, 6) for value in tail],
                }
            clip_frames.append({"frame": frame, "phase": (frame - definition["start"]) / (definition["end"] - definition["start"]), "bones": bones})
        payload["clips"][clip] = {
            "range": [definition["start"], definition["end"]],
            "contactsStudied": definition["contacts"],
            "frames": clip_frames,
        }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def render_references(scene, output_directory):
    os.makedirs(output_directory, exist_ok=True)
    for clip, definition in CLIPS.items():
        scene.frame_set(definition["mid"])
        scene.render.filepath = os.path.join(output_directory, f"{clip}.png")
        bpy.ops.render.render(write_still=True)


def main():
    options = args()
    bpy.context.preferences.filepaths.save_version = 0
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    output = os.path.abspath(os.path.join(project_root, options.output)) if not os.path.isabs(options.output) else options.output
    reference_directory = os.path.join(project_root, "tools/blender/reference")
    json_output = os.path.join(project_root, "tools/blender/exports/kaki-power-reference.json")

    clear_scene()
    scene = bpy.context.scene
    scene.render.fps = 24
    rig = build_armature()
    add_proxy_parts(rig)
    animate(rig, scene)
    add_camera(scene)
    configure_render(scene)
    export_pose_json(rig, scene, json_output)
    render_references(scene, reference_directory)
    scene.frame_set(CLIPS["windmill"]["mid"])
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=output)
    print(f"KAKI_DANCE_PROXY={output}")
    print(f"KAKI_DANCE_POSES={json_output}")
    print(f"KAKI_DANCE_REFERENCES={reference_directory}")


if __name__ == "__main__":
    main()
