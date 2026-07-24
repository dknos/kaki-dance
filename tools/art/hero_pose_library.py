"""Authored camera-space poses for the Kaki-Dance production sprite atlases.

The public game never executes this module.  It is an offline source file shared
by the Blender reference build and the pixel cleanup/atlas build.  Coordinates
are in the 96 x 96 gameplay drawing plane: X grows screen-right, Y grows down,
and per-segment depth grows toward the orthographic camera.

Anatomical left is always the dancer's left.  Because the heroes face camera,
their anatomical left normally appears on screen-right.
"""

from __future__ import annotations

from copy import deepcopy
from math import cos, pi, sin


ANCHORS = (
    "root",
    "pelvis",
    "chest",
    "neck",
    "head",
    "leftShoulder",
    "leftElbow",
    "leftWrist",
    "leftHand",
    "rightShoulder",
    "rightElbow",
    "rightWrist",
    "rightHand",
    "leftHip",
    "leftKnee",
    "leftAnkle",
    "leftFoot",
    "rightHip",
    "rightKnee",
    "rightAnkle",
    "rightFoot",
)

SEGMENTS = {
    "leftUpperArm": ("leftShoulder", "leftElbow"),
    "leftForearm": ("leftElbow", "leftWrist"),
    "leftHand": ("leftWrist", "leftHand"),
    "rightUpperArm": ("rightShoulder", "rightElbow"),
    "rightForearm": ("rightElbow", "rightWrist"),
    "rightHand": ("rightWrist", "rightHand"),
    "leftThigh": ("leftHip", "leftKnee"),
    "leftShin": ("leftKnee", "leftAnkle"),
    "leftFoot": ("leftAnkle", "leftFoot"),
    "rightThigh": ("rightHip", "rightKnee"),
    "rightShin": ("rightKnee", "rightAnkle"),
    "rightFoot": ("rightAnkle", "rightFoot"),
}

DEFAULT_DEPTH = {
    "tail": -3.0,
    "rightUpperArm": -1.8,
    "rightForearm": -1.7,
    "rightHand": -1.6,
    "rightThigh": -1.4,
    "rightShin": -1.3,
    "rightFoot": -1.2,
    "pelvis": -0.1,
    "torso": 0.0,
    "leftThigh": 0.8,
    "leftShin": 0.9,
    "leftFoot": 1.0,
    "leftUpperArm": 1.2,
    "leftForearm": 1.3,
    "leftHand": 1.4,
    "head": 2.4,
}

CLIP_SPECS = {
    "idleGroove": {"durationBeats": 2, "fps": 12, "mirroringSafe": True},
    "basicRock": {"durationBeats": 4, "fps": 12, "mirroringSafe": True},
    "basicGoDown": {"durationBeats": 4, "fps": 12, "mirroringSafe": False},
    "sixStep": {"durationBeats": 4, "fps": 12, "mirroringSafe": False},
    "windmill": {"durationBeats": 4, "fps": 12, "mirroringSafe": False},
    "babyFreeze": {"durationBeats": 4, "fps": 12, "mirroringSafe": False},
    "cleanGetUp": {"durationBeats": 4, "fps": 12, "mirroringSafe": False},
    "victory": {"durationBeats": 2, "fps": 12, "mirroringSafe": True},
    "missRecovery": {"durationBeats": 2, "fps": 12, "mirroringSafe": True},
}


def base_stand() -> dict:
    return make_pose(
        {
            "root": (48, 61),
            "pelvis": (48, 59),
            "chest": (48, 46),
            "neck": (48, 38),
            "head": (48, 28),
            "leftShoulder": (55, 43),
            "leftElbow": (62, 51),
            "leftWrist": (62, 61),
            "leftHand": (64, 65),
            "rightShoulder": (41, 43),
            "rightElbow": (34, 51),
            "rightWrist": (34, 61),
            "rightHand": (32, 65),
            "leftHip": (53, 59),
            "leftKnee": (56, 73),
            "leftAnkle": (56, 86),
            "leftFoot": (62, 88),
            "rightHip": (43, 59),
            "rightKnee": (40, 73),
            "rightAnkle": (40, 86),
            "rightFoot": (34, 88),
        },
        label="neutral-groove",
        contacts=("leftFoot", "rightFoot"),
    )


def make_pose(
    anchors: dict,
    *,
    depth: dict | None = None,
    label: str = "",
    contacts: tuple[str, ...] = (),
    expression: str = "focus",
) -> dict:
    missing = [name for name in ANCHORS if name not in anchors]
    if missing:
        raise ValueError(f"Pose is missing anchors: {', '.join(missing)}")
    return {
        "anchors": {name: tuple(anchors[name]) for name in ANCHORS},
        "depth": {**DEFAULT_DEPTH, **(depth or {})},
        "label": label,
        "contacts": tuple(contacts),
        "expression": expression,
    }


