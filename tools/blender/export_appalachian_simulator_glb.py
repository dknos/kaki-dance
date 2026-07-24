"""Export the live Appalachian simulator gate from the authoritative blend.

The export contains one armature, both weighted hero mesh sets, and every
grounded/recovery/jump action in the Blender source. Runtime character switching
changes mesh visibility; it never swaps to a different skeleton.

Run from the repository root:

    blender --background tools/blender/kaki-appalachian-frolic.blend \
      --python tools/blender/export_appalachian_simulator_glb.py
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import bpy


RIG_NAME = "KakiFrolicProductionBiped"
HERO_COLLECTIONS = ("Hero.KittyKaki", "Hero.Soter")
OUTPUT_NAME = "kaki-appalachian-simulator.glb"

# These are authored pose-field samples, not raw stick-to-bone mappings. The
# browser blends nearby samples and clamps the style's permitted contribution.
ARM_POSE_FIELD = [
    {
        "id": "relaxed-low", "point": [0.0, -0.18],
        "chest": [0, 0, 0],
        "left": {"upperArm": [3, -6, -8], "forearm": [-9, 2, 3], "hand": [0, 0, 0]},
        "right": {"upperArm": [-3, 6, 8], "forearm": [9, -2, -3], "hand": [0, 0, 0]},
    },
    {
        "id": "hands-near-hips", "point": [0.0, -1.0],
        "chest": [2, 0, 0],
        "left": {"upperArm": [12, -16, -14], "forearm": [-28, 5, 10], "hand": [8, 0, -5]},
        "right": {"upperArm": [-12, 16, 14], "forearm": [28, -5, -10], "hand": [-8, 0, 5]},
    },
    {
        "id": "open-low-left", "point": [-1.0, -0.58],
        "chest": [0, -5, -8],
        "left": {"upperArm": [18, -20, -36], "forearm": [-18, 6, 12], "hand": [6, 0, -8]},
        "right": {"upperArm": [-5, 10, 18], "forearm": [12, -3, -6], "hand": [-3, 0, 4]},
    },
    {
        "id": "open-low-right", "point": [1.0, -0.58],
        "chest": [0, 5, 8],
        "left": {"upperArm": [5, -10, -18], "forearm": [-12, 3, 6], "hand": [3, 0, -4]},
        "right": {"upperArm": [-18, 20, 36], "forearm": [18, -6, -12], "hand": [-6, 0, 8]},
    },
    {
        "id": "cross-body-left", "point": [-1.0, 0.05],
        "chest": [0, -8, -12],
        "left": {"upperArm": [28, -26, -58], "forearm": [-34, 8, 18], "hand": [10, 0, -10]},
        "right": {"upperArm": [-14, 14, 30], "forearm": [20, -5, -10], "hand": [-5, 0, 6]},
    },
    {
        "id": "cross-body-right", "point": [1.0, 0.05],
        "chest": [0, 8, 12],
        "left": {"upperArm": [14, -14, -30], "forearm": [-20, 5, 10], "hand": [5, 0, -6]},
        "right": {"upperArm": [-28, 26, 58], "forearm": [34, -8, -18], "hand": [-10, 0, 10]},
    },
    {
        "id": "diagonal-reach-left", "point": [-0.72, 0.72],
        "chest": [-2, -7, -9],
        "left": {"upperArm": [50, -28, -72], "forearm": [-20, 7, 14], "hand": [8, 0, -8]},
        "right": {"upperArm": [-26, 18, 42], "forearm": [24, -5, -12], "hand": [-6, 0, 6]},
    },
    {
        "id": "diagonal-reach-right", "point": [0.72, 0.72],
        "chest": [-2, 7, 9],
        "left": {"upperArm": [26, -18, -42], "forearm": [-24, 5, 12], "hand": [6, 0, -6]},
        "right": {"upperArm": [-50, 28, 72], "forearm": [20, -7, -14], "hand": [-8, 0, 8]},
    },
    {
        "id": "both-arms-high", "point": [0.0, 1.0],
        "chest": [-4, 0, 0],
        "left": {"upperArm": [62, -24, -62], "forearm": [-18, 5, 14], "hand": [8, 0, -6]},
        "right": {"upperArm": [-62, 24, 62], "forearm": [18, -5, -14], "hand": [-8, 0, 6]},
    },
]


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    root = project_root()
    source = root / "tools" / "blender" / "kaki-appalachian-frolic.blend"
    output_dir = root / "assets" / "models" / "appalachian"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / OUTPUT_NAME
    manifest_path = output_dir / "simulator-manifest.json"

    rig = bpy.data.objects[RIG_NAME]
    actions = sorted(
        (action for action in bpy.data.actions if action.name.startswith("FrolicCandidate.")),
        key=lambda value: str(value["clipId"]),
    )
    if len(actions) != 23:
        raise RuntimeError(f"Expected 23 simulator actions, found {len(actions)}")

    bpy.ops.object.select_all(action="DESELECT")
    rig.hide_set(False)
    rig.hide_render = False
    rig.select_set(True)
    for collection_name in HERO_COLLECTIONS:
        collection = bpy.data.collections[collection_name]
        collection.hide_render = False
        collection.hide_viewport = False
        # Reparenting changes collection.all_objects' live traversal order, so
        # freeze the list before applying the glTF skin-parent contract.
        for obj in list(collection.all_objects):
            if obj is None:
                continue
            obj.hide_set(False)
            obj.hide_render = False
            if obj.type == "MESH":
                # Blender renders armature modifiers without object parenting,
                # but glTF requires the armature to be the skinned mesh parent.
                # Preserve the authored world transform while satisfying that
                # export contract in this transient export session.
                world_matrix = obj.matrix_world.copy()
                obj.parent = rig
                obj.matrix_world = world_matrix
                obj["simulatorCharacter"] = "kitty" if obj.name.startswith("KittyKaki.") else "soder"
            obj.select_set(True)
    bpy.context.view_layer.update()
    rig["candidateStatus"] = "CANDIDATE — HUMAN REVIEW REQUIRED"
    rig["armPoseField"] = json.dumps(ARM_POSE_FIELD, separators=(",", ":"))
    rig["supportCapableBones"] = "foot.L,foot.R"
    rig["tailSupportEligible"] = False
    bpy.context.view_layer.objects.active = rig

    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_range=True,
        export_anim_single_armature=True,
        export_reset_pose_bones=True,
        export_skins=True,
        export_def_bones=False,
        export_influence_nb=4,
        export_all_influences=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )

    manifest = {
        "schemaVersion": 1,
        "candidateStatus": "CANDIDATE — HUMAN REVIEW REQUIRED",
        "sourceBlend": source.relative_to(root).as_posix(),
        "sourceBlendSha256": sha256(source),
        "glb": output.relative_to(root).as_posix(),
        "glbSha256": sha256(output),
        "glbBytes": output.stat().st_size,
        "threeRuntime": {
            "loader": "GLTFLoader",
            "characterType": "SkinnedMesh",
            "animation": "AnimationMixer plus contact-aware performance controller",
            "candidateBackend": "WebGL2",
            "webgpu": "capability-gated future path; not allowed to delay Gate 1",
        },
        "sharedSkeleton": RIG_NAME,
        "characters": ["kitty", "soder"],
        "supportCapableBones": ["foot.L", "foot.R"],
        "excludedSupportBones": ["costume.tail", "costume.hood"],
        "footBasis": {
            "localForwardAxis": "+Y",
            "blenderDancerForward": [0, -1, 0],
            "gltfDancerForward": [0, 0, 1],
            "plantedToeForwardDotMin": 0.78,
            "footBones": ["foot.L", "foot.R"],
            "toeBones": ["toe.L", "toe.R"],
            "sourceRepair": (
                "foot deform bones keep connected ankle positions without "
                "inheriting shin IK pole twist"
            ),
            "shoeMirroring": (
                "reflected vertices, reversed winding, positive applied transforms"
            ),
            "validation": json.loads(str(rig["footBasisValidation"])),
        },
        "sourceFps": bpy.context.scene.render.fps,
        "actions": {
            str(action["clipId"]): {
                "name": action.name,
                "displayName": str(action["displayName"]),
                "frameRange": [int(action["frameStart"]), int(action["frameEnd"])],
                "contacts": json.loads(str(action["contacts"])),
                "anatomicalMirrorOf": str(action.get("anatomicalMirrorOf", "")),
                "toeForwardExemptions": json.loads(str(action.get("toeForwardExemptions", "[]"))),
                "movementProvenance": str(action.get("movementProvenance", "")),
                "humanReviewStatus": str(action.get("humanReviewStatus", "")),
                "candidateStatus": str(action["candidateStatus"]),
            }
            for action in actions
        },
        "gateCounts": {
            "actions": len(actions),
            "groundedMovements": 8,
            "goldenPairedGestures": 10,
            "jumpPrototypes": 3,
            "recoveryActions": 1,
            "armPoseSamples": len(ARM_POSE_FIELD),
        },
        "armPoseField": ARM_POSE_FIELD,
        "approval": {
            "automated": False,
            "required": [
                "dance weight and appeal",
                "Appalachian practitioner and terminology review",
                "both-hero anatomy and costume deformation",
                "footwear Foley taste",
                "control feel and fun",
            ],
        },
    }
    manifest_path.write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"KAKI_SIMULATOR_GLB={output}")
    print(f"KAKI_SIMULATOR_MANIFEST={manifest_path}")
    print(f"KAKI_SIMULATOR_GLB_BYTES={output.stat().st_size}")
    print(f"KAKI_SIMULATOR_ACTIONS={len(actions)}")


if __name__ == "__main__":
    main()
