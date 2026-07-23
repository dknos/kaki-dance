# Hero rig rescue report

## Failure removed

The old hero layer had two incompatible solvers. KittyKaki could silently
lengthen a planted arm from roughly 9.5 to 12.8 logical pixels, while Soder used
a separate segmented lower-body path. Final limbs were thick `pixelLine`
strokes, so elbows, wrists, knees, ankles, hand direction and shoe weight were
not consistently designed. Several floor-power moves also shared one
parameterized clip.

The rescue removes those shortcuts. Gameplay, stage, music, crowd, scoring and
input architecture were not expanded.

## Shared architecture

| Layer | Result |
| --- | --- |
| `BipedRig` | One deterministic fixed-length solve for both heroes: root, pelvis, chest, neck, head, paired shoulders/elbows/wrists/hands and hips/knees/ankles/feet |
| Profiles | `kittyProfile` and `soderProfile` own volumes, joint preferences, palette, head/costume treatment, hands, shoes and secondary attachments |
| IK | Joint limits, stable pole/bend preference, previous-frame continuity, authored flips only, unreachable-target clamping and bounded body correction |
| Clips | Dedicated golden-chain mechanics plus separate backspin, swipe, windmill, flare and headspin clips; no shared generic power clip |
| Transitions | Stepped deterministic bridges with shortest-angle interpolation, bend-side preservation and exact active contacts |
| Rendering | Tapered polygon volumes, upper/lower limb separation, joint overlaps, cuffs, directional extremities and controlled near/far order; skeleton lines are debug-only |

## Deleted alternate-anatomy assumptions

- Soder-only rig solver and topology dispatch.
- Segmented lower-body data and render loop.
- Lower-body endpoints presented as feet.
- Character-catalog claims that Soder needs different move anatomy.
- Move nicknames and documentation built around a non-humanoid lower body.
- Kitty's planted-arm length override.

Soder now has the same biped contract as KittyKaki. His hood, belly panel,
padded sleeves/leggings and soft tail are costume rendering only; the tail is
not support geometry.

## Approval media

- [Native before/after review board](../hero-rescue.html)
- [Focused Hero Lab](../hero-lab.html)
- [KittyKaki golden-chain GIF](images/hero-rescue/after/kitty-golden-chain.gif)
  and [MP4](images/hero-rescue/after/kitty-golden-chain.mp4)
- [Soder golden-chain GIF](images/hero-rescue/after/soder-golden-chain.gif)
  and [MP4](images/hero-rescue/after/soder-golden-chain.mp4)
- [Hero Lab full capture](images/hero-rescue/after/hero-lab.png)

The GIFs and MP4s are deterministic 384×216, 20 fps, 7.2-second captures with
no camera effects, particles or blur. The review board contains twelve native
before/after pairs and six native one-color silhouette proofs.

## Hero Lab

Run `npm run serve`, then open
`http://127.0.0.1:4177/hero-lab.html`.

The lab synchronizes both profiles at one move phase and supplies native, 2×
and 4× nearest-neighbor views; automatic chain playback; full/half/quarter
speed; frame stepping; mirroring; onion skin; skeleton and joint labels;
contacts; COM; support; silhouette; z-order; bone warnings; and a 28-card
golden-chain key-pose sheet.

## Blender and reference sources

- `tools/blender/kaki-hero-biped.blend` — one constrained armature and both
  costume profiles.
- `tools/blender/exports/kaki-hero-golden-chain.json` — five phases per move,
  complete named biped endpoints, bone lengths and contact metadata.
- `tools/blender/reference/hero-rescue/` — thirty 384×216 color, silhouette and
  turnaround passes.
- `docs/art-source/hero-rescue/` — two Grok anatomy/costume ideation sheets.
  Exact selection metadata, hashes and prompts are in
  `ASSET-PROVENANCE.md`.

Blender and generated references are offline authoring inputs only. Runtime
heroes remain hand-directed Canvas drawings.

## Asset and compression report

| Asset | Dimensions / duration | Bytes |
| --- | --- | ---: |
| KittyKaki MP4 | 384×216, 7.2 s, H.264, 20 fps | 99,719 |
| KittyKaki GIF | 384×216, 7.2 s, 64-color, 20 fps | 227,814 |
| Soder MP4 | 384×216, 7.2 s, H.264, 20 fps | 131,751 |
| Soder GIF | 384×216, 7.2 s, 64-color, 20 fps | 264,961 |
| Final hero proof package | 27 files | 1,944,548 |
| Shared Blender `.blend` | authoring source | 172,688 |
| Blender joint/contact JSON | schema 2 | 281,207 |
| Blender reference passes | 30 PNG files | 2,945,248 |

No runtime atlas was added; final characters are code-authored volumes. Motion
capture frames are documentation assets and never downloaded by gameplay.

## Verification

- Syntax: 57 JavaScript modules pass.
- Native tests: 40/40 pass.
- Exhaustive geometry: 10,100 move/profile/mirror/phase samples.
- Worst declared-contact error: `7.944109290391274e-15` logical pixels.
- Worst bone-length error: `8.881784197001252e-15` logical pixels.
- Focused browser QA: 24 golden-chain hero states, 28 contact cards, 12
  before/after pairs, six silhouettes, two videos, zero failed requests and
  zero console errors.
- Full browser loop: keyboard, live golden chain, freeze balance, pause/resume,
  retry, Soder selection, touch, labs, QA gallery and destroy lifecycle pass.
- Presentation: 16.666 ms average over 120 frames; isolated Soder windmill
  render averages 0.470 ms over 600 samples.

Machine-readable reports:

- `docs/images/hero-rescue/after/hero-browser-report.json`
- `docs/images/qa-browser/smoke-report.json`

## Remaining hero-specific shortcomings

- The most front-facing 6-Step crosses are flatter than its strongest thread
  poses when examined at quarter speed.
- KittyKaki's oversized chibi head still overlaps the near shoulder in two
  windmill in-betweens.
- Soder's padded hood briefly hides the far shoulder in deep floor poses.
- Extreme power-move foreshortening has fewer bespoke drawings than a future
  modular atlas could provide.
- The Blender costume proxies are deliberately low-poly mechanics blocks, not
  production meshes.

These are visible in Hero Lab and are not concealed with effects. Broader
content and placeholder polish remain out of scope until the hero milestone is
approved.