def changed(
    source: dict,
    *,
    anchors: dict | None = None,
    depth: dict | None = None,
    label: str | None = None,
    contacts: tuple[str, ...] | None = None,
    expression: str | None = None,
) -> dict:
    result = deepcopy(source)
    if anchors:
        result["anchors"].update({name: tuple(value) for name, value in anchors.items()})
    if depth:
        result["depth"].update(depth)
    if label is not None:
        result["label"] = label
    if contacts is not None:
        result["contacts"] = tuple(contacts)
    if expression is not None:
        result["expression"] = expression
    return result


def interpolate_pose(left: dict, right: dict, amount: float) -> dict:
    amount = max(0.0, min(1.0, amount))
    smooth = amount * amount * (3.0 - 2.0 * amount)
    anchors = {}
    for name in ANCHORS:
        a = left["anchors"][name]
        b = right["anchors"][name]
        anchors[name] = (
            a[0] + (b[0] - a[0]) * smooth,
            a[1] + (b[1] - a[1]) * smooth,
        )
    depth = {}
    for name in set(left["depth"]) | set(right["depth"]):
        a = left["depth"].get(name, 0.0)
        b = right["depth"].get(name, 0.0)
        depth[name] = a + (b - a) * smooth
    return {
        "anchors": anchors,
        "depth": depth,
        "label": left["label"] if amount < 0.5 else right["label"],
        "contacts": left["contacts"] if amount < 0.5 else right["contacts"],
        "expression": left["expression"] if amount < 0.5 else right["expression"],
    }


def sample_keys(keys: tuple[tuple[float, dict], ...], phase: float) -> dict:
    phase = max(0.0, min(1.0, phase))
    if phase <= keys[0][0]:
        return deepcopy(keys[0][1])
    for index in range(1, len(keys)):
        right_phase, right = keys[index]
        if phase <= right_phase:
            left_phase, left = keys[index - 1]
            span = max(1e-9, right_phase - left_phase)
            return interpolate_pose(left, right, (phase - left_phase) / span)
    return deepcopy(keys[-1][1])


def idle_groove(phase: float) -> dict:
    """Continuous pocket with hip lead and shoulder counter."""
    base = base_stand()
    shift = sin(phase * pi * 2)
    pocket = abs(sin(phase * pi * 2))
    result = changed(
        base,
        anchors={
            "root": (48 + shift * 1.5, 61 + pocket * 1.2),
            "pelvis": (48 + shift * 1.7, 59 + pocket * 1.2),
            "chest": (48 - shift * 0.8, 46 + pocket * 0.4),
            "neck": (48 - shift * 0.7, 38 + pocket * 0.3),
            "head": (48 - shift * 0.5, 28 + pocket * 0.2),
            "leftShoulder": (55 - shift * 0.8, 43 + pocket * 0.4),
            "rightShoulder": (41 - shift * 0.8, 43 + pocket * 0.4),
            "leftElbow": (62 - shift * 1.8, 51 + pocket),
            "leftWrist": (61 - shift * 2.2, 61 + pocket),
            "leftHand": (63 - shift * 2.2, 65 + pocket),
            "rightElbow": (34 - shift * 1.8, 51 + pocket),
            "rightWrist": (35 - shift * 2.2, 61 + pocket),
            "rightHand": (33 - shift * 2.2, 65 + pocket),
            "leftHip": (53 + shift * 1.7, 59 + pocket * 1.2),
            "rightHip": (43 + shift * 1.7, 59 + pocket * 1.2),
            "leftKnee": (56 + shift * 1.2, 73 + pocket),
            "rightKnee": (40 + shift * 1.2, 73 + pocket),
        },
        label="neutral-groove",
    )
    return result


