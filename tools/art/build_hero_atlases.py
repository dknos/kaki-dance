"""Build cleaned, trimmed, indexed hero sprite atlases and approval media.

This is an offline equivalent of a pixel-editor cleanup/export pass.  The
camera-space poses in ``hero_pose_library.py`` are redrawn at the exact gameplay
resolution with a constrained opaque palette, deliberate one/two-pixel
silhouettes, authored cuffs/hands/shoes, per-segment depth, and frame-specific
anchors.  Runtime code receives only the packed PNG pages and JSON metadata.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from hero_pose_library import (
    ANCHORS,
    CLIP_SPECS,
    SEGMENTS,
    accent_phases,
    approval_samples,
    marker_for_phase,
    sample_clip,
)


ROOT = Path(__file__).resolve().parents[2]
RUNTIME_ROOT = ROOT / "assets" / "heroes"
REVIEW_ROOT = ROOT / "docs" / "images" / "measure-match"
FRAME_SIZE = (96, 96)
PAGE_SIZE = (1024, 1024)
PADDING = 3
EXTRUSION = 1
BPM = 100

PALETTES = {
    "kitty": {
        "outline": "#090b1b",
        "face": "#f5e9c9",
        "faceShade": "#c9bda6",
        "faceLight": "#fff8df",
        "hair": "#4db8e8",
        "hairShade": "#2776b8",
        "hairLight": "#7ad8f5",
        "body": "#17172f",
        "bodyLight": "#30345d",
        "bodyShade": "#0f1025",
        "leg": "#111329",
        "legLight": "#292d52",
        "shoe": "#17172f",
        "shoeLight": "#454b78",
        "sole": "#070813",
        "cuff": "#f5e9c9",
        "accent": "#f46b45",
        "eye": "#26314c",
        "blush": "#ce4772",
    },
    "soder": {
        "outline": "#090b1b",
        "face": "#e4d8c5",
        "faceShade": "#b7aa98",
        "faceLight": "#fff1d9",
        "hair": "#4db8e8",
        "hairShade": "#2776b8",
        "hairLight": "#78d6ef",
        "body": "#5f963b",
        "bodyLight": "#8bc45a",
        "bodyShade": "#3f6f2d",
        "leg": "#568c35",
        "legLight": "#7eb64e",
        "shoe": "#4f8434",
        "shoeLight": "#8fc65c",
        "sole": "#17251a",
        "cuff": "#3c692d",
        "belly": "#9b7049",
        "bellyLight": "#c4925d",
        "accent": "#e178a5",
        "eye": "#26314c",
        "blush": "#ce4772",
        "hoodMouth": "#4f2340",
    },
}

SEGMENT_WIDTHS = {
    "UpperArm": (8.5, 7.5),
    "Forearm": (7.5, 6.5),
    "Hand": (5.5, 4.5),
    "Thigh": (10.5, 9.0),
    "Shin": (8.8, 7.2),
    "Foot": (8.5, 6.5),
}


def rgba(value: str) -> tuple[int, int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4)) + (255,)


def point(value: tuple[float, float]) -> tuple[int, int]:
    return (round(value[0]), round(value[1]))


def vector(left: tuple[float, float], right: tuple[float, float]) -> tuple[float, float]:
    dx = right[0] - left[0]
    dy = right[1] - left[1]
    length = math.hypot(dx, dy) or 1
    return dx / length, dy / length


def perpendicular(direction: tuple[float, float]) -> tuple[float, float]:
    return -direction[1], direction[0]


def offset(value: tuple[float, float], direction: tuple[float, float], distance: float):
    return value[0] + direction[0] * distance, value[1] + direction[1] * distance


def ellipse_box(center: tuple[float, float], rx: float, ry: float):
    return (
        round(center[0] - rx),
        round(center[1] - ry),
        round(center[0] + rx),
        round(center[1] + ry),
    )


def draw_capsule(
    draw: ImageDraw.ImageDraw,
    start: tuple[float, float],
    end: tuple[float, float],
    width_start: float,
    width_end: float,
    fill: str,
    outline: str,
    *,
    outline_width: int = 2,
):
    direction = vector(start, end)
    tangent = perpendicular(direction)
    polygon = [
        offset(start, tangent, width_start / 2 + outline_width),
        offset(end, tangent, width_end / 2 + outline_width),
        offset(end, tangent, -width_end / 2 - outline_width),
        offset(start, tangent, -width_start / 2 - outline_width),
    ]
    draw.polygon([point(value) for value in polygon], fill=outline)
    draw.ellipse(ellipse_box(start, width_start / 2 + outline_width, width_start / 2 + outline_width), fill=outline)
    draw.ellipse(ellipse_box(end, width_end / 2 + outline_width, width_end / 2 + outline_width), fill=outline)
    inner = [
        offset(start, tangent, width_start / 2),
        offset(end, tangent, width_end / 2),
        offset(end, tangent, -width_end / 2),
        offset(start, tangent, -width_start / 2),
    ]
    draw.polygon([point(value) for value in inner], fill=fill)
    draw.ellipse(ellipse_box(start, width_start / 2, width_start / 2), fill=fill)
    draw.ellipse(ellipse_box(end, width_end / 2, width_end / 2), fill=fill)


def draw_paw(
    draw: ImageDraw.ImageDraw,
    wrist: tuple[float, float],
    hand: tuple[float, float],
    palette: dict,
    depth_light: bool,
):
    direction = vector(wrist, hand)
    tangent = perpendicular(direction)
    center = offset(hand, direction, 0.4)
    fill = palette["faceLight"] if depth_light else palette["face"]
    outline = palette["outline"]
    draw.ellipse(ellipse_box(center, 4.0, 3.4), fill=outline)
    draw.ellipse(ellipse_box(center, 2.8, 2.3), fill=fill)
    # A directional thumb makes backward paws immediately visible in QA.
    thumb = offset(center, tangent, 2.4)
    thumb = offset(thumb, direction, -0.6)
    draw.ellipse(ellipse_box(thumb, 1.5, 1.5), fill=outline)
    draw.ellipse(ellipse_box(thumb, 0.8, 0.8), fill=fill)
    pad = offset(center, direction, 0.8)
    draw.ellipse(ellipse_box(pad, 0.8, 0.55), fill=palette.get("accent", palette["faceShade"]))


def draw_shoe(
    draw: ImageDraw.ImageDraw,
    ankle: tuple[float, float],
    foot: tuple[float, float],
    palette: dict,
    near: bool,
    style: str | None = None,
):
    direction = vector(ankle, foot)
    tangent = perpendicular(direction)
    toe = offset(foot, direction, 2.2)
    heel = offset(ankle, direction, -1.8)
    outer = [
        offset(heel, tangent, 3.4),
        offset(toe, tangent, 3.6),
        offset(toe, tangent, -3.0),
        offset(heel, tangent, -3.0),
    ]
    draw.polygon([point(value) for value in outer], fill=palette["outline"])
    inner = [
        offset(heel, tangent, 1.9),
        offset(foot, tangent, 2.3),
        offset(toe, tangent, 1.8),
        offset(toe, tangent, -1.6),
        offset(heel, tangent, -1.6),
    ]
    draw.polygon([point(value) for value in inner], fill=palette["shoeLight"] if near else palette["shoe"])
    sole_a = offset(heel, tangent, -2.1)
    sole_b = offset(toe, tangent, -2.1)
    draw.line([point(sole_a), point(sole_b)], fill=palette["sole"], width=2)
    if style == "clog":
        # Two compact metal highlights distinguish the optional tap profile
        # without hiding heel/toe direction or changing the shared anatomy.
        tap_color = palette["faceLight"]
        draw.line(
            [point(offset(heel, tangent, -2.35)), point(offset(heel, direction, 1.0))],
            fill=tap_color,
            width=1,
        )
        draw.line(
            [point(offset(toe, direction, -1.4)), point(offset(toe, direction, 0.4))],
            fill=tap_color,
            width=1,
        )
    elif style == "buck":
        ball = offset(toe, direction, -1.2)
        draw.point(point(offset(ball, tangent, -1.6)), fill=palette["shoeLight"])
    lace_a = offset(ankle, direction, 1.2)
    draw.line(
        [point(offset(lace_a, tangent, -1.7)), point(offset(lace_a, tangent, 1.7))],
        fill=palette["faceLight"],
        width=1,
    )


def draw_joint_seam(
    draw: ImageDraw.ImageDraw,
    center: tuple[float, float],
    fill: str,
    outline: str,
    radius: float,
):
    draw.ellipse(ellipse_box(center, radius + 1, radius + 1), fill=outline)
    draw.ellipse(ellipse_box(center, radius, radius), fill=fill)
    draw.line(
        [(round(center[0] - radius + 1), round(center[1])), (round(center[0] + radius - 1), round(center[1]))],
        fill=outline,
        width=1,
    )


def body_axis(pose: dict):
    pelvis = pose["anchors"]["pelvis"]
    chest = pose["anchors"]["chest"]
    direction = vector(pelvis, chest)
    tangent = perpendicular(direction)
    return pelvis, chest, direction, tangent


def draw_tail(draw: ImageDraw.ImageDraw, character: str, pose: dict, palette: dict):
    pelvis = pose["anchors"]["pelvis"]
    chest = pose["anchors"]["chest"]
    direction = vector(chest, pelvis)
    tangent = perpendicular(direction)
    base = offset(pelvis, tangent, -3 if character == "soder" else 1)
    bend = offset(base, tangent, -11 if character == "soder" else 9)
    bend = offset(bend, direction, 8)
    tip = offset(bend, tangent, -8 if character == "soder" else 6)
    tip = offset(tip, direction, -4)
    width = 7 if character == "soder" else 4
    draw.line([point(base), point(bend), point(tip)], fill=palette["outline"], width=width + 4, joint="curve")
    draw.line([point(base), point(bend), point(tip)], fill=palette["body"], width=width, joint="curve")
    draw.ellipse(ellipse_box(tip, width / 2, width / 2), fill=palette["bodyLight"])


def draw_pelvis(draw: ImageDraw.ImageDraw, character: str, pose: dict, palette: dict):
    pelvis, chest, direction, tangent = body_axis(pose)
    half = 8.4 if character == "soder" else 7.8
    top = offset(pelvis, direction, -3.2)
    bottom = offset(pelvis, direction, 5.0)
    shape = [
        offset(top, tangent, half),
        offset(bottom, tangent, half * 0.82),
        offset(bottom, tangent, -half * 0.82),
        offset(top, tangent, -half),
    ]
    draw.polygon([point(value) for value in shape], fill=palette["outline"])
    inner = [
        offset(top, tangent, half - 2),
        offset(bottom, tangent, half * 0.82 - 2),
        offset(bottom, tangent, -half * 0.82 + 2),
        offset(top, tangent, -half + 2),
    ]
    draw.polygon([point(value) for value in inner], fill=palette["leg"])
    draw.line(
        [point(offset(pelvis, tangent, -half + 2)), point(offset(pelvis, tangent, half - 2))],
        fill=palette["legLight"],
        width=1,
    )


def draw_torso(draw: ImageDraw.ImageDraw, character: str, pose: dict, palette: dict):
    pelvis, chest, direction, tangent = body_axis(pose)
    shoulders_center = (
        (pose["anchors"]["leftShoulder"][0] + pose["anchors"]["rightShoulder"][0]) / 2,
        (pose["anchors"]["leftShoulder"][1] + pose["anchors"]["rightShoulder"][1]) / 2,
    )
    top_half = 10.2 if character == "soder" else 9.7
    waist_half = 7.0 if character == "soder" else 6.6
    top = offset(shoulders_center, direction, -1.5)
    waist = offset(pelvis, direction, -1.0)
    outline_shape = [
        offset(top, tangent, top_half + 2),
        offset(waist, tangent, waist_half + 2),
        offset(waist, tangent, -waist_half - 2),
        offset(top, tangent, -top_half - 2),
    ]
    draw.polygon([point(value) for value in outline_shape], fill=palette["outline"])
    body_shape = [
        offset(top, tangent, top_half),
        offset(waist, tangent, waist_half),
        offset(waist, tangent, -waist_half),
        offset(top, tangent, -top_half),
    ]
    draw.polygon([point(value) for value in body_shape], fill=palette["body"])
    light_side = [
        offset(top, tangent, top_half - 1),
        offset(waist, tangent, waist_half - 1),
        offset(waist, tangent, waist_half - 3),
        offset(top, tangent, top_half - 3),
    ]
    draw.polygon([point(value) for value in light_side], fill=palette["bodyLight"])
    if character == "kitty":
        hood_center = offset(top, direction, -2)
        draw.arc(ellipse_box(hood_center, 8, 5), 185, 355, fill=palette["bodyLight"], width=2)
        draw.line(
            [point(offset(chest, tangent, -1.4)), point(offset(chest, direction, 7))],
            fill=palette["faceShade"],
            width=1,
        )
        draw.line(
            [point(offset(chest, tangent, 1.4)), point(offset(chest, direction, 7))],
            fill=palette["faceShade"],
            width=1,
        )
    else:
        belly_center = offset(chest, direction, 3.6)
        draw.ellipse(ellipse_box(belly_center, 5.1, 7.2), fill=palette["outline"])
        draw.ellipse(ellipse_box(belly_center, 3.8, 6.0), fill=palette["belly"])
        for row in (-3, 0, 3):
            draw.line(
                [
                    (round(belly_center[0] - 3), round(belly_center[1] + row)),
                    (round(belly_center[0] + 3), round(belly_center[1] + row)),
                ],
                fill=palette["bellyLight"],
                width=1,
            )


def draw_head(draw: ImageDraw.ImageDraw, character: str, pose: dict, palette: dict):
    head = pose["anchors"]["head"]
    expression = pose.get("expression", "focus")
    if character == "kitty":
        # Dark hood/ears behind the plush face.
        draw.ellipse(ellipse_box((head[0], head[1] + 1), 12.5, 11.5), fill=palette["outline"])
        left_ear = [(head[0] + 3, head[1] - 8), (head[0] + 8, head[1] - 15), (head[0] + 11, head[1] - 7)]
        right_ear = [(head[0] - 3, head[1] - 8), (head[0] - 8, head[1] - 15), (head[0] - 11, head[1] - 7)]
        draw.polygon([point(value) for value in left_ear], fill=palette["outline"])
        draw.polygon([point(value) for value in right_ear], fill=palette["outline"])
        draw.polygon([point(value) for value in left_ear], fill=palette["hairShade"])
        draw.polygon([point(value) for value in right_ear], fill=palette["hairShade"])
        draw.ellipse(ellipse_box(head, 10.5, 9.8), fill=palette["face"])
        draw.pieslice(ellipse_box((head[0], head[1] - 2), 11.2, 9.4), 180, 360, fill=palette["hair"])
        bangs = [
            (head[0] - 9, head[1] - 3),
            (head[0] - 5, head[1] + 1),
            (head[0] - 2, head[1] - 2),
            (head[0] + 1, head[1] + 2),
            (head[0] + 4, head[1] - 2),
            (head[0] + 8, head[1] + 1),
            (head[0] + 10, head[1] - 4),
        ]
        draw.line([point(value) for value in bangs], fill=palette["hairShade"], width=2)
        draw.line([(round(head[0] - 6), round(head[1] - 8)), (round(head[0] + 4), round(head[1] - 9))], fill=palette["hairLight"], width=1)
    else:
        # Snake hood is costume volume around the same plush head.
        draw.ellipse(ellipse_box((head[0], head[1] - 1), 13.5, 13.2), fill=palette["outline"])
        draw.ellipse(ellipse_box((head[0], head[1] - 1), 11.5, 11.2), fill=palette["body"])
        draw.ellipse(ellipse_box((head[0], head[1] + 2), 8.5, 7.7), fill=palette["face"])
        draw.pieslice(ellipse_box((head[0], head[1]), 8.5, 7.4), 180, 360, fill=palette["hair"])
        draw.line(
            [(round(head[0] - 6), round(head[1])), (round(head[0]), round(head[1] + 3)), (round(head[0] + 6), round(head[1]))],
            fill=palette["hairShade"],
            width=2,
        )
        for eye_x in (-6.5, 6.5):
            draw.ellipse(ellipse_box((head[0] + eye_x, head[1] - 8), 1.6, 2.0), fill=palette["outline"])
            draw.point((round(head[0] + eye_x - 0.3), round(head[1] - 8.6)), fill=palette["faceLight"])
        draw.line(
            [(round(head[0] - 2), round(head[1] - 10)), (round(head[0] + 2), round(head[1] - 10))],
            fill=palette["hoodMouth"],
            width=1,
        )
        draw.line(
            [(round(head[0]), round(head[1] - 10)), (round(head[0]), round(head[1] - 6))],
            fill=palette["accent"],
            width=2,
        )
    # Shared sleepy KittyKaki-like plush face.
    eye_y = head[1] + 2
    if expression == "joy":
        draw.arc(ellipse_box((head[0] - 4, eye_y), 2, 1.6), 190, 350, fill=palette["eye"], width=1)
        draw.arc(ellipse_box((head[0] + 4, eye_y), 2, 1.6), 190, 350, fill=palette["eye"], width=1)
    elif expression == "oops":
        draw.ellipse(ellipse_box((head[0] - 4, eye_y), 1.5, 1.8), fill=palette["eye"])
        draw.line([(round(head[0] + 2), round(eye_y)), (round(head[0] + 6), round(eye_y - 1))], fill=palette["eye"], width=1)
    else:
        draw.ellipse(ellipse_box((head[0] - 4, eye_y), 2.1, 1.7), fill=palette["eye"])
        draw.ellipse(ellipse_box((head[0] + 4, eye_y), 2.1, 1.7), fill=palette["eye"])
        draw.point((round(head[0] - 4.5), round(eye_y - 0.6)), fill=palette["faceLight"])
        draw.point((round(head[0] + 3.5), round(eye_y - 0.6)), fill=palette["faceLight"])
    draw.point((round(head[0] - 6), round(head[1] + 5)), fill=palette["blush"])
    draw.point((round(head[0] + 6), round(head[1] + 5)), fill=palette["blush"])
    mouth_y = round(head[1] + 5)
    draw.line(
        [
            (round(head[0] - 2), mouth_y),
            (round(head[0]), mouth_y + 1),
            (round(head[0] + 2), mouth_y),
        ],
        fill=palette["outline"],
        width=1,
    )


def segment_fill(character: str, segment: str, palette: dict, near: bool):
    if "Thigh" in segment or "Shin" in segment:
        return palette["legLight"] if near else palette["leg"]
    return palette["bodyLight"] if near else palette["body"]


def draw_segment(
    draw: ImageDraw.ImageDraw,
    character: str,
    segment: str,
    pose: dict,
    palette: dict,
):
    start_name, end_name = SEGMENTS[segment]
    start = pose["anchors"][start_name]
    end = pose["anchors"][end_name]
    near = pose["depth"].get(segment, 0) > 0.5
    if segment.endswith("Hand"):
        draw_paw(draw, start, end, palette, near)
        return
    if segment.endswith("Foot"):
        draw_shoe(draw, start, end, palette, near, pose.get("style"))
        return
    kind = next(value for value in SEGMENT_WIDTHS if value in segment)
    width_start, width_end = SEGMENT_WIDTHS[kind]
    if character == "soder":
        width_start += 0.7
        width_end += 0.7
    fill = segment_fill(character, segment, palette, near)
    draw_capsule(
        draw,
        start,
        end,
        width_start,
        width_end,
        fill,
        palette["outline"],
    )
    if "Forearm" in segment:
        # A cuff plus a small paw keeps the wrist readable without white bars.
        direction = vector(start, end)
        tangent = perpendicular(direction)
        cuff_center = offset(end, direction, -1.8)
        draw.line(
            [
                point(offset(cuff_center, tangent, -width_end / 2)),
                point(offset(cuff_center, tangent, width_end / 2)),
            ],
            fill=palette["cuff"],
            width=2,
        )
    if "UpperArm" in segment or "Thigh" in segment:
        draw_joint_seam(
            draw,
            end,
            fill,
            palette["outline"],
            max(2.0, width_end / 2 - 1.4),
        )


def render_frame(character: str, pose: dict, *, silhouette: bool = False) -> Image.Image:
    palette = PALETTES[character]
    image = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    commands = [(pose["depth"]["tail"], "tail")]
    commands.extend((pose["depth"].get(name, 0), name) for name in SEGMENTS)
    commands.extend(
        (
            (pose["depth"]["pelvis"], "pelvis"),
            (pose["depth"]["torso"], "torso"),
            (pose["depth"]["head"], "head"),
        )
    )
    for _, name in sorted(commands, key=lambda value: value[0]):
        if name == "tail":
            draw_tail(draw, character, pose, palette)
        elif name == "pelvis":
            draw_pelvis(draw, character, pose, palette)
        elif name == "torso":
            draw_torso(draw, character, pose, palette)
        elif name == "head":
            draw_head(draw, character, pose, palette)
        else:
            draw_segment(draw, character, name, pose, palette)
    if silhouette:
        alpha = image.getchannel("A")
        result = Image.new("RGBA", image.size, (0, 0, 0, 0))
        silhouette_color = Image.new("RGBA", image.size, rgba("#f5e9c9"))
        result.paste(silhouette_color, mask=alpha)
        return result
    return image


def trimmed(image: Image.Image):
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        return image.copy(), (0, 0, image.width, image.height)
    left = max(0, bbox[0] - 1)
    top = max(0, bbox[1] - 1)
    right = min(image.width, bbox[2] + 1)
    bottom = min(image.height, bbox[3] + 1)
    bbox = (left, top, right, bottom)
    return image.crop(bbox), bbox


class PagePacker:
    def __init__(self):
        self.pages = [Image.new("RGBA", PAGE_SIZE, (0, 0, 0, 0))]
        self.page = 0
        self.cursor_x = PADDING
        self.cursor_y = PADDING
        self.row_height = 0

    def add(self, frame: Image.Image):
        width = frame.width + PADDING * 2
        height = frame.height + PADDING * 2
        if self.cursor_x + width > PAGE_SIZE[0]:
            self.cursor_x = PADDING
            self.cursor_y += self.row_height
            self.row_height = 0
        if self.cursor_y + height > PAGE_SIZE[1]:
            self.pages.append(Image.new("RGBA", PAGE_SIZE, (0, 0, 0, 0)))
            self.page += 1
            self.cursor_x = PADDING
            self.cursor_y = PADDING
            self.row_height = 0
        x = self.cursor_x + PADDING
        y = self.cursor_y + PADDING
        page = self.pages[self.page]
        extrude(page, frame, x, y)
        page.alpha_composite(frame, (x, y))
        self.cursor_x += width
        self.row_height = max(self.row_height, height)
        return self.page, x, y


def extrude(page: Image.Image, frame: Image.Image, x: int, y: int):
    if EXTRUSION < 1:
        return
    page.paste(frame.crop((0, 0, frame.width, 1)), (x, y - 1))
    page.paste(frame.crop((0, frame.height - 1, frame.width, frame.height)), (x, y + frame.height))
    page.paste(frame.crop((0, 0, 1, frame.height)), (x - 1, y))
    page.paste(frame.crop((frame.width - 1, 0, frame.width, frame.height)), (x + frame.width, y))


def save_indexed_png(image: Image.Image, path: Path):
    colors = sorted(
        {pixel for count, pixel in (image.getcolors(maxcolors=1_000_000) or []) if pixel[3] > 0},
        key=lambda value: (value[0], value[1], value[2], value[3]),
    )
    if len(colors) > 254:
        raise ValueError(f"{path.name} uses {len(colors)} colors; constrained atlas expected <= 254")
    palette_colors = [(0, 0, 0)] + [(r, g, b) for r, g, b, _ in colors]
    mapping = {(0, 0, 0, 0): 0}
    mapping.update({color: index + 1 for index, color in enumerate(colors)})
    indexed = Image.new("P", image.size, 0)
    indexed.putpalette(
        [channel for color in palette_colors for channel in color]
        + [0] * (768 - len(palette_colors) * 3)
    )
    source_pixels = (
        image.get_flattened_data()
        if hasattr(image, "get_flattened_data")
        else image.getdata()
    )
    indexed.putdata([mapping[pixel] if pixel[3] else 0 for pixel in source_pixels])
    indexed.info["transparency"] = 0
    path.parent.mkdir(parents=True, exist_ok=True)
    indexed.save(path, format="PNG", optimize=True, transparency=0)


def frame_count(spec: dict) -> int:
    seconds = spec["durationBeats"] * 60 / BPM
    return max(3, round(seconds * spec["fps"]) + 1)


def build_character(character: str):
    packer = PagePacker()
    metadata = {
        "schemaVersion": 1,
        "character": character,
        "topology": "biped",
        "atlasSize": list(PAGE_SIZE),
        "sourceFrameSize": list(FRAME_SIZE),
        "rootPivotSource": [48, 88],
        "coordinateSystem": "camera-space XY; anatomical left/right; depth toward camera",
        "palette": PALETTES[character],
        "clips": {},
    }
    review_frames = {}
    flat_frames = []
    for clip_id, spec in CLIP_SPECS.items():
        count = frame_count(spec)
        clip_frames = []
        for index in range(count):
            phase = index / (count - 1)
            pose = sample_clip(clip_id, phase)
            source = render_frame(character, pose)
            cropped, bbox = trimmed(source)
            page_index, x, y = packer.add(cropped)
            left, top, _, _ = bbox
            contacts = {
                name: [
                    round(pose["anchors"][name][0] - left, 3),
                    round(pose["anchors"][name][1] - top, 3),
                ]
                for name in pose["contacts"]
                if name in pose["anchors"]
            }
            anchors = {
                name: [
                    round(pose["anchors"][name][0] - left, 3),
                    round(pose["anchors"][name][1] - top, 3),
                ]
                for name in ANCHORS
            }
            frame_data = {
                "page": page_index,
                "x": x,
                "y": y,
                "w": cropped.width,
                "h": cropped.height,
                "pivot": [48 - left, 88 - top],
                "phase": round(phase, 6),
                "label": pose["label"],
                "markers": list(marker_for_phase(clip_id, phase)),
                "contacts": contacts,
                "semanticAnchors": anchors,
                "effectAnchors": {
                    "head": anchors["head"],
                    "leftPaw": anchors["leftHand"],
                    "rightPaw": anchors["rightHand"],
                    "leftFoot": anchors["leftFoot"],
                    "rightFoot": anchors["rightFoot"],
                    "root": anchors["root"],
                },
                "segmentDepth": {
                    name: round(value, 4)
                    for name, value in pose["depth"].items()
                    if name in SEGMENTS
                },
            }
            clip_frames.append(frame_data)
            review_frames[(clip_id, index)] = source
            flat_frames.append((clip_id, index, phase, source, pose))
        metadata["clips"][clip_id] = {
            "durationBeats": spec["durationBeats"],
            "fps": spec["fps"],
            "frameCount": count,
            "entryStance": entry_stance(clip_id),
            "exitStance": exit_stance(clip_id),
            "mirroringSafe": spec["mirroringSafe"],
            "accentPhases": list(accent_phases(clip_id)),
            "frames": clip_frames,
        }
    if len(packer.pages) > 2:
        raise RuntimeError(f"{character} needs {len(packer.pages)} pages; milestone budget is two")
    output = RUNTIME_ROOT / character
    output.mkdir(parents=True, exist_ok=True)
    atlas_paths = []
    for index, page in enumerate(packer.pages):
        path = output / f"atlas-{index}.png"
        save_indexed_png(page, path)
        atlas_paths.append(path)
    metadata["pages"] = [path.name for path in atlas_paths]
    metadata_path = output / "atlas.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    build_approval_media(character, review_frames, flat_frames)
    return metadata, atlas_paths, metadata_path, flat_frames


def entry_stance(clip_id: str) -> str:
    return {
        "idleGroove": "standing",
        "basicRock": "standing",
        "basicGoDown": "standing",
        "sixStep": "floor",
        "windmill": "floor",
        "babyFreeze": "powerExit",
        "cleanGetUp": "freeze",
        "victory": "standing",
        "missRecovery": "any",
    }[clip_id]


def exit_stance(clip_id: str) -> str:
    return {
        "idleGroove": "standing",
        "basicRock": "standing",
        "basicGoDown": "floor",
        "sixStep": "floor",
        "windmill": "powerExit",
        "babyFreeze": "freeze",
        "cleanGetUp": "standing",
        "victory": "standing",
        "missRecovery": "standing",
    }[clip_id]


def backdrop(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGBA", size, rgba("#090e1b"))
    draw = ImageDraw.Draw(image)
    for x in range(0, size[0], 12):
        draw.line([(x, 0), (x, size[1])], fill=rgba("#14293a"), width=1)
    for y in range(0, size[1], 12):
        draw.line([(0, y), (size[0], y)], fill=rgba("#14293a"), width=1)
    return image


def draw_label(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, *, color="#f5e9c9"):
    font = ImageFont.load_default()
    draw.text((x + 1, y + 1), text.upper(), fill=rgba("#050914"), font=font)
    draw.text((x, y), text.upper(), fill=rgba(color), font=font)


def build_approval_media(character: str, review_frames: dict, flat_frames: list):
    approval_dir = REVIEW_ROOT / "approval"
    approval_dir.mkdir(parents=True, exist_ok=True)
    tile_w, tile_h = 112, 118
    board = backdrop((tile_w * 5, tile_h))
    draw = ImageDraw.Draw(board)
    short_labels = ("NEUTRAL", "CROSS-BODY", "GO DOWN", "LEG CROSS", "BABY FREEZE")
    for index, ((label, clip_id, phase), short_label) in enumerate(zip(approval_samples(), short_labels)):
        spec_count = frame_count(CLIP_SPECS[clip_id])
        frame_index = round(phase * (spec_count - 1))
        sprite = review_frames[(clip_id, frame_index)]
        board.alpha_composite(sprite, (index * tile_w + 8, 6))
        draw_label(draw, short_label, index * tile_w + 5, 101, color="#63d6b3")
    native_path = approval_dir / f"{character}-approval-native.png"
    board.save(native_path, optimize=True)
    board.resize((board.width * 4, board.height * 4), Image.Resampling.NEAREST).save(
        approval_dir / f"{character}-approval-4x.png",
        optimize=True,
    )

    silhouettes = backdrop((tile_w * 5, tile_h))
    silhouette_draw = ImageDraw.Draw(silhouettes)
    for index, ((label, clip_id, phase), short_label) in enumerate(zip(approval_samples(), short_labels)):
        pose = sample_clip(clip_id, phase)
        sprite = render_frame(character, pose, silhouette=True)
        silhouettes.alpha_composite(sprite, (index * tile_w + 8, 6))
        draw_label(silhouette_draw, short_label, index * tile_w + 5, 101)
    silhouettes.save(approval_dir / f"{character}-approval-silhouettes.png", optimize=True)

    golden = ("basicRock", "basicGoDown", "sixStep", "windmill", "babyFreeze", "cleanGetUp")
    key_board = backdrop((96 * 6, 104 * 3))
    key_draw = ImageDraw.Draw(key_board)
    for column, clip_id in enumerate(golden):
        count = frame_count(CLIP_SPECS[clip_id])
        for row, phase in enumerate((0.2, 0.5, 0.8)):
            index = round(phase * (count - 1))
            key_board.alpha_composite(review_frames[(clip_id, index)], (column * 96, row * 104))
            if row == 2:
                draw_label(key_draw, clip_id, column * 96 + 2, row * 104 + 92, color="#f4c95d")
    key_board.save(approval_dir / f"{character}-golden-chain-key-poses.png", optimize=True)

    rng = random.Random(0x4B414B49 + (1 if character == "soder" else 0))
    sample = rng.sample(flat_frames, 20)
    random_board = backdrop((96 * 5, 104 * 4))
    random_draw = ImageDraw.Draw(random_board)
    for index, (clip_id, frame_index, phase, sprite, _) in enumerate(sample):
        x = (index % 5) * 96
        y = (index // 5) * 104
        random_board.alpha_composite(sprite, (x, y))
        draw_label(random_draw, f"{clip_id} {phase:.2f}", x + 2, y + 92)
    random_board.save(approval_dir / f"{character}-random-20.png", optimize=True)


def validate_character(character: str, metadata: dict, pages: list[Path]):
    errors = []
    if metadata["topology"] != "biped":
        errors.append("topology must be biped")
    if not 1 <= len(pages) <= 2:
        errors.append("atlas page count must be one or two")
    for clip_id, clip in metadata["clips"].items():
        if not clip["frames"]:
            errors.append(f"{clip_id}: empty frames")
            continue
        expected_pivot = metadata["rootPivotSource"]
        for index, frame in enumerate(clip["frames"]):
            source_pivot = [
                frame["semanticAnchors"]["root"][0] - frame["pivot"][0] + expected_pivot[0],
                frame["semanticAnchors"]["root"][1] - frame["pivot"][1] + expected_pivot[1],
            ]
            if not all(math.isfinite(value) for value in source_pivot):
                errors.append(f"{clip_id}[{index}]: non-finite pivot")
            if set(frame["semanticAnchors"]) != set(ANCHORS):
                errors.append(f"{clip_id}[{index}]: missing semantic anchors")
            if set(frame["segmentDepth"]) != set(SEGMENTS):
                errors.append(f"{clip_id}[{index}]: missing segment depth")
    for page in pages:
        with Image.open(page) as image:
            if image.mode != "P":
                errors.append(f"{page.name}: expected indexed PNG, got {image.mode}")
            if image.size != PAGE_SIZE:
                errors.append(f"{page.name}: wrong size {image.size}")
    if errors:
        raise RuntimeError(f"{character} atlas validation failed:\n" + "\n".join(errors))


def build_report(results):
    report = {
        "schemaVersion": 1,
        "bpm": BPM,
        "logicalResolution": [384, 216],
        "characters": {},
    }
    for character, (metadata, pages, metadata_path, flat_frames) in results.items():
        compressed = sum(path.stat().st_size for path in pages) + metadata_path.stat().st_size
        report["characters"][character] = {
            "atlasDimensions": list(PAGE_SIZE),
            "atlasPages": len(pages),
            "frameCount": len(flat_frames),
            "compressedBytes": compressed,
            "pageBytes": {path.name: path.stat().st_size for path in pages},
            "metadataBytes": metadata_path.stat().st_size,
            "estimatedDecodedTextureBytes": len(pages) * PAGE_SIZE[0] * PAGE_SIZE[1] * 4,
            "sha256": {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in [*pages, metadata_path]
            },
        }
    report_path = REVIEW_ROOT / "hero-atlas-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report_path, report


def main():
    results = {}
    for character in ("kitty", "soder"):
        result = build_character(character)
        validate_character(character, result[0], result[1])
        results[character] = result
    report_path, report = build_report(results)
    for character, value in report["characters"].items():
        print(
            f"{character}: {value['frameCount']} frames, "
            f"{value['atlasPages']} x {PAGE_SIZE[0]}x{PAGE_SIZE[1]}, "
            f"{value['compressedBytes']} bytes"
        )
    print(f"REPORT={report_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Atlas build failed: {error}", file=sys.stderr)
        raise
