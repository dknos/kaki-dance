"""Authored Appalachian Frolic biped poses for offline sprite production.

The movement profiles are gameplay interpretations of recurring characteristics
described in the project's provenance document. They are not an authoritative
taxonomy and do not reconstruct any practitioner's personal signature.

Coordinates use the same 96 x 96 camera-space plane as ``hero_pose_library``.
Every pose retains two arms, two hands, two thighs, two shins, two ankles, and
two directional feet. Anatomical left remains screen-right in the unmirrored
front view.
"""

from __future__ import annotations

from copy import deepcopy
from math import cos, pi, sin, sqrt

from hero_pose_library import ANCHORS, DEFAULT_DEPTH, SEGMENTS, make_pose


BPM = 120
STYLES = ("flatfoot", "buck", "clog")
CHARACTERS = ("kitty", "soder")

STYLE_SPECS = {
    "flatfoot": {
        "pelvis_y": 61.0,
        "bounce": 1.1,
        "lift": 2.8,
        "spread": 9.0,
        "travel": 2.4,
        "arm": 2.3,
        "spring": 0.35,
    },
    "buck": {
        "pelvis_y": 59.5,
        "bounce": 2.0,
        "lift": 4.6,
        "spread": 10.0,
        "travel": 3.4,
        "arm": 3.6,
        "spring": 0.7,
    },
    "clog": {
        "pelvis_y": 58.0,
        "bounce": 3.1,
        "lift": 7.0,
        "spread": 11.5,
        "travel": 3.8,
        "arm": 5.0,
        "spring": 1.0,
    },
}

CLIP_SPECS = {
    "walkingStep": {"durationBeats": 1, "fps": 12, "mirroringSafe": True},
    "slidingWalk": {"durationBeats": 2, "fps": 12, "mirroringSafe": True},
    "shuffle": {"durationBeats": 1, "fps": 12, "mirroringSafe": True},
    "doubleShuffle": {"durationBeats": 2, "fps": 12, "mirroringSafe": True},
    "backstep": {"durationBeats": 1, "fps": 12, "mirroringSafe": True},
    "chug": {"durationBeats": 1, "fps": 12, "mirroringSafe": True},
    "heelToeChange": {"durationBeats": 1, "fps": 12, "mirroringSafe": True},
    "dragSlide": {"durationBeats": 2, "fps": 12, "mirroringSafe": True},
    "rockStep": {"durationBeats": 1, "fps": 12, "mirroringSafe": True},
    "doubleStep": {"durationBeats": 1, "fps": 12, "mirroringSafe": True},
    "tripleStep": {"durationBeats": 2, "fps": 12, "mirroringSafe": True},
    "crisscross": {"durationBeats": 2, "fps": 12, "mirroringSafe": True},
    "turnaround": {"durationBeats": 2, "fps": 12, "mirroringSafe": True},
    "controlledEnding": {"durationBeats": 2, "fps": 12, "mirroringSafe": True},
    "weightShift": {"durationBeats": 0.25, "fps": 16, "mirroringSafe": True},
    "brushReturn": {"durationBeats": 0.25, "fps": 16, "mirroringSafe": True},
    "rearRecover": {"durationBeats": 0.375, "fps": 16, "mirroringSafe": True},
    "slideRecover": {"durationBeats": 0.375, "fps": 16, "mirroringSafe": True},
    "crossRecover": {"durationBeats": 0.5, "fps": 16, "mirroringSafe": True},
    "turnResolve": {"durationBeats": 0.5, "fps": 16, "mirroringSafe": True},
}

MOVEMENT_CLIPS = tuple(CLIP_SPECS)[:14]
TRANSITION_CLIPS = tuple(CLIP_SPECS)[14:]