def basic_rock(phase: float) -> dict:
    """Alternating weight with authored cross-body forearm occlusion."""
    neutral = idle_groove(0)
    left_cross = changed(
        neutral,
        anchors={
            "pelvis": (50, 60),
            "chest": (47, 46),
            "head": (46, 28),
            "leftShoulder": (54, 43),
            "leftElbow": (58, 51),
            "leftWrist": (40, 44),
            "leftHand": (35, 42),
            "rightShoulder": (40, 43),
            "rightElbow": (31, 49),
            "rightWrist": (29, 59),
            "rightHand": (28, 64),
            "leftHip": (55, 60),
            "leftKnee": (58, 73),
            "leftAnkle": (58, 86),
            "leftFoot": (64, 88),
            "rightHip": (45, 60),
            "rightKnee": (42, 74),
            "rightAnkle": (40, 86),
            "rightFoot": (34, 88),
        },
        depth={
            # The upper arm disappears under the hoodie, then the elbow clears
            # its edge and the forearm crosses in front of the chest.
            "leftUpperArm": -0.8,
            "leftForearm": 1.8,
            "leftHand": 2.0,
            "rightUpperArm": -1.7,
            "rightForearm": -1.6,
            "rightHand": -1.5,
        },
        label="cross-body-left",
        contacts=("leftFoot", "rightFoot"),
    )
    right_cross = changed(
        neutral,
        anchors={
            "pelvis": (46, 60),
            "chest": (49, 46),
            "head": (50, 28),
            "rightShoulder": (42, 43),
            "rightElbow": (38, 51),
            "rightWrist": (56, 44),
            "rightHand": (61, 42),
            "leftShoulder": (56, 43),
            "leftElbow": (65, 49),
            "leftWrist": (67, 59),
            "leftHand": (68, 64),
            "rightHip": (41, 60),
            "rightKnee": (38, 73),
            "rightAnkle": (38, 86),
            "rightFoot": (32, 88),
            "leftHip": (51, 60),
            "leftKnee": (54, 74),
            "leftAnkle": (56, 86),
            "leftFoot": (62, 88),
        },
        depth={
            "rightUpperArm": -0.8,
            "rightForearm": 1.8,
            "rightHand": 2.0,
            "leftUpperArm": -1.7,
            "leftForearm": -1.6,
            "leftHand": -1.5,
        },
        label="cross-body-right",
        contacts=("leftFoot", "rightFoot"),
    )
    # Depth changes happen only at the open-arm clearance drawings around 0.5.
    left_open = changed(
        neutral,
        anchors={
            "leftElbow": (64, 48),
            "leftWrist": (69, 55),
            "leftHand": (71, 60),
            "rightElbow": (32, 52),
            "rightWrist": (29, 61),
            "rightHand": (27, 65),
        },
        label="left-clearance",
    )
    right_open = changed(
        neutral,
        anchors={
            "rightElbow": (32, 48),
            "rightWrist": (27, 55),
            "rightHand": (25, 60),
            "leftElbow": (64, 52),
            "leftWrist": (67, 61),
            "leftHand": (69, 65),
        },
        label="right-clearance",
    )
    keys = (
        (0.00, left_open),
        (0.22, left_cross),
        (0.44, left_open),
        (0.50, neutral),
        (0.56, right_open),
        (0.72, right_cross),
        (0.94, right_open),
        (1.00, left_open),
    )
    return sample_keys(keys, phase)


def basic_go_down(phase: float) -> dict:
    """Anticipation, hand-before-weight contact, compression, floor entry."""
    stand = basic_rock(0.06)
    anticipate = changed(
        stand,
        anchors={
            "pelvis": (50, 58),
            "chest": (47, 44),
            "head": (46, 26),
            "leftElbow": (66, 42),
            "leftWrist": (69, 34),
            "leftHand": (71, 30),
            "rightElbow": (34, 48),
            "rightWrist": (30, 55),
            "rightHand": (28, 59),
        },
        depth={"leftUpperArm": 1.3, "leftForearm": 1.4, "leftHand": 1.5},
        label="go-down-anticipation",
    )
    reach = changed(
        anticipate,
        anchors={
            "root": (49, 67),
            "pelvis": (49, 65),
            "chest": (53, 52),
            "neck": (55, 45),
            "head": (57, 36),
            "leftShoulder": (59, 51),
            "leftElbow": (63, 62),
            "leftWrist": (63, 76),
            "leftHand": (63, 82),
            "rightShoulder": (46, 50),
            "rightElbow": (37, 55),
            "rightWrist": (33, 64),
            "rightHand": (31, 69),
            "leftHip": (54, 65),
            "leftKnee": (61, 74),
            "leftAnkle": (58, 86),
            "leftFoot": (64, 88),
            "rightHip": (44, 65),
            "rightKnee": (38, 75),
            "rightAnkle": (38, 86),
            "rightFoot": (32, 88),
        },
        label="go-down-reach",
    )
    hand_contact = changed(
        reach,
        anchors={
            "root": (48, 72),
            "pelvis": (48, 70),
            "chest": (53, 58),
            "neck": (57, 51),
            "head": (60, 43),
            "leftShoulder": (59, 57),
            "leftElbow": (62, 69),
            "leftWrist": (62, 84),
            "leftHand": (62, 88),
            "rightShoulder": (47, 56),
            "rightElbow": (38, 62),
            "rightWrist": (34, 71),
            "rightHand": (32, 76),
            "leftHip": (53, 70),
            "leftKnee": (64, 75),
            "leftAnkle": (59, 86),
            "leftFoot": (65, 88),
            "rightHip": (43, 70),
            "rightKnee": (36, 77),
            "rightAnkle": (38, 87),
            "rightFoot": (32, 89),
        },
        label="hand-contact-before-weight",
        contacts=("leftHand", "leftFoot", "rightFoot"),
    )
    transfer = changed(
        hand_contact,
        anchors={
            "root": (45, 73),
            "pelvis": (45, 71),
            "chest": (51, 60),
            "neck": (55, 54),
            "head": (59, 46),
            "leftShoulder": (57, 59),
            "leftElbow": (61, 70),
            "leftWrist": (62, 84),
            "leftHand": (62, 88),
            "rightShoulder": (45, 58),
            "rightElbow": (37, 66),
            "rightWrist": (31, 74),
            "rightHand": (28, 78),
            "leftHip": (50, 71),
            "leftKnee": (58, 79),
            "leftAnkle": (54, 87),
            "leftFoot": (60, 89),
            "rightHip": (40, 71),
            "rightKnee": (33, 79),
            "rightAnkle": (36, 87),
            "rightFoot": (29, 89),
        },
        label="weight-transfer",
        contacts=("leftHand", "rightFoot"),
    )
    floor_ready = changed(
        transfer,
        anchors={
            "root": (46, 72),
            "pelvis": (46, 70),
            "chest": (48, 59),
            "neck": (50, 52),
            "head": (52, 43),
            "leftShoulder": (55, 58),
            "leftElbow": (60, 70),
            "leftWrist": (61, 84),
            "leftHand": (61, 88),
            "rightShoulder": (42, 58),
            "rightElbow": (34, 66),
            "rightWrist": (31, 78),
            "rightHand": (30, 83),
            "leftHip": (51, 70),
            "leftKnee": (62, 76),
            "leftAnkle": (60, 86),
            "leftFoot": (66, 88),
            "rightHip": (41, 70),
            "rightKnee": (34, 79),
            "rightAnkle": (37, 87),
            "rightFoot": (30, 89),
        },
        label="floor-ready-compression",
        contacts=("leftHand", "leftFoot", "rightFoot"),
    )
    return sample_keys(
        (
            (0.00, stand),
            (0.18, anticipate),
            (0.43, reach),
            (0.58, hand_contact),
            (0.78, transfer),
            (1.00, floor_ready),
        ),
        phase,
    )


