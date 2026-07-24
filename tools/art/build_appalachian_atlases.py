"""Build lazy Frolic hero/style atlases and deterministic approval diagnostics.

Run from the repository root:

    python3 tools/art/build_appalachian_atlases.py

Each selected hero/style pack is independent. Normal gameplay decodes one pack
at a time instead of loading all six combinations.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

from appalachian_pose_library import (
    ANCHORS,
    BPM,
    CHARACTERS,
    CLIP_SPECS,
    SEGMENTS,
    STYLES,
    accent_phases,
    approval_samples,
    marker_for_phase,
    sample_frolic_clip,
)
from build_hero_atlases import (
    PAGE_SIZE,
    PALETTES,
    PagePacker,
    backdrop,
    draw_label,
    render_frame,
    save_indexed_png,
    trimmed,
)


ROOT = Path(__file__).resolve().parents[2]
RUNTIME_ROOT = ROOT / "assets" / "heroes"
REVIEW_ROOT = ROOT / "docs" / "images" / "appalachian" / "offline"
SOURCE_PIVOT = (48, 90)
MAX_PLANT_DISPLACEMENT = 0.76


def frame_count(spec: dict) -> int:
    seconds = spec["durationBeats"] * 60 / BPM
    return max(3, round(seconds * spec["fps"]) + 1)


def build_pack(character: str, style: str):
    packer = PagePacker()
    metadata = {
        "schemaVersion": 1,
        "pack": "appalachian-frolic",
        "character": character,
        "style": style,
        "topology": "biped",
        "atlasSize": list(PAGE_SIZE),
        "sourceFrameSize": [96, 96],
        "rootPivotSource": list(SOURCE_PIVOT),
        "coordinateSystem": "camera-space XY; anatomical left/right; depth toward camera",
        "palette": PALETTES[character],
        "clips": {},
    }
    review_frames = {}
    poses = {}
    flat_frames = []
    for clip_id, spec in CLIP_SPECS.items():
        count = frame_count(spec)
        clip_frames = []
        poses[clip_id] = []
        for index in range(count):
            phase = index / (count - 1)
            pose = sample_frolic_clip(style, clip_id, phase, character)
            source = render_frame(character, pose)
            cropped, bbox = trimmed(source)
            page_index, x, y = packer.add(cropped)
            left, top, _, _ = bbox
            anchors = {
                name: [
                    round(pose["anchors"][name][0] - left, 3),
                    round(pose["anchors"][name][1] - top, 3),
                ]
                for name in ANCHORS
            }
            contacts = {
                name: anchors[name]
                for name in pose["contacts"]
                if name in anchors
            }
            center_of_mass = [
                round(pose["centerOfMass"][0] - left, 3),
                round(pose["centerOfMass"][1] - top, 3),
            ]
            frame_data = {
                "page": page_index,
                "x": x,
                "y": y,
                "w": cropped.width,
                "h": cropped.height,
                "pivot": [SOURCE_PIVOT[0] - left, SOURCE_PIVOT[1] - top],
                "phase": round(phase, 6),
                "label": pose["label"],
                "markers": list(marker_for_phase(clip_id, phase)),
                "contacts": contacts,
                "support": pose["support"],
                "centerOfMass": center_of_mass,
                "semanticAnchors": anchors,
                "effectAnchors": {
                    "head": anchors["head"],
                    "leftPaw": anchors["leftHand"],
                    "rightPaw": anchors["rightHand"],
                    "leftFoot": anchors["leftFoot"],
                    "rightFoot": anchors["rightFoot"],
                    "root": anchors["root"],
                    "board": [SOURCE_PIVOT[0] - left, SOURCE_PIVOT[1] - top],
                },
                "segmentDepth": {
                    name: round(pose["depth"][name], 4)
                    for name in SEGMENTS
                },
            }
            clip_frames.append(frame_data)
            poses[clip_id].append(pose)
            review_frames[(clip_id, index)] = source
            flat_frames.append((clip_id, index, phase, source, pose))
        metadata["clips"][clip_id] = {
            "durationBeats": spec["durationBeats"],
            "fps": spec["fps"],
            "frameCount": count,
            "entryStance": "standing",
            "exitStance": "standing",
            "mirroringSafe": spec["mirroringSafe"],
            "accentPhases": list(accent_phases(clip_id)),
            "frames": clip_frames,
        }
    if len(packer.pages) > 2:
        raise RuntimeError(
            f"{character}/{style} needs {len(packer.pages)} pages; active-pack budget is two"
        )
    output = RUNTIME_ROOT / character / "frolic" / style
    output.mkdir(parents=True, exist_ok=True)
    page_paths = []
    for index, page in enumerate(packer.pages):
        path = output / f"atlas-{index}.png"
        save_indexed_png(page, path)
        page_paths.append(path)
    metadata["pages"] = [path.name for path in page_paths]
    metadata_path = output / "atlas.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    lint = validate_pack(metadata, page_paths, poses)
    build_approval_media(character, style, review_frames, poses)
    return metadata, page_paths, metadata_path, flat_frames, lint


def validate_pack(metadata: dict, pages: list[Path], poses: dict) -> dict:
    errors = []
    warnings = []
    if metadata["topology"] != "biped":
        errors.append("topology must be biped")
    if not 1 <= len(pages) <= 2:
        errors.append("pack must use one or two pages")
    worst_plant = 0.0
    worst_jump = 0.0
    for clip_id, clip in metadata["clips"].items():
        previous = None
        active_plants = {}
        for index, frame in enumerate(clip["frames"]):
            if set(frame["semanticAnchors"]) != set(ANCHORS):
                errors.append(f"{clip_id}[{index}] missing semantic anchors")
            if set(frame["segmentDepth"]) != set(SEGMENTS):
                errors.append(f"{clip_id}[{index}] missing segment depth")
            if not frame["w"] or not frame["h"]:
                errors.append(f"{clip_id}[{index}] empty sprite")
            source = source_anchors(frame)
            if previous:
                jump = max(
                    distance(source[name], previous[name])
                    for name in ANCHORS
                )
                worst_jump = max(worst_jump, jump)
                if jump > 16:
                    errors.append(f"{clip_id}[{index}] discontinuous joint jump {jump:.2f}px")
            previous = source
            current_contacts = set(frame["contacts"])
            for foot in ("leftFoot", "rightFoot"):
                if foot not in current_contacts:
                    active_plants.pop(foot, None)
                    continue
                current = source[foot]
                if foot not in active_plants:
                    active_plants[foot] = current
                displacement = distance(current, active_plants[foot])
                worst_plant = max(worst_plant, displacement)
                if displacement > MAX_PLANT_DISPLACEMENT:
                    errors.append(
                        f"{clip_id}[{index}] {foot} plant moved {displacement:.3f}px"
                    )
            left = source["leftFoot"]
            right = source["rightFoot"]
            if distance(left, right) < 1.25:
                warnings.append(f"{clip_id}[{index}] feet approach silhouette merge")
        if not clip["frames"]:
            errors.append(f"{clip_id} has no frames")
    for page in pages:
        with Image.open(page) as image:
            if image.mode != "P":
                errors.append(f"{page.name} must be indexed PNG")
            if image.size != PAGE_SIZE:
                errors.append(f"{page.name} has wrong dimensions")
    if errors:
        raise RuntimeError("Frolic atlas validation failed:\n" + "\n".join(errors[:60]))
    return {
        "worstPlantedFootDisplacementPx": round(worst_plant, 6),
        "worstJointFrameJumpPx": round(worst_jump, 6),
        "warnings": sorted(set(warnings)),
    }


def source_anchors(frame: dict) -> dict:
    return {
        name: (
            value[0] - frame["pivot"][0] + SOURCE_PIVOT[0],
            value[1] - frame["pivot"][1] + SOURCE_PIVOT[1],
        )
        for name, value in frame["semanticAnchors"].items()
    }


def build_approval_media(
    character: str,
    style: str,
    review_frames: dict,
    poses: dict,
):
    REVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    samples = approval_samples()
    tile_width = 96
    board = backdrop((tile_width * len(samples), 112))
    draw = ImageDraw.Draw(board)
    diagnostic = backdrop((tile_width * len(samples), 112))
    diagnostic_draw = ImageDraw.Draw(diagnostic)
    for column, (label, clip_id, phase) in enumerate(samples):
        count = frame_count(CLIP_SPECS[clip_id])
        frame_index = round(phase * (count - 1))
        sprite = review_frames[(clip_id, frame_index)]
        board.alpha_composite(sprite, (column * tile_width, 2))
        draw_label(draw, label, column * tile_width + 2, 98, color="#63d6b3")
        diagnostic.alpha_composite(sprite, (column * tile_width, 2))
        pose = poses[clip_id][frame_index]
        draw_skeleton(diagnostic_draw, pose, column * tile_width)
        draw_label(
            diagnostic_draw,
            f"{label} · {pose['support']}",
            column * tile_width + 2,
            98,
            color="#f4c95d",
        )
    native = REVIEW_ROOT / f"{character}-{style}-approval-neutral-native.png"
    board.save(native, optimize=True)
    board.resize(
        (board.width * 4, board.height * 4),
        Image.Resampling.NEAREST,
    ).save(
        REVIEW_ROOT / f"{character}-{style}-approval-neutral-4x.png",
        optimize=True,
    )
    diagnostic.save(
        REVIEW_ROOT / f"{character}-{style}-approval-diagnostic.png",
        optimize=True,
    )


def draw_skeleton(draw: ImageDraw.ImageDraw, pose: dict, offset_x: int):
    anchors = pose["anchors"]
    for name, (start, end) in SEGMENTS.items():
        color = "#63d6b3" if name.startswith("left") else "#f46b45"
        draw.line(
            [
                (round(anchors[start][0] + offset_x), round(anchors[start][1] + 2)),
                (round(anchors[end][0] + offset_x), round(anchors[end][1] + 2)),
            ],
            fill=color,
            width=1,
        )
    for name in pose["contacts"]:
        value = anchors[name]
        x = round(value[0] + offset_x)
        y = round(value[1] + 2)
        draw.rectangle((x - 2, y - 2, x + 2, y + 2), outline="#f4c95d", width=1)
    center = pose["centerOfMass"]
    x = round(center[0] + offset_x)
    y = round(center[1] + 2)
    draw.line([(x - 2, y), (x + 2, y)], fill="#fff5dc", width=1)
    draw.line([(x, y - 2), (x, y + 2)], fill="#fff5dc", width=1)


def build_report(results: dict):
    report = {
        "schemaVersion": 1,
        "logicalResolution": [384, 216],
        "bpm": BPM,
        "activePackPolicy": "one selected hero/style pack",
        "packs": {},
    }
    for key, (_, pages, metadata_path, frames, lint) in results.items():
        compressed = sum(path.stat().st_size for path in pages) + metadata_path.stat().st_size
        report["packs"][key] = {
            "pages": len(pages),
            "drawings": len(frames),
            "compressedBytes": compressed,
            "metadataBytes": metadata_path.stat().st_size,
            "pageBytes": {path.name: path.stat().st_size for path in pages},
            "estimatedDecodedTextureBytes": len(pages) * PAGE_SIZE[0] * PAGE_SIZE[1] * 4,
            "lint": lint,
            "sha256": {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in [*pages, metadata_path]
            },
        }
    report_path = ROOT / "docs" / "images" / "appalachian" / "frolic-atlas-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report_path, report


def distance(left, right):
    return math.hypot(left[0] - right[0], left[1] - right[1])


def main():
    results = {}
    for character in CHARACTERS:
        for style in STYLES:
            key = f"{character}/{style}"
            results[key] = build_pack(character, style)
    report_path, report = build_report(results)
    for key, pack in report["packs"].items():
        print(
            f"{key}: {pack['drawings']} frames, {pack['pages']} page(s), "
            f"{pack['compressedBytes']} bytes, plant "
            f"{pack['lint']['worstPlantedFootDisplacementPx']:.3f}px"
        )
    print(f"REPORT={report_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Frolic atlas build failed: {error}", file=sys.stderr)
        raise