def sample_frolic_clip(
    style: str,
    clip_id: str,
    phase: float,
    character: str = "kitty",
) -> dict:
    style = style if style in STYLES else "flatfoot"
    character = character if character in CHARACTERS else "kitty"
    phase = max(0.0, min(1.0, float(phase)))
    function = {
        "walkingStep": walking_step,
        "slidingWalk": sliding_walk,
        "shuffle": shuffle,
        "doubleShuffle": double_shuffle,
        "backstep": backstep,
        "chug": chug,
        "heelToeChange": heel_toe_change,
        "dragSlide": drag_slide,
        "rockStep": rock_step,
        "doubleStep": double_step,
        "tripleStep": triple_step,
        "crisscross": crisscross,
        "turnaround": turnaround,
        "controlledEnding": controlled_ending,
        "weightShift": weight_shift,
        "brushReturn": brush_return,
        "rearRecover": rear_recover,
        "slideRecover": slide_recover,
        "crossRecover": cross_recover,
        "turnResolve": turn_resolve,
    }.get(clip_id)
    if function is None:
        raise KeyError(f"Unknown Frolic clip: {clip_id}")
    pose = function(style, phase, character)
    pose["style"] = style
    pose["character"] = character
    pose["clip"] = clip_id
    return pose


def walking_step(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    cycle = sin(phase * pi * 2)
    left_lift = max(0.0, -cycle) * spec["lift"]
    right_lift = max(0.0, cycle) * spec["lift"]
    left_x = spec["spread"] + max(0.0, -cycle) * spec["travel"]
    right_x = -spec["spread"] - max(0.0, cycle) * spec["travel"]
    support = "left" if cycle >= 0.12 else "right" if cycle <= -0.12 else "both"
    weight = 2.5 if support == "left" else -2.5 if support == "right" else 0
    bounce = abs(cycle) * spec["bounce"] * 0.7
    return build_pose(
        style,
        character,
        phase,
        left_foot=(48 + left_x, 86 - left_lift, 48 + left_x + 5, 88 - left_lift),
        right_foot=(48 + right_x, 86 - right_lift, 48 + right_x - 5, 88 - right_lift),
        pelvis=(48 + weight, spec["pelvis_y"] + bounce),
        support=support,
        arm_swing=-cycle * spec["arm"],
        torso_lean=-cycle * 0.7,
        label=f"{style}-foundation-walk",
        expression="joy" if style == "buck" else "focus",
    )


def sliding_walk(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    sweep = sin(phase * pi * 2)
    glide = sin(phase * pi) * spec["travel"]
    left_x = 48 + spec["spread"] + sweep * 2.0
    right_x = 48 - spec["spread"] + sweep * 1.2
    support = "left" if phase < 0.48 else "right"
    pose = build_pose(
        style,
        character,
        phase,
        left_foot=(left_x, 86, left_x + 5, 88),
        right_foot=(right_x, 86, right_x - 5, 88),
        pelvis=(48 + glide - (1.6 if support == "right" else 0), spec["pelvis_y"] + 0.8),
        support=support,
        arm_swing=-sweep * spec["arm"] * 0.55,
        torso_lean=-sweep * 0.35,
        label=f"{style}-sliding-walk",
    )
    # The named glide is intentional floor travel, not a planted contact.
    pose["contacts"] = ("leftFoot", "rightFoot") if phase in (0.0, 1.0) else ()
    return pose


def shuffle(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    brush_arc = sin(phase * pi)
    return build_pose(
        style,
        character,
        phase,
        left_foot=(
            48 + spec["spread"] + brush_arc * (5 + spec["spring"] * 2),
            86 - brush_arc * spec["lift"],
            53 + spec["spread"] + brush_arc * 5,
            88 - brush_arc * spec["lift"],
        ),
        right_foot=(48 - spec["spread"], 86, 43 - spec["spread"], 88),
        pelvis=(45.5, spec["pelvis_y"] + abs(sin(phase * pi * 2)) * spec["bounce"] * 0.45),
        support="right",
        arm_swing=-brush_arc * spec["arm"] * 0.45,
        torso_lean=-1.0,
        label=f"{style}-shuffle",
    )


def double_shuffle(style: str, phase: float, character: str) -> dict:
    local = (phase * 2) % 1
    pose = shuffle(style, local, character)
    pose["label"] = f"{style}-double-shuffle"
    if phase >= 0.5:
        pose["anchors"]["pelvis"] = (
            pose["anchors"]["pelvis"][0] + 1.2,
            pose["anchors"]["pelvis"][1] - STYLE_SPECS[style]["spring"],
        )
        _rebuild_torso(pose, style, character, torso_lean=0.6, arm_swing=STYLE_SPECS[style]["arm"] * 0.35)
    return pose


def backstep(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    arc = sin(phase * pi)
    pose = build_pose(
        style,
        character,
        phase,
        left_foot=(48 + spec["spread"] - arc * 4, 86 - arc * spec["lift"] * 0.65, 53 + spec["spread"] - arc * 3, 88 - arc * spec["lift"] * 0.65),
        right_foot=(48 - spec["spread"], 86, 43 - spec["spread"], 88),
        pelvis=(45.5 + sin(phase * pi * 2) * 1.8, spec["pelvis_y"] + arc * 1.5),
        support="right" if phase < 0.99 else "both",
        arm_swing=arc * spec["arm"] * 0.65,
        torso_lean=arc * 1.2,
        label=f"{style}-backstep",
    )
    return pose


def chug(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    rebound = sin(phase * pi)
    shift = sin(phase * pi * 2) * 1.6
    support = "both" if phase in (0.0, 1.0) else "none"
    return build_pose(
        style,
        character,
        phase,
        left_foot=(48 + spec["spread"] - shift, 86, 53 + spec["spread"] - shift, 88),
        right_foot=(48 - spec["spread"] - shift, 86 - rebound * 1.2, 43 - spec["spread"] - shift, 88 - rebound * 1.2),
        pelvis=(48 - shift * 0.4, spec["pelvis_y"] - rebound * (1.5 + spec["spring"])),
        support=support,
        arm_swing=-shift * spec["arm"] * 0.25,
        torso_lean=-rebound * 0.5,
        label=f"{style}-chug",
        expression="joy",
    )


def heel_toe_change(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    half = phase < 0.5
    local = (phase * 2) % 1
    heel_lift = sin(local * pi) * (2.2 + spec["spring"])
    left_ankle = 86 - (heel_lift if half else 0)
    right_ankle = 86 - (heel_lift if not half else 0)
    support = "right" if half else "left"
    return build_pose(
        style,
        character,
        phase,
        left_foot=(48 + spec["spread"], left_ankle, 53 + spec["spread"], 88),
        right_foot=(48 - spec["spread"], right_ankle, 43 - spec["spread"], 88),
        pelvis=((45.5 if half else 50.5), spec["pelvis_y"] + 0.8),
        support=support,
        arm_swing=(1 if half else -1) * spec["arm"] * 0.35,
        torso_lean=(1 if half else -1) * 0.55,
        label=f"{style}-heel-toe-change",
    )


def drag_slide(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    glide = smoothstep(phase) * (6 + spec["travel"])
    return build_pose(
        style,
        character,
        phase,
        left_foot=(48 + spec["spread"], 86, 53 + spec["spread"], 88),
        right_foot=(48 - spec["spread"] + glide, 86, 43 - spec["spread"] + glide, 88),
        pelvis=(50 + glide * 0.35, spec["pelvis_y"] + 1.0),
        support="left",
        arm_swing=-sin(phase * pi) * spec["arm"] * 0.45,
        torso_lean=-sin(phase * pi) * 0.8,
        label=f"{style}-drag-slide",
    )


def rock_step(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    rock = sin(phase * pi * 2)
    support = "left" if rock >= 0 else "right"
    return build_pose(
        style,
        character,
        phase,
        left_foot=(48 + spec["spread"], 86 - max(0, -rock) * 1.2, 53 + spec["spread"], 88 - max(0, -rock) * 1.2),
        right_foot=(48 - spec["spread"], 86 - max(0, rock) * 1.2, 43 - spec["spread"], 88 - max(0, rock) * 1.2),
        pelvis=(48 + (2.8 if support == "left" else -2.8), spec["pelvis_y"] + abs(rock) * 0.8),
        support=support,
        arm_swing=-rock * spec["arm"] * 0.45,
        torso_lean=-rock * 0.65,
        label=f"{style}-rock-step",
    )


def double_step(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    arc = sin(phase * pi)
    snap = sin(phase * pi * 2)
    pose = build_pose(
        style,
        character,
        phase,
        left_foot=(48 + spec["spread"] + snap * 3.5, 86 - arc * spec["lift"], 53 + spec["spread"] + snap * 3.5, 88 - arc * spec["lift"]),
        right_foot=(48 - spec["spread"], 86, 43 - spec["spread"], 88),
        pelvis=(45.5 + arc * 1.5, spec["pelvis_y"] - arc * spec["bounce"] * 0.45),
        support="right" if phase < 0.99 else "both",
        arm_swing=-snap * spec["arm"] * 0.7,
        torso_lean=-snap * 0.8,
        label=f"{style}-double-step",
        expression="joy" if style == "clog" else "focus",
    )
    return pose


def triple_step(style: str, phase: float, character: str) -> dict:
    local = (phase * 2) % 1
    pose = double_step(style, local, character)
    direction = 1 if phase < 0.5 else -1
    pose["label"] = f"{style}-triple-step"
    pose["anchors"]["pelvis"] = (
        pose["anchors"]["pelvis"][0] + direction * 1.4,
        pose["anchors"]["pelvis"][1],
    )
    _rebuild_torso(
        pose,
        style,
        character,
        torso_lean=-direction * 0.9,
        arm_swing=direction * STYLE_SPECS[style]["arm"] * 0.55,
    )
    return pose


def crisscross(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    cross = sin(phase * pi)
    switch = sin(phase * pi * 2)
    left_x = 48 + spec["spread"] - cross * (spec["spread"] * 1.55)
    right_x = 48 - spec["spread"] + cross * (spec["spread"] * 1.55)
    # Crossing shoes keep distinct directional toes at the closest pass. The
    # shortened toe reach prevents the two feet becoming one central pixel
    # shape while preserving the scissor path and anatomical left/right depth.
    toe_reach = 3.0 if cross > 0.45 else 5.0
    left_lift = max(0, switch) * spec["lift"] * 0.75
    right_lift = max(0, -switch) * spec["lift"] * 0.75
    support = "right" if switch > 0.12 else "left" if switch < -0.12 else "both"
    pose = build_pose(
        style,
        character,
        phase,
        left_foot=(left_x, 86 - left_lift, left_x + toe_reach, 88 - left_lift),
        right_foot=(right_x, 86 - right_lift, right_x - toe_reach, 88 - right_lift),
        pelvis=(48 + (2 if support == "left" else -2 if support == "right" else 0), spec["pelvis_y"] - cross * spec["spring"]),
        support=support,
        arm_swing=-switch * spec["arm"] * 0.8,
        torso_lean=-switch * 1.1,
        label=f"{style}-crisscross",
        expression="joy",
    )
    if cross > 0.45:
        pose["depth"].update({
            "leftThigh": -0.7,
            "leftShin": -0.6,
            "leftFoot": -0.5,
            "rightThigh": 0.9,
            "rightShin": 1.0,
            "rightFoot": 1.1,
        })
    if 0.0 < phase < 1.0:
        # Crossing feet travel through one another in screen space; they are
        # supported by weight transfer but are not declared planted here.
        pose["contacts"] = ()
    return pose


def turnaround(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    cross = sin(phase * pi)
    resolve = sin(phase * pi * 2)
    left_x = 48 + spec["spread"] - cross * 8
    right_x = 48 - spec["spread"] + cross * 5
    left_lift = max(0, resolve) * spec["lift"] * 0.55
    right_lift = max(0, -resolve) * spec["lift"] * 0.55
    support = "right" if resolve > 0.1 else "left" if resolve < -0.1 else "both"
    pose = build_pose(
        style,
        character,
        phase,
        left_foot=(left_x, 86 - left_lift, left_x + 5, 88 - left_lift),
        right_foot=(right_x, 86 - right_lift, right_x - 5, 88 - right_lift),
        pelvis=(48 + sin(phase * pi * 2) * 3, spec["pelvis_y"] - cross * (1.2 + spec["spring"])),
        support=support,
        arm_swing=-resolve * spec["arm"],
        torso_lean=sin(phase * pi * 2) * 1.6,
        label=f"{style}-turnaround",
        expression="joy",
        flourish=cross,
    )
    if 0.08 < phase < 0.92:
        pose["contacts"] = ()
    return pose


def controlled_ending(style: str, phase: float, character: str) -> dict:
    spec = STYLE_SPECS[style]
    anticipation = sin(min(1, phase * 1.35) * pi)
    settle = smoothstep(max(0, (phase - 0.62) / 0.38))
    left_lift = anticipation * spec["lift"] * 0.8 * (1 - settle)
    pelvis_y = spec["pelvis_y"] - anticipation * (1.3 + spec["spring"]) + settle * 1.8
    return build_pose(
        style,
        character,
        phase,
        left_foot=(48 + spec["spread"] + anticipation * 2, 86 - left_lift, 53 + spec["spread"] + anticipation * 2, 88 - left_lift),
        right_foot=(48 - spec["spread"], 86, 43 - spec["spread"], 88),
        pelvis=(48 + anticipation * 1.6, pelvis_y),
        support="right" if phase < 0.96 else "both",
        arm_swing=-anticipation * spec["arm"] * 0.55,
        torso_lean=-anticipation * 0.8,
        label=f"{style}-controlled-ending",
        expression="joy",
        flourish=anticipation * 0.55,
    )


def weight_shift(style: str, phase: float, character: str) -> dict:
    pose = rock_step(style, phase * 0.5, character)
    pose["contacts"] = ()
    return pose


def brush_return(style: str, phase: float, character: str) -> dict:
    pose = shuffle(style, 0.55 + phase * 0.45, character)
    pose["contacts"] = ()
    return pose


def rear_recover(style: str, phase: float, character: str) -> dict:
    pose = backstep(style, 0.55 + phase * 0.45, character)
    pose["contacts"] = ()
    return pose


def slide_recover(style: str, phase: float, character: str) -> dict:
    pose = sliding_walk(style, 0.5 + phase * 0.5, character)
    pose["label"] = f"{style}-slide-recover"
    pose["contacts"] = ()
    return pose


def cross_recover(style: str, phase: float, character: str) -> dict:
    pose = crisscross(style, 0.5 + phase * 0.5, character)
    pose["label"] = f"{style}-cross-recover"
    pose["contacts"] = ()
    return pose


def turn_resolve(style: str, phase: float, character: str) -> dict:
    pose = turnaround(style, 0.5 + phase * 0.5, character)
    pose["label"] = f"{style}-turn-resolve"
    pose["contacts"] = ()
    return pose


def build_pose(
    style: str,
    character: str,
    phase: float,
    *,
    left_foot: tuple[float, float, float, float],
    right_foot: tuple[float, float, float, float],
    pelvis: tuple[float, float],
    support: str,
    arm_swing: float,
    torso_lean: float,
    label: str,
    expression: str = "focus",
    flourish: float = 0.0,
) -> dict:
    spec = STYLE_SPECS[style]
    character_delay = sin((phase + (0.08 if character == "soder" else 0)) * pi * 2)
    pelvis_x = pelvis[0] + (0.45 * character_delay if character == "soder" else 0)
    pelvis_y = pelvis[1] + (0.45 if character == "soder" else 0)
    chest = (pelvis_x + torso_lean, pelvis_y - 13.0)
    neck = (chest[0] - torso_lean * 0.15, chest[1] - 8.0)
    head = (
        neck[0] - torso_lean * 0.15 + (0.5 * character_delay if character == "soder" else 0),
        neck[1] - 10.0,
    )
    left_hip = (pelvis_x + 5.0, pelvis_y)
    right_hip = (pelvis_x - 5.0, pelvis_y)
    left_ankle = (left_foot[0], left_foot[1])
    right_ankle = (right_foot[0], right_foot[1])
    left_knee = solve_joint(left_hip, left_ankle, 14.6, 13.6, +1)
    right_knee = solve_joint(right_hip, right_ankle, 14.6, 13.6, -1)
    shoulder_spread = 7.6
    left_shoulder = (chest[0] + shoulder_spread, chest[1] - 2.4)
    right_shoulder = (chest[0] - shoulder_spread, chest[1] - 2.4)
    soder_width = 1.5 if character == "soder" else 0
    left_hand_target = (
        65 + soder_width + arm_swing + flourish * 3.0,
        64 - abs(arm_swing) * 0.18 - flourish * (4.0 + spec["spring"]),
    )
    right_hand_target = (
        31 - soder_width + arm_swing - flourish * 4.0,
        64 - abs(arm_swing) * 0.16 - flourish * (7.0 + spec["spring"]),
    )
    if character == "kitty":
        left_hand_target = (left_hand_target[0], left_hand_target[1] - max(0, flourish) * 2)
    else:
        right_hand_target = (right_hand_target[0] - character_delay, right_hand_target[1] + character_delay * 0.5)
    left_wrist = point_toward(left_hand_target, left_shoulder, 4.1)
    right_wrist = point_toward(right_hand_target, right_shoulder, 4.1)
    left_elbow = solve_joint(left_shoulder, left_wrist, 10.2, 9.4, +1)
    right_elbow = solve_joint(right_shoulder, right_wrist, 10.2, 9.4, -1)
    contacts = {
        "left": ("leftFoot",),
        "right": ("rightFoot",),
        "both": ("leftFoot", "rightFoot"),
        "none": (),
    }[support]
    depth = deepcopy(DEFAULT_DEPTH)
    if support == "right":
        depth.update({
            "leftThigh": -0.7,
            "leftShin": -0.6,
            "leftFoot": -0.5,
            "rightThigh": 0.9,
            "rightShin": 1.0,
            "rightFoot": 1.1,
        })
    if arm_swing > 0:
        depth.update({
            "leftUpperArm": 1.25,
            "leftForearm": 1.35,
            "leftHand": 1.45,
            "rightUpperArm": -1.8,
            "rightForearm": -1.7,
            "rightHand": -1.6,
        })
    else:
        depth.update({
            "leftUpperArm": -1.5,
            "leftForearm": -1.4,
            "leftHand": -1.3,
            "rightUpperArm": 1.15,
            "rightForearm": 1.25,
            "rightHand": 1.35,
        })
    pose = make_pose(
        {
            "root": (pelvis_x, pelvis_y + 2),
            "pelvis": (pelvis_x, pelvis_y),
            "chest": chest,
            "neck": neck,
            "head": head,
            "leftShoulder": left_shoulder,
            "leftElbow": left_elbow,
            "leftWrist": left_wrist,
            "leftHand": left_hand_target,
            "rightShoulder": right_shoulder,
            "rightElbow": right_elbow,
            "rightWrist": right_wrist,
            "rightHand": right_hand_target,
            "leftHip": left_hip,
            "leftKnee": left_knee,
            "leftAnkle": left_ankle,
            "leftFoot": (left_foot[2], left_foot[3]),
            "rightHip": right_hip,
            "rightKnee": right_knee,
            "rightAnkle": right_ankle,
            "rightFoot": (right_foot[2], right_foot[3]),
        },
        depth=depth,
        label=label,
        contacts=contacts,
        expression=expression,
    )
    pose["support"] = support
    pose["centerOfMass"] = (chest[0] * 0.35 + pelvis_x * 0.65, pelvis_y - 4)
    return pose


def _rebuild_torso(
    pose: dict,
    style: str,
    character: str,
    *,
    torso_lean: float,
    arm_swing: float,
) -> None:
    anchors = pose["anchors"]
    pelvis = anchors["pelvis"]
    chest = (pelvis[0] + torso_lean, pelvis[1] - 13)
    neck = (chest[0] - torso_lean * 0.15, chest[1] - 8)
    head = (neck[0] - torso_lean * 0.15, neck[1] - 10)
    anchors.update({"chest": chest, "neck": neck, "head": head})
    shoulder_spread = 7.6
    anchors["leftShoulder"] = (chest[0] + shoulder_spread, chest[1] - 2.4)
    anchors["rightShoulder"] = (chest[0] - shoulder_spread, chest[1] - 2.4)
    width = 1.5 if character == "soder" else 0
    left_hand = (65 + width + arm_swing, 64 - abs(arm_swing) * 0.18)
    right_hand = (31 - width + arm_swing, 64 - abs(arm_swing) * 0.16)
    left_wrist = point_toward(left_hand, anchors["leftShoulder"], 4.1)
    right_wrist = point_toward(right_hand, anchors["rightShoulder"], 4.1)
    anchors["leftElbow"] = solve_joint(anchors["leftShoulder"], left_wrist, 10.2, 9.4, +1)
    anchors["leftWrist"] = left_wrist
    anchors["leftHand"] = left_hand
    anchors["rightElbow"] = solve_joint(anchors["rightShoulder"], right_wrist, 10.2, 9.4, -1)
    anchors["rightWrist"] = right_wrist
    anchors["rightHand"] = right_hand


def solve_joint(
    start: tuple[float, float],
    end: tuple[float, float],
    upper: float,
    lower: float,
    bend: int,
) -> tuple[float, float]:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    distance = sqrt(dx * dx + dy * dy) or 0.001
    distance = max(abs(upper - lower) + 0.001, min(upper + lower - 0.001, distance))
    direction = (dx / (sqrt(dx * dx + dy * dy) or 1), dy / (sqrt(dx * dx + dy * dy) or 1))
    along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
    height = sqrt(max(0, upper * upper - along * along))
    base = (start[0] + direction[0] * along, start[1] + direction[1] * along)
    perpendicular = (-direction[1], direction[0])
    return (
        base[0] + perpendicular[0] * height * bend,
        base[1] + perpendicular[1] * height * bend,
    )


def point_toward(
    target: tuple[float, float],
    source: tuple[float, float],
    distance: float,
) -> tuple[float, float]:
    dx = source[0] - target[0]
    dy = source[1] - target[1]
    length = sqrt(dx * dx + dy * dy) or 1
    return target[0] + dx / length * distance, target[1] + dy / length * distance


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


def accent_phases(clip_id: str) -> tuple[float, ...]:
    return {
        "walkingStep": (0.0, 0.5),
        "slidingWalk": (0.0, 0.21875, 0.5, 0.75),
        "shuffle": (0.125, 0.375, 0.75),
        "doubleShuffle": (0.0625, 0.1875, 0.3125, 0.5625, 0.6875, 0.875),
        "backstep": (0.0, 0.4375, 0.75),
        "chug": (0.0, 0.25, 0.75),
        "heelToeChange": (0.0, 0.25, 0.5, 0.75),
        "dragSlide": (0.0, 0.15625, 0.4375, 0.625, 0.84375),
        "rockStep": (0.0, 0.5, 0.75),
        "doubleStep": (0.0, 0.1875, 0.375, 0.75),
        "tripleStep": (0.0, 0.09375, 0.1875, 0.375, 0.5, 0.59375, 0.6875, 0.875),
        "crisscross": (0.0, 0.25, 0.5, 0.75),
        "turnaround": (0.0, 0.25, 0.5, 0.75),
        "controlledEnding": (0.0, 0.375, 0.75),
    }.get(clip_id, (0.0, 1.0))


def marker_for_phase(clip_id: str, phase: float) -> tuple[str, ...]:
    markers = []
    for index, accent in enumerate(accent_phases(clip_id)):
        if abs(phase - accent) <= 0.035:
            markers.append(f"CONTACT_{index + 1}")
    if phase <= 0.04:
        markers.append("ENTRY")
    if phase >= 0.96:
        markers.append("EXIT")
    return tuple(markers)


def approval_samples() -> tuple[tuple[str, str, float], ...]:
    return (
        ("neutral", "walkingStep", 0.0),
        ("foundation", "walkingStep", 0.28),
        ("shuffle", "shuffle", 0.46),
        ("backstep", "backstep", 0.48),
        ("chug", "chug", 0.48),
        ("heel-toe", "heelToeChange", 0.28),
        ("drag-slide", "dragSlide", 0.52),
        ("crisscross", "crisscross", 0.5),
        ("turnaround", "turnaround", 0.48),
        ("ending", "controlledEnding", 0.82),
    )