def _six_step_poses() -> tuple[tuple[float, dict], ...]:
    """Six deliberately distinct support/leg placements."""
    start = basic_go_down(1)
    start = changed(
        start,
        anchors={
            "rightWrist": (33, 84),
            "rightHand": (33, 88),
            "leftHand": (62, 88),
            "rightElbow": (36, 70),
            "leftElbow": (59, 71),
        },
        contacts=("leftHand", "rightHand", "leftFoot", "rightFoot"),
        label="six-step-ready",
    )
    one = changed(
        start,
        anchors={
            "pelvis": (49, 69),
            "leftHip": (54, 69),
            "rightHip": (44, 69),
            "rightKnee": (49, 77),
            "rightAnkle": (58, 85),
            "rightFoot": (65, 88),
            "leftKnee": (64, 75),
            "leftAnkle": (64, 85),
            "leftFoot": (70, 88),
        },
        depth={"rightThigh": 1.7, "rightShin": 1.8, "rightFoot": 1.9},
        contacts=("leftHand", "rightHand", "leftFoot"),
        label="six-step-1-right-forward",
    )
    two = changed(
        one,
        anchors={
            "pelvis": (51, 68),
            "leftHip": (56, 68),
            "rightHip": (46, 68),
            "leftKnee": (58, 76),
            "leftAnkle": (46, 86),
            "leftFoot": (39, 89),
            "rightKnee": (55, 76),
            "rightAnkle": (65, 85),
            "rightFoot": (72, 88),
        },
        depth={
            "leftThigh": -1.2,
            "leftShin": -1.1,
            "leftFoot": -1.0,
            "rightThigh": 1.7,
            "rightShin": 1.8,
            "rightFoot": 1.9,
        },
        contacts=("leftHand", "rightHand", "rightFoot"),
        label="six-step-2-left-through",
    )
    three = changed(
        two,
        anchors={
            "pelvis": (48, 68),
            "leftHip": (53, 68),
            "rightHip": (43, 68),
            "leftKnee": (44, 74),
            "leftAnkle": (33, 83),
            "leftFoot": (26, 86),
            "rightKnee": (53, 76),
            "rightAnkle": (64, 85),
            "rightFoot": (71, 88),
        },
        depth={
            "leftThigh": 1.7,
            "leftShin": 1.8,
            "leftFoot": 1.9,
            "rightThigh": -1.2,
            "rightShin": -1.1,
            "rightFoot": -1.0,
        },
        contacts=("rightHand", "rightFoot"),
        label="six-step-3-left-open",
    )
    four = changed(
        three,
        anchors={
            "pelvis": (45, 69),
            "leftHip": (50, 69),
            "rightHip": (40, 69),
            "leftKnee": (40, 76),
            "leftAnkle": (29, 85),
            "leftFoot": (22, 88),
            "rightKnee": (45, 77),
            "rightAnkle": (35, 86),
            "rightFoot": (28, 89),
        },
        depth={
            "leftThigh": 1.6,
            "leftShin": 1.7,
            "leftFoot": 1.8,
            "rightThigh": -1.3,
            "rightShin": -1.2,
            "rightFoot": -1.1,
        },
        contacts=("leftHand", "rightHand", "leftFoot"),
        label="six-step-4-back",
    )
    five = changed(
        four,
        anchors={
            "pelvis": (44, 68),
            "leftHip": (49, 68),
            "rightHip": (39, 68),
            "rightKnee": (39, 76),
            "rightAnkle": (49, 85),
            "rightFoot": (56, 88),
            "leftKnee": (35, 76),
            "leftAnkle": (25, 85),
            "leftFoot": (18, 88),
        },
        depth={
            "rightThigh": 1.7,
            "rightShin": 1.8,
            "rightFoot": 1.9,
            "leftThigh": -1.2,
            "leftShin": -1.1,
            "leftFoot": -1.0,
        },
        contacts=("leftHand", "rightHand", "leftFoot"),
        label="six-step-5-right-through",
    )
    six = changed(
        five,
        anchors={
            "pelvis": (46, 69),
            "leftHip": (51, 69),
            "rightHip": (41, 69),
            "rightKnee": (34, 75),
            "rightAnkle": (24, 84),
            "rightFoot": (17, 87),
            "leftKnee": (57, 76),
            "leftAnkle": (62, 86),
            "leftFoot": (69, 88),
        },
        depth={
            "rightThigh": 1.7,
            "rightShin": 1.8,
            "rightFoot": 1.9,
            "leftThigh": -1.2,
            "leftShin": -1.1,
            "leftFoot": -1.0,
        },
        contacts=("leftHand", "leftFoot"),
        label="six-step-6-right-open",
    )
    return (
        (0.00, start),
        (1 / 6, one),
        (2 / 6, two),
        (3 / 6, three),
        (4 / 6, four),
        (5 / 6, five),
        (1.00, six),
    )


