"""Render the actual weighted Blender heroes for the Flatfoot candidate atlas.

Usage:

    blender --background tools/blender/kaki-appalachian-frolic.blend \
      --python tools/blender/render_appalachian_frolic_candidate.py

Set ``KAKI_FROLIC_QUICK=1`` to render only the first/contact/last review frames.
The normal path renders every source frame at 512x512 transparent RGBA.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


RIG_NAME = "KakiFrolicProductionBiped"
HERO_COLLECTIONS = {
    "kitty": "Hero.KittyKaki",
    "soder": "Hero.Soter",
}


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def projected(scene, camera, value: Vector) -> list[float]:
    coordinate = world_to_camera_view(scene, camera, value)
    return [
        round(coordinate.x * scene.render.resolution_x, 3),
        round((1 - coordinate.y) * scene.render.resolution_y, 3),
    ]


def pose_point(rig: bpy.types.Object, bone_name: str, endpoint: str = "head") -> Vector:
    bone = rig.pose.bones[bone_name]
    local = bone.head if endpoint == "head" else bone.tail
    return rig.matrix_world @ local


def frame_diagnostics(scene, rig, contacts: list[dict], frame: int) -> dict:
    anchors = {
        "pelvis": projected(scene, scene.camera, pose_point(rig, "pelvis")),
        "chest": projected(scene, scene.camera, pose_point(rig, "chest")),
        "head": projected(scene, scene.camera, pose_point(rig, "head", "tail")),
        "leftShoulder": projected(scene, scene.camera, pose_point(rig, "upperArm.L")),
        "leftElbow": projected(scene, scene.camera, pose_point(rig, "forearm.L")),
        "leftHand": projected(scene, scene.camera, pose_point(rig, "hand.L", "tail")),
        "rightShoulder": projected(scene, scene.camera, pose_point(rig, "upperArm.R")),
        "rightElbow": projected(scene, scene.camera, pose_point(rig, "forearm.R")),
        "rightHand": projected(scene, scene.camera, pose_point(rig, "hand.R", "tail")),
        "leftHip": projected(scene, scene.camera, pose_point(rig, "thigh.L")),
        "leftKnee": projected(scene, scene.camera, pose_point(rig, "shin.L")),
        "leftHeel": projected(scene, scene.camera, pose_point(rig, "foot.L")),
        "leftToe": projected(scene, scene.camera, pose_point(rig, "toe.L", "tail")),
        "rightHip": projected(scene, scene.camera, pose_point(rig, "thigh.R")),
        "rightKnee": projected(scene, scene.camera, pose_point(rig, "shin.R")),
        "rightHeel": projected(scene, scene.camera, pose_point(rig, "foot.R")),
        "rightToe": projected(scene, scene.camera, pose_point(rig, "toe.R", "tail")),
    }
    pelvis_world = pose_point(rig, "pelvis")
    chest_world = pose_point(rig, "chest")
    center_of_mass = pelvis_world * 0.68 + chest_world * 0.32
    active_contact = None
    for contact in contacts:
        if contact["frame"] <= frame:
            active_contact = contact
    return {
        "sourceFrame": frame,
        "musicalTimestampSeconds": round((frame - 1) / scene.render.fps, 6),
        "anchors": anchors,
        "centerOfMass": projected(scene, scene.camera, center_of_mass),
        "support": active_contact["support"] if active_contact else "both",
        "contact": active_contact["contact"] if active_contact else "none",
        "freeFoot": active_contact["freeFoot"] if active_contact else "left",
    }


def selected_frames(start: int, end: int, contacts: list[dict], quick: bool) -> list[int]:
    if not quick:
        return list(range(start, end + 1))
    return sorted({start, end, *(int(contact["frame"]) for contact in contacts)})


def main() -> None:
    root = project_root()
    source_path = root / "tools" / "blender" / "kaki-appalachian-frolic.blend"
    output_root = root / "build" / "frolic-rescue-candidate-1" / "source-renders"
    output_root.mkdir(parents=True, exist_ok=True)
    quick = os.environ.get("KAKI_FROLIC_QUICK") == "1" or "--quick" in sys.argv

    scene = bpy.context.scene
    rig = bpy.data.objects[RIG_NAME]
    camera = bpy.data.objects["FrolicGameplayCamera"]
    scene.camera = camera
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.filepath = ""

    actions = sorted(
        (action for action in bpy.data.actions if action.name.startswith("FrolicCandidate.")),
        key=lambda action: action.name,
    )
    manifest = {
        "schemaVersion": 1,
        "candidateStatus": "human-review-required",
        "sourceBlend": str(source_path.relative_to(root)),
        "sourceHash": hashlib.sha256(source_path.read_bytes()).hexdigest(),
        "sourceFPS": scene.render.fps,
        "renderResolution": [scene.render.resolution_x, scene.render.resolution_y],
        "camera": camera.name,
        "cameraType": camera.data.type,
        "renderer": scene.render.engine,
        "quick": quick,
        "heroes": {},
    }

    rig.animation_data_create()
    for hero, collection_name in HERO_COLLECTIONS.items():
        for name in HERO_COLLECTIONS.values():
            bpy.data.collections[name].hide_render = name != collection_name
        hero_manifest = {"clips": {}}
        for action in actions:
            rig.animation_data.action = action
            clip_id = str(action["clipId"])
            start = int(action["frameStart"])
            end = int(action["frameEnd"])
            contacts = json.loads(str(action["contacts"]))
            frames = []
            clip_root = output_root / hero / clip_id
            clip_root.mkdir(parents=True, exist_ok=True)
            for frame in selected_frames(start, end, contacts, quick):
                scene.frame_set(frame)
                scene.render.filepath = str(clip_root / f"{frame:04d}.png")
                bpy.ops.render.render(write_still=True)
                diagnostic = frame_diagnostics(scene, rig, contacts, frame)
                diagnostic["file"] = str((clip_root / f"{frame:04d}.png").relative_to(root))
                frames.append(diagnostic)
            hero_manifest["clips"][clip_id] = {
                "action": action.name,
                "displayName": str(action["displayName"]),
                "frameRange": [start, end],
                "sourceFrames": end - start + 1,
                "durationSeconds": round((end - start) / scene.render.fps, 6),
                "contacts": contacts,
                "frames": frames,
            }
        manifest["heroes"][hero] = hero_manifest

    manifest_path = output_root.parent / ("quick-render-manifest.json" if quick else "render-manifest.json")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"KAKI_FROLIC_RENDER_MANIFEST={manifest_path}")
    print(f"KAKI_FROLIC_RENDER_QUICK={quick}")


if __name__ == "__main__":
    main()
