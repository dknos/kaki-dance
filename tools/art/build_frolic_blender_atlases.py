"""Pack the rendered Blender Flatfoot candidate into runtime atlases.

This script is intentionally a converter and packer only. It never draws a
hero or invents a pose. Every production pixel originates in
tools/blender/kaki-appalachian-frolic.blend and the corresponding transparent
source render recorded by render-manifest.json.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
BUILD_ROOT = ROOT / "build" / "frolic-rescue-candidate-1"
RENDER_MANIFEST = BUILD_ROOT / "render-manifest.json"
RUNTIME_ROOT = ROOT / "assets" / "heroes"
PAGE_SIZE = (1024, 1024)
FRAME_SIZE = (128, 128)
SOURCE_SCALE = FRAME_SIZE[0] / 512
SOURCE_PIVOT = (64, 120)
PADDING = 3
HEROES = ("kitty", "soder")
SEGMENT_DEPTH = {
    "leftUpperArm": 0.8,
    "leftForearm": 0.82,
    "leftHand": 0.84,
    "rightUpperArm": -0.8,
    "rightForearm": -0.82,
    "rightHand": -0.84,
    "leftThigh": 0.7,
    "leftShin": 0.72,
    "leftFoot": 0.76,
    "rightThigh": -0.7,
    "rightShin": -0.72,
    "rightFoot": -0.76,
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized_path(value: str) -> Path:
    return ROOT / Path(value.replace("\\", "/"))


def lerp(first: list[float], second: list[float], amount: float) -> list[float]:
    return [
        first[0] + (second[0] - first[0]) * amount,
        first[1] + (second[1] - first[1]) * amount,
    ]


def full_semantic_anchors(frame: dict) -> dict[str, list[float]]:
    source = frame["anchors"]
    left_foot = lerp(source["leftHeel"], source["leftToe"], 0.62)
    right_foot = lerp(source["rightHeel"], source["rightToe"], 0.62)
    neck = lerp(source["chest"], source["head"], 0.48)
    return {
        "root": [256.0, 480.0],
        "pelvis": source["pelvis"],
        "chest": source["chest"],
        "neck": neck,
        "head": source["head"],
        "leftShoulder": source["leftShoulder"],
        "leftElbow": source["leftElbow"],
        "leftWrist": lerp(source["leftElbow"], source["leftHand"], 0.78),
        "leftHand": source["leftHand"],
        "rightShoulder": source["rightShoulder"],
        "rightElbow": source["rightElbow"],
        "rightWrist": lerp(source["rightElbow"], source["rightHand"], 0.78),
        "rightHand": source["rightHand"],
        "leftHip": source["leftHip"],
        "leftKnee": source["leftKnee"],
        "leftAnkle": source["leftHeel"],
        "leftFoot": left_foot,
        "rightHip": source["rightHip"],
        "rightKnee": source["rightKnee"],
        "rightAnkle": source["rightHeel"],
        "rightFoot": right_foot,
    }


def scale_point(point: list[float], crop: tuple[int, int, int, int]) -> list[float]:
    return [
        round(point[0] * SOURCE_SCALE - crop[0], 3),
        round(point[1] * SOURCE_SCALE - crop[1], 3),
    ]


def convert_frame(path: Path) -> tuple[Image.Image, tuple[int, int, int, int]]:
    with Image.open(path) as source:
        rgba = source.convert("RGBA")
        reduced = rgba.resize(FRAME_SIZE, Image.Resampling.LANCZOS)
    alpha_bounds = reduced.getchannel("A").getbbox()
    if not alpha_bounds:
        raise RuntimeError(f"Transparent Blender render: {path}")
    left = max(0, alpha_bounds[0] - 1)
    top = max(0, alpha_bounds[1] - 1)
    right = min(reduced.width, alpha_bounds[2] + 1)
    bottom = min(reduced.height, alpha_bounds[3] + 1)
    crop = (left, top, right, bottom)
    return reduced.crop(crop), crop


class PagePacker:
    def __init__(self) -> None:
        self.pages = [Image.new("RGBA", PAGE_SIZE, (0, 0, 0, 0))]
        self.page = 0
        self.cursor_x = PADDING
        self.cursor_y = PADDING
        self.row_height = 0

    def add(self, frame: Image.Image) -> tuple[int, int, int]:
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
        page.alpha_composite(frame, (x, y))
        page.paste(frame.crop((0, 0, frame.width, 1)), (x, y - 1))
        page.paste(
            frame.crop((0, frame.height - 1, frame.width, frame.height)),
            (x, y + frame.height),
        )
        page.paste(frame.crop((0, 0, 1, frame.height)), (x - 1, y))
        page.paste(
            frame.crop((frame.width - 1, 0, frame.width, frame.height)),
            (x + frame.width, y),
        )
        self.cursor_x += width
        self.row_height = max(self.row_height, height)
        return self.page, x, y


def save_indexed(page: Image.Image, path: Path) -> None:
    # One palette per page avoids per-frame palette flicker. No dithering keeps
    # the controlled cel edges stable after nearest-neighbor gameplay scaling.
    indexed = page.quantize(
        colors=96,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    )
    indexed.save(path, optimize=True)


def contact_anchors(frame: dict, events: list[dict], anchors: dict) -> dict:
    result = {}
    support = frame["support"]
    if support in ("left", "both"):
        result["leftFoot"] = anchors["leftFoot"]
    if support in ("right", "both"):
        result["rightFoot"] = anchors["rightFoot"]
    for event in events:
        if event["frame"] != frame["sourceFrame"]:
            continue
        if event["contact"] in ("depart", "brush-prep"):
            continue
        free = event.get("freeFoot")
        if free in ("left", "both"):
            result["leftFoot"] = anchors["leftFoot"]
        if free in ("right", "both"):
            result["rightFoot"] = anchors["rightFoot"]
    return result


def build_hero(hero: str, manifest: dict) -> dict:
    packer = PagePacker()
    source = manifest["heroes"][hero]
    output = RUNTIME_ROOT / hero / "frolic" / "flatfoot"
    output.mkdir(parents=True, exist_ok=True)
    metadata = {
        "schemaVersion": 1,
        "pack": "appalachian-frolic",
        "character": hero,
        "style": "flatfoot",
        "topology": "biped",
        "candidateStatus": "human-review-required",
        "atlasSize": list(PAGE_SIZE),
        "sourceFrameSize": list(FRAME_SIZE),
        "rootPivotSource": list(SOURCE_PIVOT),
        "coordinateSystem": "fixed orthographic camera XY; anatomical left/right",
        "productionSource": {
            "blenderScene": "tools/blender/kaki-appalachian-frolic.blend",
            "blenderSceneSha256": manifest["sourceHash"],
            "camera": manifest["camera"],
            "renderer": manifest["renderer"],
            "sourceFPS": manifest["sourceFPS"],
            "sourceResolution": manifest["renderResolution"],
            "conversion": "512 RGBA to 128 RGBA LANCZOS; page-level 96-color palette; no dithering",
            "cleanupRevision": "candidate-1-unretouched-toon; manual pixel cleanup pending",
            "atlasRevision": "frolic-rescue-candidate-1",
        },
        "clips": {},
    }
    total_frames = 0
    for clip_id, clip in source["clips"].items():
        frames = []
        for source_frame in clip["frames"]:
            render_path = normalized_path(source_frame["file"])
            sprite, crop = convert_frame(render_path)
            page, x, y = packer.add(sprite)
            anchors = {
                name: scale_point(point, crop)
                for name, point in full_semantic_anchors(source_frame).items()
            }
            center = scale_point(source_frame["centerOfMass"], crop)
            contacts = contact_anchors(source_frame, clip["contacts"], anchors)
            markers = [
                event["contact"].upper().replace("-", "_")
                for event in clip["contacts"]
                if event["frame"] == source_frame["sourceFrame"]
            ]
            frames.append({
                "page": page,
                "x": x,
                "y": y,
                "w": sprite.width,
                "h": sprite.height,
                "pivot": [
                    round(SOURCE_PIVOT[0] - crop[0], 3),
                    round(SOURCE_PIVOT[1] - crop[1], 3),
                ],
                "phase": round(
                    (source_frame["sourceFrame"] - clip["frameRange"][0])
                    / max(1, clip["sourceFrames"] - 1),
                    6,
                ),
                "sourceFrame": source_frame["sourceFrame"],
                "musicalTimestampSeconds": source_frame["musicalTimestampSeconds"],
                "label": clip["displayName"],
                "markers": markers,
                "contacts": contacts,
                "support": source_frame["support"],
                "contactType": source_frame["contact"],
                "freeFoot": source_frame["freeFoot"],
                "centerOfMass": center,
                "semanticAnchors": anchors,
                "effectAnchors": {
                    "head": anchors["head"],
                    "leftPaw": anchors["leftHand"],
                    "rightPaw": anchors["rightHand"],
                    "leftFoot": anchors["leftFoot"],
                    "rightFoot": anchors["rightFoot"],
                    "root": anchors["root"],
                    "board": [
                        round(SOURCE_PIVOT[0] - crop[0], 3),
                        round(SOURCE_PIVOT[1] - crop[1], 3),
                    ],
                },
                "segmentDepth": SEGMENT_DEPTH,
            })
            total_frames += 1
        metadata["clips"][clip_id] = {
            "action": clip["action"],
            "durationBeats": round(clip["durationSeconds"] * 2, 3),
            "fps": manifest["sourceFPS"],
            "frameCount": len(frames),
            "entryStance": "standing",
            "exitStance": "standing",
            "mirroringSafe": False,
            "contacts": clip["contacts"],
            "frames": frames,
        }
    if len(packer.pages) > 2:
        raise RuntimeError(
            f"{hero} needs {len(packer.pages)} atlas pages; candidate budget is two"
        )
    pages = []
    for index, page in enumerate(packer.pages):
        path = output / f"atlas-{index}.png"
        save_indexed(page, path)
        pages.append(path)
    metadata["pages"] = [path.name for path in pages]
    metadata_path = output / "atlas.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return {
        "frames": total_frames,
        "pages": len(pages),
        "compressedBytes": sum(path.stat().st_size for path in pages)
        + metadata_path.stat().st_size,
        "estimatedDecodedTextureBytes": len(pages) * 1024 * 1024 * 4,
        "files": {
            path.relative_to(ROOT).as_posix(): sha256(path)
            for path in [*pages, metadata_path]
        },
    }


def main() -> None:
    manifest = json.loads(RENDER_MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("quick"):
        raise RuntimeError("Full Blender render-manifest.json is required")
    report = {
        "candidateStatus": "human-review-required",
        "productionPixelSource": "Blender transparent RGBA renders",
        "sourceManifest": RENDER_MANIFEST.relative_to(ROOT).as_posix(),
        "sourceHash": manifest["sourceHash"],
        "manualCleanup": "blocked: Aseprite and LibreSprite unavailable",
        "heroes": {
            hero: build_hero(hero, manifest)
            for hero in HEROES
        },
    }
    report_path = BUILD_ROOT / "atlas-build-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