def six_step(phase: float) -> dict:
    return sample_keys(_six_step_poses(), phase)


def _windmill_pose(
    *,
    label: str,
    head: tuple[float, float],
    chest: tuple[float, float],
    pelvis: tuple[float, float],
    left_foot: tuple[float, float],
    right_foot: tuple[float, float],
    left_knee: tuple[float, float],
    right_knee: tuple[float, float],
    depth: dict,
    contacts: tuple[str, ...],
) -> dict:
    cx, cy = chest
    px, py = pelvis
    hx, hy = head
    return make_pose(
        {
            "root": (px, py + 2),
            "pelvis": pelvis,
            "chest": chest,
            "neck": ((cx * 0.35 + hx * 0.65), (cy * 0.35 + hy * 0.65)),
            "head": head,
            "leftShoulder": (cx + 2, cy + 5),
            "leftElbow": (cx + 10, cy + 10),
            "leftWrist": (cx + 15, min(88, cy + 18)),
            "leftHand": (cx + 17, min(89, cy + 22)),
            "rightShoulder": (cx - 2, cy - 4),
            "rightElbow": (cx - 10, cy + 2),
            "rightWrist": (cx - 15, min(88, cy + 12)),
            "rightHand": (cx - 17, min(89, cy + 16)),
            "leftHip": (px + 3, py),
            "leftKnee": left_knee,
            "leftAnkle": (left_foot[0] - 4, left_foot[1] - 2),
            "leftFoot": left_foot,
            "rightHip": (px - 3, py),
            "rightKnee": right_knee,
            "rightAnkle": (right_foot[0] + 4, right_foot[1] - 2),
            "rightFoot": right_foot,
        },
        depth=depth,
        label=label,
        contacts=contacts,
        expression="power",
    )


