# Rejected procedural rescue and authored-atlas replacement

## Status of `ce32ead`

Commit `ce32ead1003f44d32ab5a6add6e39dd50fa7e8ec` is an **unsuccessful visual
attempt**. It is not production-quality hero rendering.

That rescue correctly proved:

- one fixed-length `BipedRig` for KittyKaki and Soder;
- deterministic IK and finite geometry;
- exact contact targets and biped support semantics;
- normal Soder arms and legs beneath the snake costume.

Those are valuable hidden-rig properties. They did not prove that the rendered
characters were anatomically believable.

## Root cause

`js/render/dancer.js` used `rig.depthFront` to choose one complete far side and
one complete near side. An entire arm therefore rendered behind the torso while
the other rendered in front. Cross-body breaking needs independent camera depth
for upper arm, forearm and hand. A valid pose can require:

```text
upper arm behind torso
elbow beside torso
forearm in front
hand in front of the opposite shoulder
```

No additional whole-arm boolean can represent that sequence. The failure
produced disconnected shoulders, backward-looking hands, center-fused elbows
and whole limbs disappearing behind the body.

The original deterministic evidence is preserved under
`docs/images/measure-match/rejected-ce32ead/`. It is intentionally shown as
rejected on the [visual review board](../hero-rescue.html).

## Replacement architecture

| Layer | Responsibility |
| --- | --- |
| Hidden `BipedRig` | contacts, center of mass, support regions, balance, eligibility, deterministic replay, debug overlays and effect anchors |
| Blender reference armature | one biped armature, both costumes, orthographic camera and independent segment camera depth |
| Authored pose library | dedicated mechanics, anatomical left/right, clearance drawings, contacts, markers and normalized phase |
| Offline pixel cleanup/export | constrained palette, hard outlines, cuffs, paws, directional shoes, trimmed bounds, padding and extrusion |
| Runtime atlas renderer | nearest-neighbor Canvas playback from audio-clock phase; no public procedural limbs |

The old procedural renderer remains available only through the **Procedural rig
(debug)** Hero Lab checkbox.

Rhythm contact flashes resolve against the selected atlas frame's exported
contact/effect anchors. Gameplay contact truth remains in `BipedRig`; both
layers sample the same normalized phase, while only the authored atlas decides
public occlusion and silhouette.

## Character approval gate

Five native gameplay poses and 4× nearest-neighbor proofs were generated for
each hero:

1. Neutral groove
2. Cross-body arm groove
3. Deep go-down
4. Floorwork leg-cross
5. Baby Freeze

Artifacts:

- `docs/images/measure-match/approval/kitty-approval-native.png`
- `docs/images/measure-match/approval/kitty-approval-4x.png`
- `docs/images/measure-match/approval/soder-approval-native.png`
- `docs/images/measure-match/approval/soder-approval-4x.png`
- per-hero silhouette, golden-chain and random-20 sheets in the same directory.

The cross-body keys use independent segment depth: for example, KittyKaki's
left upper arm is behind the torso while the same arm's forearm and paw are in
front. Anatomical left remains dancer-left regardless of its screen position.

Soder uses the same humanoid joint chain and motion source as KittyKaki. The
green hood, belly, sleeves, trouser legs, cuffs and tail are costume. The tail
is never a contact or support anchor.

## Authored animation scope

The public atlas contains only the MVP presentation clips:

| Clip | Beats | Drawings |
| --- | ---: | ---: |
| Idle/Groove | 2 | 15 |
| Basic Rock | 4 | 30 |
| Go Down | 4 | 30 |
| 6-Step | 4 | 30 |
| Windmill | 4 | 30 |
| Baby Freeze | 4 | 30 |
| Clean Get-Up | 4 | 30 |
| Victory | 2 | 15 |
| Miss/Recovery | 2 | 15 |

Every clip declares entry/exit stance, duration, atlas frames, stable root
pivots, contacts, anticipation/accent/recovery markers, semantic anchors,
effect anchors and whether mirroring is safe.

The 6-Step has six authored support steps. Windmill has bespoke quarter-turn
drawings, shoulder/back travel and a leg scissor. Clean Get-Up begins from the
actual freeze and pushes, plants, transfers and rises rather than resetting to
idle.

## Atlas report

| Hero | Pages | Page dimensions | Drawings | PNG bytes | Metadata bytes | Total selected-hero transfer | Decoded texture memory |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| KittyKaki | 2 | 1024×1024 | 225 | 70,878 | 729,345 | 800,223 | 8,388,608 |
| Soder | 2 | 1024×1024 | 225 | 75,119 | 729,445 | 804,564 | 8,388,608 |

Both pages are indexed PNG with one-pixel extrusion and three-pixel packing
padding. Runtime Canvas smoothing is disabled. Only the selected hero is
preloaded by normal gameplay.

## Visual proof

- [Authored atlas review board](../hero-rescue.html)
- [Hero Lab](../hero-lab.html)
- `docs/images/measure-match/final/kitty-full-speed.mp4`
- `docs/images/measure-match/final/kitty-quarter-speed.mp4`
- `docs/images/measure-match/final/soder-full-speed.mp4`
- `docs/images/measure-match/final/soder-quarter-speed.mp4`

The normal-speed videos are 14.4 seconds at 12 selected drawings per second.
Quarter-speed videos are 57.6 seconds and expose every held drawing without
camera shake, particle cover or motion blur. Twenty deterministic frames per
hero are also presented as still sheets because automated geometry tests do
not replace visual inspection.

## Honest visual status

The implemented atlas fixes the rejected whole-side occlusion model and passed
this development pass's still and quarter-speed trace audit. Final artistic
acceptance still belongs to the project reviewer. In particular:

- Soder's decorative tail approaches the rear leg silhouette in a small number
  of windmill drawings, though it remains behind and never carries weight.
- The offline cleanup is a deterministic Pillow-based equivalent workflow
  because Aseprite/LibreSprite is not installed in this workspace; an art
  director may still request pixel-level revisions after reviewing the board.
- The Blender costume meshes are mechanics/depth blockouts, not final rendered
  characters. Public art is the cleaned atlas, not the Blender proxy.
