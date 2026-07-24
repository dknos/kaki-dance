"""Build the Frolic rescue candidate as a real, rendered Blender source.

This is deliberately not the old anchor/capsule proof.  It creates:

* one shared deforming biped armature;
* weighted KittyKaki and Soter character meshes;
* foot IK, knee poles, heel, ball, toe, pelvis, spine, clavicle and hand controls;
* eight hand-keyed Flatfoot actions at 30 fps;
* a fixed three-quarter orthographic gameplay camera;
* toon materials, stable lighting and deterministic RGBA render settings.

The companion ``render_appalachian_frolic_candidate.py`` opens the resulting
blend and renders the actual Blender character.  Pillow is not involved in
creating character pixels.

Run from the repository root:

    blender --background --factory-startup \
      --python tools/blender/build_appalachian_frolic_rig.py
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


FPS = 30
BPM = 120
OUTPUT_NAME = "kaki-appalachian-frolic.blend"
EXPORT_NAME = "kaki-appalachian-frolic-production.json"
RIG_NAME = "KakiFrolicProductionBiped"
CAMERA_NAME = "FrolicGameplayCamera"


REST = {
    "root": ((0.0, 0.0, 0.0), (0.0, 0.0, 0.35)),
    "pelvis": ((0.0, 0.0, 2.42), (0.0, 0.0, 2.92)),
    "spine": ((0.0, 0.0, 2.72), (0.0, 0.0, 3.62)),
    "chest": ((0.0, 0.0, 3.55), (0.0, 0.0, 4.18)),
    "neck": ((0.0, 0.0, 4.12), (0.0, 0.0, 4.42)),
    "head": ((0.0, 0.0, 4.34), (0.0, 0.0, 5.32)),
    "clavicle.L": ((0.0, 0.0, 4.0), (0.72, 0.0, 3.98)),
    "upperArm.L": ((0.72, 0.0, 3.98), (1.14, -0.03, 3.06)),
    "forearm.L": ((1.14, -0.03, 3.06), (1.18, -0.18, 2.27)),
    "hand.L": ((1.18, -0.18, 2.27), (1.2, -0.30, 1.88)),
    "clavicle.R": ((0.0, 0.0, 4.0), (-0.72, 0.0, 3.98)),
    "upperArm.R": ((-0.72, 0.0, 3.98), (-1.14, 0.03, 3.06)),
    "forearm.R": ((-1.14, 0.03, 3.06), (-1.18, -0.10, 2.27)),
    "hand.R": ((-1.18, -0.10, 2.27), (-1.2, -0.22, 1.88)),
    "thigh.L": ((0.42, 0.0, 2.48), (0.48, 0.0, 1.42)),
    "shin.L": ((0.48, 0.0, 1.42), (0.5, 0.0, 0.38)),
    "foot.L": ((0.5, 0.0, 0.38), (0.5, -0.46, 0.26)),
    "toe.L": ((0.5, -0.46, 0.26), (0.5, -0.88, 0.23)),
    "thigh.R": ((-0.42, 0.0, 2.48), (-0.48, 0.0, 1.42)),
    "shin.R": ((-0.48, 0.0, 1.42), (-0.5, 0.0, 0.38)),
    "foot.R": ((-0.5, 0.0, 0.38), (-0.5, -0.46, 0.26)),
    "toe.R": ((-0.5, -0.46, 0.26), (-0.5, -0.88, 0.23)),
}

DEFORM_PARENTS = {
    "pelvis": "root",
    "spine": "pelvis",
    "chest": "spine",
    "neck": "chest",
    "head": "neck",
    "clavicle.L": "chest",
    "upperArm.L": "clavicle.L",
    "forearm.L": "upperArm.L",
    "hand.L": "forearm.L",
    "clavicle.R": "chest",
    "upperArm.R": "clavicle.R",
    "forearm.R": "upperArm.R",
    "hand.R": "forearm.R",
    "thigh.L": "pelvis",
    "shin.L": "thigh.L",
    "foot.L": "shin.L",
    "toe.L": "foot.L",
    "thigh.R": "pelvis",
    "shin.R": "thigh.R",
    "foot.R": "shin.R",
    "toe.R": "foot.R",
}

CONTROL_BONES = {
    "CTRL.root": ((0.0, 0.0, 0.0), (0.0, -0.72, 0.0)),
    "CTRL.pelvis": ((0.0, -0.28, 2.48), (0.0, -0.88, 2.48)),
    "CTRL.chest": ((0.0, -0.25, 3.85), (0.0, -0.78, 3.85)),
    "footIK.L": ((0.5, 0.0, 0.38), (0.5, -0.56, 0.38)),
    "footIK.R": ((-0.5, 0.0, 0.38), (-0.5, -0.56, 0.38)),
    "kneePole.L": ((0.52, -1.8, 1.44), (0.52, -2.18, 1.44)),
    "kneePole.R": ((-0.52, -1.8, 1.44), (-0.52, -2.18, 1.44)),
    "heelPivot.L": ((0.5, 0.12, 0.2), (0.5, -0.12, 0.2)),
    "heelPivot.R": ((-0.5, 0.12, 0.2), (-0.5, -0.12, 0.2)),
    "ballPivot.L": ((0.5, -0.46, 0.18), (0.5, -0.72, 0.18)),
    "ballPivot.R": ((-0.5, -0.46, 0.18), (-0.5, -0.72, 0.18)),
    "toePivot.L": ((0.5, -0.84, 0.18), (0.5, -1.08, 0.18)),
    "toePivot.R": ((-0.5, -0.84, 0.18), (-0.5, -1.08, 0.18)),
    "handIK.L": ((1.2, -0.3, 1.88), (1.2, -0.68, 1.88)),
    "handIK.R": ((-1.2, -0.22, 1.88), (-1.2, -0.6, 1.88)),
    "costume.hood": ((0.0, 0.15, 4.72), (0.0, 0.15, 5.2)),
    "costume.tail": ((0.0, 0.32, 2.55), (0.0, 0.86, 2.28)),
}

PALETTES = {
    "kitty": {
        "cream": (0.86, 0.70, 0.58, 1),
        "cream_near": (0.98, 0.86, 0.72, 1),
        "cream_far": (0.69, 0.56, 0.49, 1),
        "cyan": (0.02, 0.50, 0.82, 1),
        "cyan_light": (0.08, 0.68, 0.94, 1),
        "navy": (0.018, 0.024, 0.07, 1),
        "navy_near": (0.045, 0.06, 0.15, 1),
        "navy_far": (0.012, 0.016, 0.045, 1),
        "white": (0.92, 0.88, 0.80, 1),
        "eye": (0.018, 0.045, 0.10, 1),
        "blush": (0.52, 0.06, 0.08, 1),
    },
    "soter": {
        "green": (0.28, 0.55, 0.12, 1),
        "green_near": (0.43, 0.72, 0.20, 1),
        "green_far": (0.16, 0.37, 0.08, 1),
        "green_dark": (0.16, 0.34, 0.06, 1),
        "belly": (0.43, 0.25, 0.10, 1),
        "belly_light": (0.62, 0.39, 0.17, 1),
        "pink": (0.86, 0.22, 0.42, 1),
        "cream": (0.88, 0.72, 0.60, 1),
        "cyan": (0.02, 0.50, 0.82, 1),
        "eye": (0.012, 0.02, 0.04, 1),
        "white": (0.96, 0.92, 0.82, 1),
        "blush": (0.52, 0.06, 0.08, 1),
    },
}


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.armatures,
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.actions,
    ):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def make_material(name: str, rgba: tuple[float, float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = 0.92
    bsdf.inputs["Specular IOR Level"].default_value = 0.18
    material["toonCandidate"] = True
    return material


def build_materials() -> dict[str, bpy.types.Material]:
    values: dict[str, bpy.types.Material] = {}
    for character, palette in PALETTES.items():
        for key, color in palette.items():
            values[f"{character}.{key}"] = make_material(f"{character.title()}.{key}", color)
    return values


def build_armature() -> bpy.types.Object:
    data = bpy.data.armatures.new(RIG_NAME)
    rig = bpy.data.objects.new(RIG_NAME, data)
    bpy.context.scene.collection.objects.link(rig)
    rig.show_in_front = True
    rig["topology"] = "weighted-biped"
    rig["candidateStatus"] = "human-review-required"
    rig["frameRate"] = FPS
    rig["footSystem"] = "IK plus heel, ball and toe pivot controls"
    rig["profiles"] = "KittyKaki,Soter"

    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit = {}
    for name, (head, tail) in REST.items():
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = True
        edit[name] = bone
    for name, parent in DEFORM_PARENTS.items():
        edit[name].parent = edit[parent]
        edit[name].use_connect = name not in {
            "pelvis", "clavicle.L", "clavicle.R", "thigh.L", "thigh.R"
        }
    for name, (head, tail) in CONTROL_BONES.items():
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = False
        edit[name] = bone
    edit["CTRL.pelvis"].parent = edit["CTRL.root"]
    edit["CTRL.chest"].parent = edit["CTRL.pelvis"]
    for side in ("L", "R"):
        edit[f"footIK.{side}"].parent = edit["CTRL.root"]
        edit[f"kneePole.{side}"].parent = edit["CTRL.root"]
        edit[f"heelPivot.{side}"].parent = edit[f"footIK.{side}"]
        edit[f"ballPivot.{side}"].parent = edit[f"heelPivot.{side}"]
        edit[f"toePivot.{side}"].parent = edit[f"ballPivot.{side}"]
        edit[f"handIK.{side}"].parent = edit["CTRL.chest"]
    edit["costume.hood"].parent = edit["head"]
    edit["costume.tail"].parent = edit["pelvis"]
    bpy.ops.object.mode_set(mode="POSE")

    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    for side in ("L", "R"):
        constraint = rig.pose.bones[f"shin.{side}"].constraints.new("IK")
        constraint.name = f"Leg IK {side}"
        constraint.target = rig
        constraint.subtarget = f"footIK.{side}"
        constraint.pole_target = rig
        constraint.pole_subtarget = f"kneePole.{side}"
        constraint.chain_count = 2
        constraint.use_stretch = False
        rig.pose.bones[f"foot.{side}"]["heelControl"] = f"heelPivot.{side}"
        rig.pose.bones[f"foot.{side}"]["ballControl"] = f"ballPivot.{side}"
        rig.pose.bones[f"toe.{side}"]["toeControl"] = f"toePivot.{side}"
    rig.pose.bones["pelvis"]["primaryControl"] = "CTRL.pelvis"
    rig.pose.bones["chest"]["primaryControl"] = "CTRL.chest"
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    return rig


def link_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for source in list(obj.users_collection):
        source.objects.unlink(obj)
    collection.objects.link(obj)


def mesh_object(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def add_armature_modifier(
    obj: bpy.types.Object,
    rig: bpy.types.Object,
    weights: dict[str, list[tuple[int, float]]],
) -> None:
    for bone_name, assignments in weights.items():
        group = obj.vertex_groups.new(name=bone_name)
        for index, value in assignments:
            group.add([index], value, "REPLACE")
    modifier = obj.modifiers.new("Shared weighted biped", "ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    obj["productionMesh"] = True
    obj["sharedArmature"] = rig.name


def tube_mesh(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius_start: tuple[float, float],
    radius_end: tuple[float, float],
    bone: str,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
    sides: int = 12,
) -> bpy.types.Object:
    start_v = Vector(start)
    end_v = Vector(end)
    axis = (end_v - start_v).normalized()
    helper = Vector((0, 0, 1))
    if abs(axis.dot(helper)) > 0.92:
        helper = Vector((0, 1, 0))
    tangent = axis.cross(helper).normalized()
    bitangent = axis.cross(tangent).normalized()
    vertices = []
    rings = (
        (start_v - axis * 0.035, radius_start[0] * 0.72, radius_start[1] * 0.72),
        (start_v + axis * 0.08, radius_start[0], radius_start[1]),
        (end_v - axis * 0.08, radius_end[0], radius_end[1]),
        (end_v + axis * 0.035, radius_end[0] * 0.72, radius_end[1] * 0.72),
    )
    for center, radius_a, radius_b in rings:
        for index in range(sides):
            angle = index / sides * math.tau
            value = center + tangent * math.cos(angle) * radius_a + bitangent * math.sin(angle) * radius_b
            vertices.append(tuple(value))
    faces = []
    for ring in range(len(rings) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            faces.append((
                ring * sides + index,
                ring * sides + nxt,
                (ring + 1) * sides + nxt,
                (ring + 1) * sides + index,
            ))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(rings) - 1) * sides + index for index in range(sides)))
    obj = mesh_object(name, vertices, faces, material, collection)
    add_armature_modifier(
        obj,
        rig,
        {bone: [(index, 1.0) for index in range(len(vertices))]},
    )
    return obj


def ellipsoid(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    bone: str,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
    segments: int = 24,
    rings: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_to_collection(obj, collection)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    add_armature_modifier(
        obj,
        rig,
        {bone: [(index, 1.0) for index in range(len(obj.data.vertices))]},
    )
    return obj


def beveled_box(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    bone: str,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
    bevel: float = 0.12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Soft sewn edge", "BEVEL")
    modifier.width = bevel
    modifier.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    link_to_collection(obj, collection)
    obj.data.materials.append(material)
    add_armature_modifier(
        obj,
        rig,
        {bone: [(index, 1.0) for index in range(len(obj.data.vertices))]},
    )
    return obj


def curve_mesh(
    name: str,
    points: list[tuple[float, float, float]],
    bevel: float,
    bone: str,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}.Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, value in zip(spline.bezier_points, points):
        point.co = value
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    add_armature_modifier(
        obj,
        rig,
        {bone: [(index, 1.0) for index in range(len(obj.data.vertices))]},
    )
    obj.select_set(False)
    return obj


def build_torso(
    prefix: str,
    character: str,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
    padded: float = 0.0,
) -> bpy.types.Object:
    sides = 16
    rings = [
        ((0.0, 0.03, 2.4), (0.72 + padded, 0.48 + padded * 0.7), "pelvis"),
        ((0.0, 0.03, 2.82), (0.78 + padded, 0.50 + padded * 0.7), "pelvis"),
        ((0.0, 0.02, 3.35), (0.72 + padded, 0.45 + padded * 0.65), "spine"),
        ((0.0, 0.0, 3.9), (0.88 + padded, 0.48 + padded * 0.65), "chest"),
        ((0.0, 0.0, 4.15), (0.62 + padded, 0.38 + padded * 0.5), "chest"),
    ]
    vertices = []
    weights: dict[str, list[tuple[int, float]]] = {}
    for ring_index, (center, radii, bone) in enumerate(rings):
        for index in range(sides):
            angle = index / sides * math.tau
            vertex_index = len(vertices)
            vertices.append((
                center[0] + math.cos(angle) * radii[0],
                center[1] + math.sin(angle) * radii[1],
                center[2],
            ))
            weights.setdefault(bone, []).append((vertex_index, 1.0))
    faces = []
    for ring in range(len(rings) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            faces.append((
                ring * sides + index,
                ring * sides + nxt,
                (ring + 1) * sides + nxt,
                (ring + 1) * sides + index,
            ))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(rings) - 1) * sides + index for index in range(sides)))
    obj = mesh_object(f"{prefix}.CostumeTorso", vertices, faces, material, collection)
    add_armature_modifier(obj, rig, weights)
    obj["costumeLayers"] = "outer garment over shared biped"
    obj["character"] = character
    return obj


def build_hand(
    prefix: str,
    side: str,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
) -> None:
    sign = 1 if side == "L" else -1
    # The compact gameplay hand is kept as a single deforming glove with the
    # forearm. The articulated hand control remains on the armature for future
    # close work, but weighting this low-resolution silhouette across a second
    # transform exposed visible gaps during opposing arm rotations.
    deform_bone = f"forearm.{side}"
    # A forearm-weighted cuff overlaps the wrist joint so extreme opposing arm
    # rotations cannot expose a one-pixel gap after downsampling.
    ellipsoid(
        f"{prefix}.Cuff.{side}",
        REST[f"forearm.{side}"][1],
        (0.28, 0.23, 0.27),
        deform_bone,
        material,
        collection,
        rig,
        segments=16,
        rings=8,
    )
    ellipsoid(
        f"{prefix}.Wrist.{side}",
        REST[f"hand.{side}"][0],
        (0.29, 0.24, 0.27),
        deform_bone,
        material,
        collection,
        rig,
        segments=16,
        rings=8,
    )
    hand = beveled_box(
        f"{prefix}.Hand.{side}",
        (1.19 * sign, -0.22, 2.08),
        (0.27, 0.19, 0.34),
        deform_bone,
        material,
        collection,
        rig,
        bevel=0.14,
    )
    hand["anatomy"] = "palm with directional thumb and finger seam"
    thumb = tube_mesh(
        f"{prefix}.Thumb.{side}",
        (1.03 * sign, -0.29, 2.14),
        (0.89 * sign, -0.37, 2.02),
        (0.09, 0.08),
        (0.07, 0.06),
        deform_bone,
        material,
        collection,
        rig,
        sides=8,
    )
    thumb["anatomy"] = "thumb"


def build_shoe(
    prefix: str,
    side: str,
    material: bpy.types.Material,
    sole_material: bpy.types.Material,
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
) -> None:
    sign = 1 if side == "L" else -1
    x = 0.5 * sign
    vertices = [
        (x - 0.28, 0.14, 0.15), (x + 0.28, 0.14, 0.15),
        (x - 0.30, -0.48, 0.13), (x + 0.30, -0.48, 0.13),
        (x - 0.26, 0.08, 0.50), (x + 0.26, 0.08, 0.50),
        (x - 0.32, -0.52, 0.34), (x + 0.32, -0.52, 0.34),
        (x - 0.27, -0.94, 0.11), (x + 0.27, -0.94, 0.11),
        (x - 0.29, -0.91, 0.27), (x + 0.29, -0.91, 0.27),
    ]
    faces = [
        (0, 1, 5, 4), (0, 2, 3, 1), (4, 5, 7, 6),
        (0, 4, 6, 2), (1, 3, 7, 5), (2, 6, 10, 8),
        (3, 9, 11, 7), (6, 7, 11, 10), (8, 10, 11, 9),
        (2, 8, 9, 3),
    ]
    obj = mesh_object(f"{prefix}.DanceShoe.{side}", vertices, faces, material, collection)
    weights = {
        f"foot.{side}": [(index, 1.0) for index in range(8)],
        f"toe.{side}": [(index, 1.0) for index in range(8, 12)],
    }
    add_armature_modifier(obj, rig, weights)
    obj["shoeArticulation"] = "separate heel, ball and toe silhouette"
    curve_mesh(
        f"{prefix}.Sole.{side}",
        [(x - 0.26, 0.15, 0.11), (x, -0.42, 0.08), (x + 0.02, -0.93, 0.07)],
        0.035,
        f"foot.{side}",
        sole_material,
        collection,
        rig,
    )


def build_face(
    prefix: str,
    face_material: bpy.types.Material,
    hair_material: bpy.types.Material,
    eye_material: bpy.types.Material,
    blush_material: bpy.types.Material,
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
    hooded: bool = False,
) -> None:
    ellipsoid(
        f"{prefix}.HairBack",
        (0.0, 0.04, 5.1),
        (0.81, 0.55, 0.88),
        "head",
        hair_material,
        collection,
        rig,
    )
    ellipsoid(
        f"{prefix}.Face",
        (0.0, -0.43, 5.03),
        (0.67, 0.24, 0.64),
        "head",
        face_material,
        collection,
        rig,
    )
    for x in (-0.29, 0.29):
        ellipsoid(
            f"{prefix}.Eye.{x:+.2f}",
            (x, -0.665, 5.07),
            (0.15, 0.045, 0.13),
            "head",
            eye_material,
            collection,
            rig,
            segments=16,
            rings=8,
        )
        ellipsoid(
            f"{prefix}.EyeLight.{x:+.2f}",
            (x - 0.035, -0.708, 5.12),
            (0.03, 0.016, 0.03),
            "head",
            face_material,
            collection,
            rig,
            segments=10,
            rings=6,
        )
    for x in (-0.45, 0.45):
        for offset in (-0.055, 0.0, 0.055):
            curve_mesh(
                f"{prefix}.CheekStitch.{x:+.2f}.{offset:+.2f}",
                [(x + offset, -0.69, 4.88), (x + offset, -0.70, 4.82)],
                0.018,
                "head",
                blush_material,
                collection,
                rig,
            )
    curve_mesh(
        f"{prefix}.CatMouth",
        [(-0.18, -0.70, 4.78), (-0.08, -0.73, 4.72), (0.0, -0.73, 4.78),
         (0.08, -0.73, 4.72), (0.18, -0.70, 4.78)],
        0.022,
        "head",
        eye_material,
        collection,
        rig,
    )
    for index, x in enumerate((-0.43, -0.18, 0.08, 0.34)):
        beveled_box(
            f"{prefix}.Bang.{index}",
            (x, -0.66, 5.52 - abs(x) * 0.18),
            (0.18, 0.055, 0.30 if index in (1, 2) else 0.36),
            "head",
            hair_material,
            collection,
            rig,
            bevel=0.07,
        )
    if not hooded:
        for side, x in (("L", 0.44), ("R", -0.44)):
            vertices = [
                (x - 0.22, -0.1, 5.68), (x + 0.22, -0.1, 5.68),
                (x, -0.02, 6.45), (x - 0.18, 0.18, 5.72),
                (x + 0.18, 0.18, 5.72), (x, 0.14, 6.34),
            ]
            faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
            ear = mesh_object(
                f"{prefix}.CatEar.{side}",
                vertices,
                faces,
                face_material,
                collection,
            )
            add_armature_modifier(
                ear,
                rig,
                {"head": [(vertex, 1.0) for vertex in range(len(vertices))]},
            )


def build_kitty(
    rig: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Collection:
    collection = bpy.data.collections.new("Hero.KittyKaki")
    bpy.context.scene.collection.children.link(collection)
    prefix = "KittyKaki"
    p = lambda key: materials[f"kitty.{key}"]
    build_torso(prefix, "kitty", p("navy"), collection, rig)
    ellipsoid(prefix + ".Pelvis", (0, 0.03, 2.5), (0.76, 0.48, 0.48), "pelvis", p("navy"), collection, rig)
    for side, sign, depth in (("L", 1, "near"), ("R", -1, "far")):
        skin = p(f"cream_{depth}")
        cloth = p(f"navy_{depth}")
        tube_mesh(prefix + f".UpperArm.{side}", REST[f"upperArm.{side}"][0], REST[f"upperArm.{side}"][1], (0.25, 0.23), (0.22, 0.20), f"upperArm.{side}", skin, collection, rig)
        tube_mesh(prefix + f".Forearm.{side}", REST[f"forearm.{side}"][0], REST[f"forearm.{side}"][1], (0.22, 0.20), (0.18, 0.17), f"forearm.{side}", skin, collection, rig)
        tube_mesh(prefix + f".Thigh.{side}", REST[f"thigh.{side}"][0], REST[f"thigh.{side}"][1], (0.34, 0.30), (0.30, 0.27), f"thigh.{side}", cloth, collection, rig)
        tube_mesh(prefix + f".Shin.{side}", REST[f"shin.{side}"][0], REST[f"shin.{side}"][1], (0.29, 0.26), (0.24, 0.22), f"shin.{side}", cloth, collection, rig)
        build_hand(prefix, side, skin, collection, rig)
        build_shoe(prefix, side, p("navy_near" if depth == "near" else "navy_far"), p("navy_far"), collection, rig)
    build_face(prefix, p("cream"), p("cyan"), p("eye"), p("blush"), collection, rig)
    curve_mesh(prefix + ".FurCollar", [(-0.58, -0.36, 4.13), (0, -0.49, 4.05), (0.58, -0.36, 4.13)], 0.11, "chest", p("white"), collection, rig)
    for x in (-0.12, 0.12):
        curve_mesh(prefix + f".Drawstring.{x:+.2f}", [(x, -0.53, 4.0), (x * 1.5, -0.55, 3.5)], 0.025, "chest", p("white"), collection, rig)
    return collection


def build_soter(
    rig: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Collection:
    collection = bpy.data.collections.new("Hero.Soter")
    bpy.context.scene.collection.children.link(collection)
    prefix = "Soter"
    p = lambda key: materials[f"soter.{key}"]
    build_torso(prefix, "soter", p("green"), collection, rig, padded=0.12)
    ellipsoid(prefix + ".Pelvis", (0, 0.04, 2.5), (0.84, 0.54, 0.52), "pelvis", p("green"), collection, rig)
    for side, sign, depth in (("L", 1, "near"), ("R", -1, "far")):
        costume = p(f"green_{depth}")
        tube_mesh(prefix + f".UpperArm.{side}", REST[f"upperArm.{side}"][0], REST[f"upperArm.{side}"][1], (0.31, 0.28), (0.27, 0.24), f"upperArm.{side}", costume, collection, rig)
        tube_mesh(prefix + f".Forearm.{side}", REST[f"forearm.{side}"][0], REST[f"forearm.{side}"][1], (0.27, 0.24), (0.23, 0.21), f"forearm.{side}", costume, collection, rig)
        tube_mesh(prefix + f".Thigh.{side}", REST[f"thigh.{side}"][0], REST[f"thigh.{side}"][1], (0.40, 0.35), (0.34, 0.31), f"thigh.{side}", costume, collection, rig)
        tube_mesh(prefix + f".Shin.{side}", REST[f"shin.{side}"][0], REST[f"shin.{side}"][1], (0.34, 0.31), (0.28, 0.26), f"shin.{side}", costume, collection, rig)
        build_hand(prefix, side, costume, collection, rig)
        build_shoe(prefix, side, costume, p("green_dark"), collection, rig)
    ellipsoid(prefix + ".HoodBack", (0, 0.08, 5.18), (0.96, 0.65, 1.05), "head", p("green"), collection, rig)
    # Face and hair sit in front of the hood so the opening remains clear.
    build_face(prefix + ".Inside", p("cream"), p("cyan"), p("eye"), p("blush"), collection, rig, hooded=True)
    for x in (-0.48, 0.48):
        ellipsoid(prefix + f".SnakeEye.{x:+.2f}", (x, -0.61, 5.70), (0.12, 0.05, 0.18), "head", p("eye"), collection, rig, segments=16, rings=8)
        ellipsoid(prefix + f".SnakeEyeLight.{x:+.2f}", (x - 0.025, -0.66, 5.76), (0.03, 0.02, 0.05), "head", p("white"), collection, rig, segments=10, rings=6)
        ellipsoid(prefix + f".SnakeCheek.{x:+.2f}", (x * 1.23, -0.59, 5.42), (0.13, 0.04, 0.12), "head", p("pink"), collection, rig, segments=16, rings=8)
    curve_mesh(prefix + ".HoodChin", [(-0.66, -0.54, 4.59), (0, -0.7, 4.47), (0.66, -0.54, 4.59)], 0.12, "head", p("green_dark"), collection, rig)
    tongue = beveled_box(prefix + ".Tongue", (0, -0.69, 5.46), (0.13, 0.05, 0.32), "head", p("pink"), collection, rig, bevel=0.07)
    tongue.rotation_euler.x = math.radians(-5)
    for index, z in enumerate((3.58, 3.28, 2.98, 2.69)):
        beveled_box(prefix + f".BellyPanel.{index}", (0, -0.51, z), (0.47 - index * 0.025, 0.055, 0.18), "spine" if index < 2 else "pelvis", p("belly_light" if index % 2 == 0 else "belly"), collection, rig, bevel=0.08)
    tail = curve_mesh(
        prefix + ".DecorativeTail",
        [(0.18, 0.34, 2.57), (0.66, 0.58, 2.1), (0.88, 0.28, 1.47), (0.72, 0.04, 0.92)],
        0.20,
        "pelvis",
        p("green"),
        collection,
        rig,
    )
    tail["contactBearing"] = False
    tail["minimumBoardClearance"] = 0.55
    return collection


def add_stage_guides(
    materials: dict[str, bpy.types.Material],
) -> None:
    guides = bpy.data.collections.new("Render.Guides")
    bpy.context.scene.collection.children.link(guides)
    board_material = make_material("Guide.Board", (0.38, 0.18, 0.07, 1))
    bpy.ops.mesh.primitive_cube_add(location=(0, 0.4, -0.08), scale=(2.4, 1.2, 0.08))
    board = bpy.context.object
    board.name = "DanceBoardGuide"
    link_to_collection(board, guides)
    board.data.materials.append(board_material)
    board.hide_render = True

    camera_data = bpy.data.cameras.new(CAMERA_NAME)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 6.8
    camera = bpy.data.objects.new(CAMERA_NAME, camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = (5.2, -12.0, 5.2)
    target = Vector((0.0, 0.0, 3.05))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera

    for name, location, energy, size in (
        ("KeyWarm", (4.5, -6.0, 9.0), 820, 5.0),
        ("FillCool", (-5.0, -3.0, 6.5), 480, 4.0),
        ("RimWarm", (1.5, 4.0, 7.5), 680, 3.0),
    ):
        light_data = bpy.data.lights.new(name, "AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        bpy.context.scene.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()


def reset_pose(rig: bpy.types.Object) -> None:
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)


def rest_head(name: str) -> Vector:
    if name in REST:
        return Vector(REST[name][0])
    return Vector(CONTROL_BONES[name][0])


def set_control_location(rig: bpy.types.Object, name: str, world: tuple[float, float, float]) -> None:
    rig.pose.bones[name].location = Vector(world) - rest_head(name)


def key_pose(rig: bpy.types.Object, frame: int, pose: dict) -> None:
    reset_pose(rig)
    root = pose.get("root", (0, 0, 0))
    rig.pose.bones["CTRL.root"].location = root
    rig.pose.bones["root"].location = root
    pelvis_shift = pose.get("pelvis_shift", (0, 0, 0))
    rig.pose.bones["pelvis"].location = pelvis_shift
    rig.pose.bones["pelvis"].rotation_euler = pose.get("pelvis_rot", (0, 0, 0))
    rig.pose.bones["spine"].rotation_euler = pose.get("spine", (0, 0, 0))
    rig.pose.bones["chest"].rotation_euler = pose.get("chest", (0, 0, 0))
    rig.pose.bones["neck"].rotation_euler = pose.get("neck", (0, 0, 0))
    rig.pose.bones["head"].rotation_euler = pose.get("head", (0, 0, 0))
    for side in ("L", "R"):
        set_control_location(rig, f"footIK.{side}", pose.get(f"foot.{side}", CONTROL_BONES[f"footIK.{side}"][0]))
        set_control_location(rig, f"kneePole.{side}", pose.get(f"knee.{side}", CONTROL_BONES[f"kneePole.{side}"][0]))
        rig.pose.bones[f"foot.{side}"].rotation_euler = pose.get(f"foot_rot.{side}", (0, 0, 0))
        rig.pose.bones[f"toe.{side}"].rotation_euler = pose.get(f"toe_rot.{side}", (0, 0, 0))
        rig.pose.bones[f"upperArm.{side}"].rotation_euler = pose.get(f"upperArm.{side}", (0, 0, 0))
        rig.pose.bones[f"forearm.{side}"].rotation_euler = pose.get(f"forearm.{side}", (0, 0, 0))
        rig.pose.bones[f"hand.{side}"].rotation_euler = pose.get(f"hand.{side}", (0, 0, 0))
    rig.pose.bones["costume.hood"].rotation_euler = pose.get("hood", (0, 0, 0))
    rig.pose.bones["costume.tail"].rotation_euler = pose.get("tail", (0, 0, 0))
    for bone in rig.pose.bones:
        bone.keyframe_insert("location", frame=frame, group=bone.name)
        bone.keyframe_insert("rotation_euler", frame=frame, group=bone.name)
        bone.keyframe_insert("scale", frame=frame, group=bone.name)


def radians(values: tuple[float, float, float]) -> tuple[float, float, float]:
    return tuple(math.radians(value) for value in values)


def pose(**kwargs) -> dict:
    result = dict(kwargs)
    for alias, canonical in (("foot_L", "foot.L"), ("foot_R", "foot.R")):
        if alias in result:
            result[canonical] = result.pop(alias)
    for key in list(result):
        if key.startswith(("pelvis_rot", "spine", "chest", "neck", "head", "upperArm", "forearm", "hand", "foot_rot", "toe_rot", "hood", "tail")):
            result[key] = radians(result[key])
    return result


def action_specs() -> dict[str, dict]:
    left_plant = (0.5, 0.0, 0.38)
    right_plant = (-0.5, 0.0, 0.38)
    relaxed = {
        "upperArm.L": (4, -7, -9),
        "forearm.L": (-9, 2, 3),
        "upperArm.R": (-3, 6, 8),
        "forearm.R": (8, -2, -3),
    }
    return {
        "groove": {
            "display": "Neutral musical groove",
            "frames": [
                (1, pose(pelvis_shift=(-0.06, 0, -0.05), pelvis_rot=(0, -1, -2), chest=(0, 2, 2), head=(0, -1, 0), **relaxed)),
                (8, pose(pelvis_shift=(0.10, 0, -0.13), pelvis_rot=(0, 2, 3), chest=(0, -3, -3), head=(0, 2, 1), **{"upperArm.L": (-2, -4, -5), "forearm.L": (-6, 2, 2), "upperArm.R": (3, 4, 5), "forearm.R": (6, -2, -2)})),
                (16, pose(pelvis_shift=(0.04, 0, -0.06), pelvis_rot=(0, 1, 1), chest=(0, -1, -1), head=(0, 1, 0), **relaxed)),
                (24, pose(pelvis_shift=(-0.11, 0, -0.14), pelvis_rot=(0, -2, -3), chest=(0, 3, 3), head=(0, -2, -1), **{"upperArm.L": (3, -4, -4), "forearm.L": (-5, 2, 2), "upperArm.R": (-2, 4, 4), "forearm.R": (5, -2, -2)})),
                (31, pose(pelvis_shift=(-0.06, 0, -0.05), pelvis_rot=(0, -1, -2), chest=(0, 2, 2), head=(0, -1, 0), **relaxed)),
            ],
            "contacts": [
                {"frame": 1, "support": "both", "contact": "flat", "freeFoot": "left"},
                {"frame": 16, "support": "left", "contact": "soft", "freeFoot": "right"},
            ],
        },
        "walkingStep": {
            "display": "Alternating foundation step",
            "frames": [
                (1, pose(pelvis_shift=(-0.17, 0, -0.14), pelvis_rot=(0, -2, -3), chest=(0, 3, 4), foot_L=left_plant, foot_R=right_plant, **relaxed)),
                (4, pose(pelvis_shift=(-0.23, 0, -0.18), pelvis_rot=(0, -3, -4), chest=(0, 4, 5), foot_L=left_plant, **{"foot.R": (-0.52, -0.12, 0.53), "upperArm.L": (8, -8, -12), "forearm.L": (-11, 2, 4), "upperArm.R": (-7, 7, 11), "forearm.R": (10, -2, -4)})),
                (8, pose(pelvis_shift=(-0.10, -0.02, -0.08), pelvis_rot=(0, -1, -1), chest=(0, 2, 1), foot_L=left_plant, **{"foot.R": (-0.58, -0.42, 0.58), "foot_rot.R": (-12, 0, 0), "upperArm.L": (10, -7, -14), "forearm.L": (-12, 2, 5), "upperArm.R": (-9, 6, 13), "forearm.R": (11, -2, -5)})),
                (12, pose(pelvis_shift=(0.04, -0.02, -0.12), pelvis_rot=(0, 1, 2), chest=(0, -2, -3), foot_L=left_plant, **{"foot.R": (-0.56, -0.64, 0.43), "foot_rot.R": (12, 0, 0), "upperArm.L": (4, -5, -6), "forearm.L": (-8, 2, 3), "upperArm.R": (-3, 5, 6), "forearm.R": (7, -2, -3)})),
                (16, pose(pelvis_shift=(0.19, 0, -0.17), pelvis_rot=(0, 3, 4), chest=(0, -4, -5), foot_L=left_plant, foot_R=right_plant, **{"upperArm.L": (-7, -5, 10), "forearm.L": (-10, 2, -4), "upperArm.R": (8, 5, -11), "forearm.R": (10, -2, 4)})),
                (20, pose(pelvis_shift=(0.24, 0, -0.18), pelvis_rot=(0, 3, 4), chest=(0, -4, -5), foot_R=right_plant, **{"foot.L": (0.52, -0.12, 0.53), "upperArm.L": (-8, -6, 12), "forearm.L": (-11, 2, -4), "upperArm.R": (7, 6, -11), "forearm.R": (10, -2, 4)})),
                (24, pose(pelvis_shift=(0.10, -0.02, -0.08), pelvis_rot=(0, 1, 1), chest=(0, -2, -1), foot_R=right_plant, **{"foot.L": (0.58, -0.42, 0.58), "foot_rot.L": (-12, 0, 0), "upperArm.L": (-10, -7, 14), "forearm.L": (-12, 2, -5), "upperArm.R": (9, 6, -13), "forearm.R": (11, -2, 5)})),
                (28, pose(pelvis_shift=(-0.04, -0.02, -0.12), pelvis_rot=(0, -1, -2), chest=(0, 2, 3), foot_R=right_plant, **{"foot.L": (0.56, -0.64, 0.43), "foot_rot.L": (12, 0, 0), "upperArm.L": (-4, -5, 6), "forearm.L": (-8, 2, -3), "upperArm.R": (3, 5, -6), "forearm.R": (7, -2, 3)})),
                (31, pose(pelvis_shift=(-0.17, 0, -0.14), pelvis_rot=(0, -2, -3), chest=(0, 3, 4), foot_L=left_plant, foot_R=right_plant, **relaxed)),
            ],
            "contacts": [
                {"frame": 1, "support": "left", "contact": "flat", "freeFoot": "right"},
                {"frame": 16, "support": "right", "contact": "flat", "freeFoot": "left"},
                {"frame": 31, "support": "left", "contact": "flat", "freeFoot": "right"},
            ],
        },
        "shuffle": {
            "display": "Shuffle and brush",
            "frames": [
                (1, pose(pelvis_shift=(-0.2, 0, -0.16), pelvis_rot=(0, -2, -4), chest=(0, 3, 5), foot_R=right_plant, **relaxed)),
                (4, pose(pelvis_shift=(-0.24, 0, -0.19), pelvis_rot=(0, -3, -5), chest=(0, 4, 6), foot_R=right_plant, **{"foot.L": (0.56, -0.18, 0.54), "foot_rot.L": (-15, 0, 4), "upperArm.L": (10, -7, -14), "forearm.L": (-12, 2, 5), "upperArm.R": (-8, 6, 12), "forearm.R": (10, -2, -4)})),
                (8, pose(pelvis_shift=(-0.18, -0.01, -0.12), pelvis_rot=(0, -2, -3), chest=(0, 3, 4), foot_R=right_plant, **{"foot.L": (0.64, -0.75, 0.46), "foot_rot.L": (6, 0, -5), "upperArm.L": (6, -6, -9), "forearm.L": (-9, 2, 3), "upperArm.R": (-5, 5, 8), "forearm.R": (8, -2, -3)})),
                (11, pose(pelvis_shift=(-0.22, 0, -0.17), pelvis_rot=(0, -3, -4), chest=(0, 4, 5), foot_R=right_plant, **{"foot.L": (0.58, -0.3, 0.50), "foot_rot.L": (-10, 0, 3), "upperArm.L": (9, -7, -12), "forearm.L": (-11, 2, 4), "upperArm.R": (-7, 6, 10), "forearm.R": (9, -2, -4)})),
                (16, pose(pelvis_shift=(-0.12, 0, -0.13), pelvis_rot=(0, -1, -2), chest=(0, 2, 3), foot_R=right_plant, foot_L=(0.54, -0.02, 0.38), **relaxed)),
            ],
            "contacts": [
                {"frame": 1, "support": "right", "contact": "brush-prep", "freeFoot": "left"},
                {"frame": 8, "support": "right", "contact": "brush", "freeFoot": "left"},
                {"frame": 16, "support": "right", "contact": "flat", "freeFoot": "left"},
            ],
        },
        "heelToeChange": {
            "display": "Heel-toe change",
            "frames": [
                (1, pose(pelvis_shift=(-0.19, 0, -0.16), pelvis_rot=(0, -2, -4), chest=(0, 3, 5), foot_R=right_plant, foot_L=left_plant, **relaxed)),
                (6, pose(pelvis_shift=(-0.24, 0, -0.18), pelvis_rot=(0, -3, -5), chest=(0, 4, 6), foot_R=right_plant, foot_L=left_plant, **{"foot_rot.L": (24, 0, 0), "toe_rot.L": (-18, 0, 0), "upperArm.L": (7, -6, -10), "forearm.L": (-10, 2, 4), "upperArm.R": (-6, 6, 9), "forearm.R": (9, -2, -3)})),
                (11, pose(pelvis_shift=(-0.11, 0, -0.11), pelvis_rot=(0, -1, -2), chest=(0, 2, 3), foot_R=right_plant, foot_L=left_plant, **{"foot_rot.L": (-18, 0, 0), "toe_rot.L": (22, 0, 0), **relaxed})),
                (16, pose(pelvis_shift=(0.19, 0, -0.16), pelvis_rot=(0, 2, 4), chest=(0, -3, -5), foot_R=right_plant, foot_L=left_plant, **{"upperArm.L": (-6, -6, 9), "forearm.L": (-9, 2, -3), "upperArm.R": (7, 6, -10), "forearm.R": (10, -2, 4)})),
                (21, pose(pelvis_shift=(0.24, 0, -0.18), pelvis_rot=(0, 3, 5), chest=(0, -4, -6), foot_R=right_plant, foot_L=left_plant, **{"foot_rot.R": (24, 0, 0), "toe_rot.R": (-18, 0, 0), "upperArm.L": (-7, -6, 10), "forearm.L": (-10, 2, -4), "upperArm.R": (6, 6, -9), "forearm.R": (9, -2, 3)})),
                (26, pose(pelvis_shift=(0.11, 0, -0.11), pelvis_rot=(0, 1, 2), chest=(0, -2, -3), foot_R=right_plant, foot_L=left_plant, **{"foot_rot.R": (-18, 0, 0), "toe_rot.R": (22, 0, 0), **relaxed})),
                (31, pose(pelvis_shift=(-0.19, 0, -0.16), pelvis_rot=(0, -2, -4), chest=(0, 3, 5), foot_R=right_plant, foot_L=left_plant, **relaxed)),
            ],
            "contacts": [
                {"frame": 6, "support": "right", "contact": "heel-left", "freeFoot": "left"},
                {"frame": 11, "support": "right", "contact": "toe-left", "freeFoot": "left"},
                {"frame": 21, "support": "left", "contact": "heel-right", "freeFoot": "right"},
                {"frame": 26, "support": "left", "contact": "toe-right", "freeFoot": "right"},
            ],
        },
        "backstep": {
            "display": "Backstep",
            "frames": [
                (1, pose(pelvis_shift=(-0.17, 0, -0.14), pelvis_rot=(0, -2, -3), chest=(0, 3, 4), foot_R=right_plant, foot_L=left_plant, **relaxed)),
                (5, pose(pelvis_shift=(-0.23, 0.02, -0.18), pelvis_rot=(0, -3, -5), chest=(0, 4, 6), foot_R=right_plant, **{"foot.L": (0.54, 0.18, 0.55), "foot_rot.L": (-12, 0, 0), "upperArm.L": (9, -7, -13), "forearm.L": (-11, 2, 4), "upperArm.R": (-8, 6, 12), "forearm.R": (10, -2, -4)})),
                (9, pose(pelvis_shift=(-0.10, 0.08, -0.11), pelvis_rot=(0, -1, -2), chest=(0, 2, 3), foot_R=right_plant, **{"foot.L": (0.58, 0.42, 0.42), "foot_rot.L": (10, 0, 0), "upperArm.L": (5, -6, -7), "forearm.L": (-8, 2, 3), "upperArm.R": (-4, 5, 7), "forearm.R": (7, -2, -3)})),
                (13, pose(pelvis_shift=(0.11, 0.05, -0.18), pelvis_rot=(0, 1, 3), chest=(0, -2, -4), foot_R=right_plant, foot_L=(0.58, 0.22, 0.38), **{"upperArm.L": (-6, -5, 8), "forearm.L": (-9, 2, -3), "upperArm.R": (7, 5, -9), "forearm.R": (9, -2, 3)})),
                (16, pose(pelvis_shift=(0.16, 0, -0.14), pelvis_rot=(0, 2, 3), chest=(0, -3, -4), foot_R=right_plant, foot_L=left_plant, **relaxed)),
            ],
            "contacts": [
                {"frame": 1, "support": "right", "contact": "flat", "freeFoot": "left"},
                {"frame": 9, "support": "right", "contact": "backstep", "freeFoot": "left"},
                {"frame": 16, "support": "left", "contact": "flat", "freeFoot": "right"},
            ],
        },
        "chug": {
            "display": "Chug",
            "frames": [
                (1, pose(pelvis_shift=(-0.03, 0, -0.12), pelvis_rot=(0, -1, -1), chest=(0, 2, 2), foot_L=left_plant, foot_R=right_plant, **relaxed)),
                (4, pose(pelvis_shift=(-0.10, 0.02, -0.25), pelvis_rot=(0, -2, -3), chest=(0, 3, 4), foot_L=left_plant, foot_R=right_plant, **{"upperArm.L": (8, -7, -11), "forearm.L": (-10, 2, 4), "upperArm.R": (-7, 6, 10), "forearm.R": (9, -2, -4)})),
                (7, pose(root=(0, 0.04, 0.08), pelvis_shift=(0.02, 0, -0.05), pelvis_rot=(0, 1, 2), chest=(0, -2, -3), **{"foot.L": (0.5, 0.04, 0.46), "foot.R": (-0.5, 0.04, 0.46), "upperArm.L": (-4, -6, 6), "forearm.L": (-8, 2, -3), "upperArm.R": (5, 5, -7), "forearm.R": (8, -2, 3)})),
                (10, pose(root=(0, -0.02, 0), pelvis_shift=(0.09, 0, -0.28), pelvis_rot=(0, 2, 3), chest=(0, -3, -4), foot_L=left_plant, foot_R=right_plant, **{"upperArm.L": (-7, -6, 10), "forearm.L": (-10, 2, -4), "upperArm.R": (8, 6, -11), "forearm.R": (10, -2, 4)})),
                (16, pose(pelvis_shift=(-0.03, 0, -0.12), pelvis_rot=(0, -1, -1), chest=(0, 2, 2), foot_L=left_plant, foot_R=right_plant, **relaxed)),
            ],
            "contacts": [
                {"frame": 1, "support": "both", "contact": "flat", "freeFoot": "both"},
                {"frame": 5, "support": "none", "contact": "depart", "freeFoot": "both"},
                {"frame": 10, "support": "both", "contact": "chug", "freeFoot": "both"},
            ],
        },
        "recovery": {
            "display": "Short recovery and weight transfer",
            "frames": [
                (1, pose(pelvis_shift=(-0.24, 0, -0.20), pelvis_rot=(0, -3, -5), chest=(0, 4, 6), foot_R=right_plant, foot_L=(0.58, -0.18, 0.44), **{"upperArm.L": (8, -7, -12), "forearm.L": (-11, 2, 4), "upperArm.R": (-7, 6, 11), "forearm.R": (10, -2, -4)})),
                (4, pose(pelvis_shift=(-0.08, 0, -0.14), pelvis_rot=(0, -1, -2), chest=(0, 2, 3), foot_R=right_plant, foot_L=(0.55, -0.06, 0.39), **relaxed)),
                (7, pose(pelvis_shift=(0.12, 0, -0.16), pelvis_rot=(0, 2, 3), chest=(0, -3, -4), foot_R=right_plant, foot_L=left_plant, **{"upperArm.L": (-4, -5, 6), "forearm.L": (-8, 2, -3), "upperArm.R": (5, 5, -7), "forearm.R": (8, -2, 3)})),
                (9, pose(pelvis_shift=(0.17, 0, -0.14), pelvis_rot=(0, 2, 3), chest=(0, -3, -4), foot_R=right_plant, foot_L=left_plant, **relaxed)),
            ],
            "contacts": [
                {"frame": 1, "support": "right", "contact": "recovery", "freeFoot": "left"},
                {"frame": 9, "support": "left", "contact": "soft", "freeFoot": "right"},
            ],
        },
        "turnaround": {
            "display": "Turnaround and ending",
            "frames": [
                (1, pose(pelvis_shift=(-0.16, 0, -0.14), pelvis_rot=(0, -3, -5), chest=(0, 4, 6), foot_R=right_plant, foot_L=left_plant, **relaxed)),
                (6, pose(pelvis_shift=(-0.25, 0, -0.20), pelvis_rot=(0, -8, -9), chest=(0, 10, 12), foot_R=right_plant, **{"foot.L": (0.60, -0.24, 0.58), "upperArm.L": (18, -10, -25), "forearm.L": (-18, 3, 8), "upperArm.R": (-15, 9, 22), "forearm.R": (16, -3, -7), "head": (0, -5, -4), "tail": (0, 10, 8)})),
                (11, pose(pelvis_shift=(-0.05, -0.03, -0.10), pelvis_rot=(0, 7, 9), chest=(0, -9, -11), foot_R=right_plant, **{"foot.L": (0.08, -0.63, 0.50), "foot_rot.L": (8, 0, -12), "upperArm.L": (10, -9, -18), "forearm.L": (-15, 3, 6), "upperArm.R": (-8, 8, 16), "forearm.R": (14, -3, -5), "head": (0, 4, 3), "tail": (0, -8, -6)})),
                (14, pose(pelvis_shift=(0.12, 0, -0.20), pelvis_rot=(0, 8, 10), chest=(0, -10, -12), foot_L=left_plant, foot_R=right_plant, **{"upperArm.L": (-8, -8, 14), "forearm.L": (-14, 3, -5), "upperArm.R": (10, 8, -16), "forearm.R": (14, -3, 6), "head": (0, 5, 4), "tail": (0, -10, -8)})),
                (16, pose(pelvis_shift=(0.18, 0, -0.18), pelvis_rot=(0, 10, 12), chest=(0, -12, -14), foot_L=left_plant, **{"foot.R": (-0.12, -0.55, 0.48), "foot_rot.R": (10, 0, 12), "upperArm.L": (-16, -8, 24), "forearm.L": (-17, 3, -7), "upperArm.R": (18, 9, -26), "forearm.R": (18, -3, 8), "head": (0, 6, 5), "tail": (0, -12, -9)})),
                (21, pose(pelvis_shift=(0.26, 0, -0.22), pelvis_rot=(0, 4, 6), chest=(0, -6, -8), foot_L=left_plant, foot_R=(-0.53, -0.18, 0.4), **{"upperArm.L": (-10, -7, 16), "forearm.L": (-14, 3, -5), "upperArm.R": (12, 7, -18), "forearm.R": (15, -3, 6), "head": (0, 2, 2)})),
                (26, pose(pelvis_shift=(0.08, 0, -0.28), pelvis_rot=(0, 1, 2), chest=(0, -2, -3), foot_L=left_plant, foot_R=right_plant, **{"upperArm.L": (-3, -5, 5), "forearm.L": (-8, 2, -2), "upperArm.R": (4, 5, -6), "forearm.R": (8, -2, 2), "head": (0, 1, 0)})),
                (31, pose(pelvis_shift=(0.02, 0, -0.16), pelvis_rot=(0, 0, 0), chest=(0, 0, 0), foot_L=left_plant, foot_R=right_plant, **{"upperArm.L": (-8, -10, 18), "forearm.L": (-14, 3, -6), "upperArm.R": (9, 10, -20), "forearm.R": (14, -3, 7), "head": (0, 0, 0)})),
            ],
            "contacts": [
                {"frame": 1, "support": "right", "contact": "flat", "freeFoot": "left"},
                {"frame": 11, "support": "right", "contact": "cross", "freeFoot": "left"},
                {"frame": 14, "support": "left", "contact": "turn", "freeFoot": "right"},
                {"frame": 26, "support": "both", "contact": "ending", "freeFoot": "both"},
            ],
        },
    }


def build_actions(rig: bpy.types.Object) -> dict:
    specs = action_specs()
    export = {}
    rig.animation_data_create()
    for clip_id, definition in specs.items():
        action = bpy.data.actions.new(f"FrolicCandidate.{clip_id}")
        action.use_fake_user = True
        action["clipId"] = clip_id
        action["displayName"] = definition["display"]
        action["fps"] = FPS
        action["bpm"] = BPM
        action["contacts"] = json.dumps(definition["contacts"], separators=(",", ":"))
        action["candidateStatus"] = "human-review-required"
        rig.animation_data.action = action
        for frame, frame_pose in definition["frames"]:
            key_pose(rig, frame, frame_pose)
        start = definition["frames"][0][0]
        end = definition["frames"][-1][0]
        action["frameStart"] = start
        action["frameEnd"] = end
        action.use_frame_range = True
        action.frame_start = start
        action.frame_end = end
        # Blender 5 stores newly keyed channels in layered action slots rather
        # than exposing the legacy ``Action.fcurves`` collection. Keyframe
        # insertion still uses Bezier interpolation by default; the explicit
        # hand-key positions above are the source of motion.
        export[clip_id] = {
            "action": action.name,
            "displayName": definition["display"],
            "frameRange": [start, end],
            "sourceFrames": end - start + 1,
            "fps": FPS,
            "contacts": definition["contacts"],
            "keyframes": [frame for frame, _ in definition["frames"]],
        }
    rig.animation_data.action = bpy.data.actions["FrolicCandidate.groove"]
    return export


def configure_scene() -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_WORKBENCH_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.filter_size = 0.01
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    scene.display.shading.curvature_ridge_factor = 1.35
    scene.display.shading.curvature_valley_factor = 0.65
    scene.display.shading.show_specular_highlight = False
    scene.display.shading.show_object_outline = True
    scene.display.shading.object_outline_color = (0.008, 0.012, 0.03)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.resolution_percentage = 100
    scene["candidateStatus"] = "human-review-required"
    scene["publicSpriteSource"] = "actual Blender rendered character"
    scene["manualPixelCleanup"] = "blocked-no-Aseprite-or-LibreSprite"
    scene["sourceFPS"] = FPS


def validate_production_source(
    rig: bpy.types.Object,
    hero_collections: list[bpy.types.Collection],
    actions: dict,
) -> dict:
    errors = []
    if len(actions) != 8:
        errors.append("exactly eight Flatfoot candidate actions are required")
    required = {
        "pelvis", "spine", "chest", "clavicle.L", "clavicle.R",
        "upperArm.L", "upperArm.R", "forearm.L", "forearm.R",
        "hand.L", "hand.R", "thigh.L", "thigh.R", "shin.L", "shin.R",
        "foot.L", "foot.R", "toe.L", "toe.R", "footIK.L", "footIK.R",
        "heelPivot.L", "heelPivot.R", "ballPivot.L", "ballPivot.R",
        "toePivot.L", "toePivot.R", "kneePole.L", "kneePole.R",
    }
    missing = sorted(required - {bone.name for bone in rig.pose.bones})
    if missing:
        errors.append(f"missing bones or controls: {', '.join(missing)}")
    mesh_summary = {}
    for collection in hero_collections:
        meshes = [obj for obj in collection.all_objects if obj.type == "MESH"]
        weighted = [
            obj for obj in meshes
            if any(modifier.type == "ARMATURE" and modifier.object == rig for modifier in obj.modifiers)
        ]
        vertices = sum(len(obj.data.vertices) for obj in meshes)
        mesh_summary[collection.name] = {
            "meshObjects": len(meshes),
            "weightedMeshObjects": len(weighted),
            "vertices": vertices,
        }
        if len(weighted) < 20:
            errors.append(f"{collection.name} does not contain enough weighted production parts")
        if vertices < 2500:
            errors.append(f"{collection.name} topology is too sparse for the candidate")
    if errors:
        raise RuntimeError("Production source validation failed:\n" + "\n".join(errors))
    return mesh_summary


def main() -> None:
    clear_scene()
    materials = build_materials()
    rig = build_armature()
    kitty = build_kitty(rig, materials)
    soter = build_soter(rig, materials)
    add_stage_guides(materials)
    configure_scene()
    actions = build_actions(rig)
    mesh_summary = validate_production_source(rig, [kitty, soter], actions)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 31
    scene.frame_set(1)

    root = project_root()
    output = root / "tools" / "blender" / OUTPUT_NAME
    export_path = root / "tools" / "blender" / "exports" / EXPORT_NAME
    export_path.parent.mkdir(parents=True, exist_ok=True)
    export = {
        "schemaVersion": 2,
        "candidateStatus": "human-review-required",
        "source": str(output.relative_to(root)),
        "publicSpriteSource": "actual Blender rendered character",
        "sharedArmature": rig.name,
        "topology": "weighted-biped",
        "characters": ["kitty", "soder"],
        "userFacingCharacters": ["KittyKaki", "Soter"],
        "sourceFPS": FPS,
        "bpm": BPM,
        "renderResolution": [512, 512],
        "camera": CAMERA_NAME,
        "cameraType": "orthographic-three-quarter-front",
        "deformBones": [bone.name for bone in rig.data.bones if bone.use_deform],
        "controls": [bone.name for bone in rig.data.bones if not bone.use_deform],
        "meshSummary": mesh_summary,
        "actions": actions,
        "manualPixelCleanup": {
            "status": "blocked",
            "reason": "Aseprite and LibreSprite are not installed; retain toon-rendered candidate for human review.",
        },
    }
    export_path.write_text(json.dumps(export, indent=2) + "\n", encoding="utf-8")
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    print(f"KAKI_FROLIC_BLEND={output}")
    print(f"KAKI_FROLIC_EXPORT={export_path}")
    print(f"KAKI_FROLIC_ACTIONS={len(actions)}")
    print(f"KAKI_FROLIC_MESHES={json.dumps(mesh_summary, separators=(',', ':'))}")


if __name__ == "__main__":
    main()