def windmill(phase: float) -> dict:
    """Eight bespoke shoulder/back quarter-turn drawings with leg scissors."""
    q0 = _windmill_pose(
        label="windmill-left-shoulder",
        head=(34, 68),
        chest=(43, 70),
        pelvis=(54, 68),
        left_foot=(78, 45),
        right_foot=(24, 86),
        left_knee=(67, 54),
        right_knee=(35, 79),
        depth={
            "leftThigh": 1.8,
            "leftShin": 1.9,
            "leftFoot": 2.0,
            "rightThigh": -1.4,
            "rightShin": -1.3,
            "rightFoot": -1.2,
            "head": 1.4,
        },
        contacts=("leftShoulder", "upperBack"),
    )
    q1 = _windmill_pose(
        label="windmill-upper-back",
        head=(38, 72),
        chest=(48, 69),
        pelvis=(56, 60),
        left_foot=(72, 31),
        right_foot=(26, 69),
        left_knee=(65, 43),
        right_knee=(38, 65),
        depth={
            "leftThigh": 1.2,
            "leftShin": 1.5,
            "leftFoot": 1.7,
            "rightThigh": -1.3,
            "rightShin": -1.1,
            "rightFoot": -0.9,
            "head": 1.2,
        },
        contacts=("upperBack",),
    )
    q2 = _windmill_pose(
        label="windmill-right-shoulder",
        head=(48, 74),
        chest=(54, 68),
        pelvis=(52, 57),
        left_foot=(62, 28),
        right_foot=(22, 44),
        left_knee=(58, 41),
        right_knee=(34, 50),
        depth={
            "rightThigh": 1.8,
            "rightShin": 1.9,
            "rightFoot": 2.0,
            "leftThigh": -1.4,
            "leftShin": -1.3,
            "leftFoot": -1.2,
            "head": 1.4,
        },
        contacts=("rightShoulder", "upperBack"),
    )
    q3 = _windmill_pose(
        label="windmill-head-clearance",
        head=(56, 71),
        chest=(56, 63),
        pelvis=(47, 57),
        left_foot=(34, 31),
        right_foot=(18, 62),
        left_knee=(42, 43),
        right_knee=(31, 59),
        depth={
            "rightThigh": 1.5,
            "rightShin": 1.7,
            "rightFoot": 1.8,
            "leftThigh": -1.3,
            "leftShin": -1.1,
            "leftFoot": -0.9,
            "head": 1.3,
        },
        contacts=("rightShoulder",),
    )
    q4 = _windmill_pose(
        label="windmill-right-hand-pass",
        head=(63, 66),
        chest=(55, 61),
        pelvis=(43, 65),
        left_foot=(18, 48),
        right_foot=(72, 84),
        left_knee=(29, 56),
        right_knee=(60, 77),
        depth={
            "rightThigh": 1.8,
            "rightShin": 1.9,
            "rightFoot": 2.0,
            "leftThigh": -1.4,
            "leftShin": -1.3,
            "leftFoot": -1.2,
            "head": 1.4,
        },
        contacts=("rightHand", "rightShoulder"),
    )
    q5 = _windmill_pose(
        label="windmill-back-return",
        head=(58, 72),
        chest=(49, 68),
        pelvis=(40, 62),
        left_foot=(24, 78),
        right_foot=(76, 42),
        left_knee=(34, 70),
        right_knee=(65, 52),
        depth={
            "rightThigh": 1.3,
            "rightShin": 1.6,
            "rightFoot": 1.8,
            "leftThigh": -1.3,
            "leftShin": -1.1,
            "leftFoot": -0.9,
            "head": 1.2,
        },
        contacts=("upperBack",),
    )
    q6 = _windmill_pose(
        label="windmill-left-shoulder-return",
        head=(48, 75),
        chest=(42, 69),
        pelvis=(44, 58),
        left_foot=(34, 85),
        right_foot=(75, 31),
        left_knee=(38, 76),
        right_knee=(62, 43),
        depth={
            "leftThigh": 1.8,
            "leftShin": 1.9,
            "leftFoot": 2.0,
            "rightThigh": -1.4,
            "rightShin": -1.3,
            "rightFoot": -1.2,
            "head": 1.4,
        },
        contacts=("leftShoulder", "upperBack"),
    )
    q7 = _windmill_pose(
        label="windmill-catch",
        head=(39, 71),
        chest=(40, 64),
        pelvis=(49, 58),
        left_foot=(68, 34),
        right_foot=(75, 66),
        left_knee=(60, 44),
        right_knee=(63, 62),
        depth={
            "leftThigh": 1.5,
            "leftShin": 1.7,
            "leftFoot": 1.8,
            "rightThigh": -1.3,
            "rightShin": -1.1,
            "rightFoot": -0.9,
            "head": 1.3,
        },
        contacts=("leftShoulder", "leftHand"),
    )
    return sample_keys(
        (
            (0.00, q0),
            (0.125, q1),
            (0.25, q2),
            (0.375, q3),
            (0.50, q4),
            (0.625, q5),
            (0.75, q6),
            (0.875, q7),
            (1.00, q0),
        ),
        phase,
    )


def baby_freeze(phase: float) -> dict:
    """A paw/elbow/head support triangle followed by a living hold."""
    catch = windmill(0.875)
    plant = make_pose(
        {
            "root": (57, 64),
            "pelvis": (57, 62),
            "chest": (49, 66),
            "neck": (43, 69),
            "head": (35, 73),
            "leftShoulder": (47, 69),
            # Supporting elbow is visibly tucked into the hip while the paw
            # plants below it; this is the load-bearing arm.
            "leftElbow": (52, 72),
            "leftWrist": (45, 84),
            "leftHand": (42, 89),
            "rightShoulder": (49, 62),
            "rightElbow": (58, 72),
            "rightWrist": (66, 84),
            "rightHand": (68, 89),
            "leftHip": (61, 59),
            "leftKnee": (70, 50),
            "leftAnkle": (79, 40),
            "leftFoot": (85, 37),
            "rightHip": (60, 65),
            "rightKnee": (70, 68),
            "rightAnkle": (79, 73),
            "rightFoot": (86, 75),
        },
        depth={
            "leftUpperArm": 1.4,
            "leftForearm": 1.5,
            "leftHand": 1.6,
            "rightUpperArm": -0.9,
            "rightForearm": 1.1,
            "rightHand": 1.2,
            "leftThigh": 1.8,
            "leftShin": 1.9,
            "leftFoot": 2.0,
            "rightThigh": -1.4,
            "rightShin": -1.3,
            "rightFoot": -1.2,
            "head": 2.2,
        },
        label="baby-freeze-support-triangle",
        contacts=("leftHand", "rightHand", "leftElbow"),
        expression="freeze",
    )
    impact = changed(
        plant,
        anchors={
            "pelvis": (57, 64),
            "chest": (49, 68),
            "neck": (43, 71),
            "head": (35, 75),
            "leftElbow": (52, 74),
            "rightElbow": (58, 74),
            "leftKnee": (70, 52),
            "rightKnee": (70, 70),
        },
        label="baby-freeze-impact-compression",
    )
    hold = changed(plant, label="baby-freeze-living-hold")
    result = sample_keys(
        (
            (0.00, catch),
            (0.20, plant),
            (0.28, impact),
            (0.38, plant),
            (1.00, hold),
        ),
        phase,
    )
    if phase > 0.38:
        breath = sin((phase - 0.38) / 0.62 * pi * 2) * 0.45
        for name in ("pelvis", "chest", "neck", "head", "leftHip", "rightHip"):
            x, y = result["anchors"][name]
            result["anchors"][name] = (x, y + breath)
    return result


def clean_get_up(phase: float) -> dict:
    """Push from the actual freeze, plant a foot, transfer, then groove."""
    freeze = baby_freeze(0.82)
    push = changed(
        freeze,
        anchors={
            "pelvis": (55, 66),
            "chest": (48, 69),
            "neck": (42, 71),
            "head": (35, 73),
            "leftShoulder": (46, 70),
            "leftElbow": (51, 75),
            "leftWrist": (44, 85),
            "leftHand": (42, 89),
            "rightShoulder": (49, 65),
            "rightElbow": (58, 74),
            "rightWrist": (66, 85),
            "rightHand": (68, 89),
            "leftHip": (59, 65),
            "leftKnee": (67, 61),
            "leftAnkle": (73, 70),
            "leftFoot": (78, 73),
            "rightHip": (58, 68),
            "rightKnee": (66, 72),
            "rightAnkle": (74, 79),
            "rightFoot": (80, 81),
        },
        label="get-up-push",
        contacts=("leftHand", "rightHand"),
    )
    foot_plant = changed(
        push,
        anchors={
            "root": (47, 72),
            "pelvis": (47, 69),
            "chest": (49, 57),
            "neck": (51, 49),
            "head": (52, 40),
            "leftShoulder": (56, 56),
            "leftElbow": (61, 67),
            "leftWrist": (65, 80),
            "leftHand": (66, 85),
            "rightShoulder": (43, 56),
            "rightElbow": (38, 69),
            "rightWrist": (36, 84),
            "rightHand": (36, 89),
            "leftHip": (52, 69),
            "leftKnee": (62, 74),
            "leftAnkle": (64, 86),
            "leftFoot": (70, 88),
            "rightHip": (42, 69),
            "rightKnee": (37, 78),
            "rightAnkle": (38, 87),
            "rightFoot": (32, 89),
        },
        label="get-up-foot-plant",
        contacts=("rightHand", "leftFoot", "rightFoot"),
    )
    squat = changed(
        base_stand(),
        anchors={
            "root": (48, 67),
            "pelvis": (48, 65),
            "chest": (48, 52),
            "neck": (48, 44),
            "head": (48, 34),
            "leftShoulder": (55, 49),
            "leftElbow": (64, 53),
            "leftWrist": (69, 61),
            "leftHand": (71, 65),
            "rightShoulder": (41, 49),
            "rightElbow": (32, 53),
            "rightWrist": (27, 61),
            "rightHand": (25, 65),
            "leftHip": (53, 65),
            "leftKnee": (59, 75),
            "leftAnkle": (57, 86),
            "leftFoot": (63, 88),
            "rightHip": (43, 65),
            "rightKnee": (37, 75),
            "rightAnkle": (39, 86),
            "rightFoot": (33, 88),
        },
        label="get-up-weight-transfer",
        contacts=("leftFoot", "rightFoot"),
    )
    rise = changed(idle_groove(0.12), label="get-up-return-groove")
    return sample_keys(
        (
            (0.00, freeze),
            (0.24, push),
            (0.50, foot_plant),
            (0.75, squat),
            (1.00, rise),
        ),
        phase,
    )


def victory(phase: float) -> dict:
    base = idle_groove(0.1)
    hit = changed(
        base,
        anchors={
            "pelvis": (48, 58),
            "chest": (48, 44),
            "head": (48, 26),
            "leftShoulder": (55, 41),
            "leftElbow": (62, 34),
            "leftWrist": (65, 25),
            "leftHand": (66, 20),
            "rightShoulder": (41, 41),
            "rightElbow": (34, 34),
            "rightWrist": (31, 25),
            "rightHand": (30, 20),
            "leftHip": (53, 58),
            "rightHip": (43, 58),
        },
        label="victory-paws-up",
        contacts=("leftFoot", "rightFoot"),
        expression="joy",
    )
    settle = changed(hit, anchors={"leftHand": (65, 22), "rightHand": (31, 22), "head": (48, 27)})
    return sample_keys(((0, base), (0.28, hit), (0.65, settle), (1, hit)), phase)


def miss_recovery(phase: float) -> dict:
    base = idle_groove(0)
    flinch = changed(
        base,
        anchors={
            "pelvis": (49, 63),
            "chest": (48, 50),
            "neck": (47, 43),
            "head": (46, 34),
            "leftElbow": (60, 55),
            "leftWrist": (56, 64),
            "leftHand": (54, 68),
            "rightElbow": (36, 55),
            "rightWrist": (40, 64),
            "rightHand": (42, 68),
            "leftKnee": (57, 75),
            "rightKnee": (41, 75),
        },
        label="miss-flinch",
        expression="oops",
    )
    recover = changed(idle_groove(0.25), label="miss-recover-pocket", expression="focus")
    return sample_keys(((0, base), (0.25, flinch), (0.55, flinch), (1, recover)), phase)


CLIP_FUNCTIONS = {
    "idleGroove": idle_groove,
    "basicRock": basic_rock,
    "basicGoDown": basic_go_down,
    "sixStep": six_step,
    "windmill": windmill,
    "babyFreeze": baby_freeze,
    "cleanGetUp": clean_get_up,
    "victory": victory,
    "missRecovery": miss_recovery,
}


def sample_clip(clip_id: str, phase: float) -> dict:
    try:
        return CLIP_FUNCTIONS[clip_id](phase)
    except KeyError as error:
        raise KeyError(f"Unknown production clip: {clip_id}") from error


def approval_samples() -> tuple[tuple[str, str, float], ...]:
    return (
        ("neutral-groove", "idleGroove", 0.22),
        ("cross-body-arm-groove", "basicRock", 0.22),
        ("deep-go-down", "basicGoDown", 0.62),
        ("floorwork-leg-cross", "sixStep", 2 / 6),
        ("baby-freeze", "babyFreeze", 0.72),
    )


def accent_phases(clip_id: str) -> tuple[float, ...]:
    return {
        "idleGroove": (0.0, 0.5),
        "basicRock": (0.0, 0.25, 0.5, 0.75),
        "basicGoDown": (0.0, 0.18, 0.43, 0.58, 0.78),
        "sixStep": (0.0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1.0),
        "windmill": (0.0, 0.25, 0.5, 0.75, 1.0),
        "babyFreeze": (0.0, 0.2, 0.28),
        "cleanGetUp": (0.24, 0.5, 0.75, 1.0),
        "victory": (0.28,),
        "missRecovery": (0.25, 1.0),
    }[clip_id]


def marker_for_phase(clip_id: str, phase: float) -> tuple[str, ...]:
    markers = []
    for accent in accent_phases(clip_id):
        if abs(phase - accent) <= 1 / max(12, CLIP_SPECS[clip_id]["fps"] * 2):
            markers.append("accent")
            break
    if clip_id in {"basicGoDown", "babyFreeze"} and phase < 0.2:
        markers.append("anticipation")
    if clip_id in {"cleanGetUp", "missRecovery"} and phase > 0.7:
        markers.append("recovery")
    if clip_id == "babyFreeze" and phase >= 0.2:
        markers.append("freeze")
    return tuple(markers)
