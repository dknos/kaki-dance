# Asset manifest and provenance

Gameplay, collision, contact, scoring, beat timing, and crowd behavior remain
code-owned. Raster references never define gameplay state.

## User-supplied character references

| Runtime file | Original user path | SHA-256 | Use |
| --- | --- | --- | --- |
| `assets/portraits/kittykaki.webp` | `C:\Users\rneeb\Downloads\kittykaki_fumo_real (1).webp` | `718dfbaeb7074154750bddf0dfad7473bf6ef42491761d1f771082687c4cca66` | Character-select portrait and plush proportion/color reference |
| `assets/portraits/soder.png` | `C:\Users\rneeb\Downloads\5017fbac-c2d1-4d7a-b14b-1642e9b1ac05.png` | `ce8f5d387825aa3c1d5b0c1f9b55f0a7f3d63c084d7bda75f388d9b3c3d7eae6` | Character-select portrait and snake-kigurumi costume reference; anatomy remains the shared biped |

The project owner supplied both files directly for this game.

## KemonoKaki crowd direction

Collection: <https://www.scatter.art/c/kemonokaki/gallery>

The collection page describes KemonoKaki as a hand-drawn PFP collection inspired
by kemonomimi and neo-chibi aesthetics. Gallery tokens 9999, 9998, and 9997
were used as trait references alongside the two user-supplied portraits.

`docs/art-source/kemonokaki-crowd-reference.png` was generated with the built-in
OpenAI image tool on 2026-07-23. SHA-256:
`e571b3f5398de264eec93d792916ff00df85d9ac83df11f9666702b2ef82d306`.

Prompt:

> Create one polished late-16-bit pixel-art reference sheet showing twelve
> distinct neo-chibi plush KemonoKaki crowd members for a moonlit breakdancing
> cypher, in a 4×3 arrangement, using the supplied KittyKaki, Soder, and gallery
> references. Prioritize varied ears, hair, hoodies, bows, headphones, caps,
> strong silhouettes, deep navy outlines, and a restrained moonlit palette.
> No text, logos, watermark, grid, weapons, photorealism, or cropped features.

The generated sheet is authoring reference only. Runtime crowd characters are
redrawn as deterministic code-authored pixel profiles; the game does not call
an image service.

## Hero anatomy ideation

Grok Imagine was used only for controlled reference ideation on 2026-07-23.
Neither sheet is loaded at runtime or copied frame-for-frame. Anatomy and
contacts were rebuilt on the shared Blender armature, simplified into authored
pixel-pose keys, and inspected at 384×216.

| Selected file | Dimensions | Bytes | SHA-256 | Transformation |
| --- | ---: | ---: | --- | --- |
| `docs/art-source/hero-rescue/kitty-anatomy-reference-grok.jpg` | 1280×720 | 261,785 | `83de903c76bf25d3df73387b4743bd6299f2033adaf250a85fce89e2a564b020` | Selected generated JPEG copied unchanged |
| `docs/art-source/hero-rescue/soder-anatomy-reference-grok.png` | 1280×720 | 897,948 | `33d5387277e3bde27619525cf3b0649846e27e2761779cf1fc398126a029b649` | Final selected local Grok PNG export copied unchanged |

KittyKaki generation prompt:

> Production character reference sheet for KittyKaki, a single identical
> compact athletic neo-chibi plush breakdancer cat hero for a late-16-bit
> pixel-art game aesthetic rendered as clean illustration: short blue hair,
> cream face and cream paws, upright cat ears, restrained cat tail, dark navy
> sleeveless street-dance hoodie, dark pants, oversized directional black
> dance shoes. Show a front, three-quarter, side and back turnaround plus
> exactly six golden-chain keys: Basic Rock, Go Down, 6-Step, shoulder-back
> Windmill with leg scissor, Baby Freeze and Clean Get-Up. Keep anatomy,
> costume, proportions and joints identical; no extra or missing limbs, no
> giant head hiding anatomy, no text, scene, gradients, motion blur,
> photorealism or watermark. Aspect ratio 16:9.

Soder generation and final repair direction:

> Production anatomy and costume reference sheet for Soder, a compact athletic
> neo-chibi humanoid plush breakdancer wearing a padded green snake kigurumi.
> Use exactly normal biped anatomy: paired shoulders, arms, elbows, wrists,
> hands, hips, thighs, knees, shins, ankles and directional feet. The snake
> identity is costume only: hood around the visible blue-haired cream face,
> padded torso, belly panel, sleeves, trouser legs, cuffs and one soft
> decorative tail behind the pelvis. Show matching turnarounds and the six
> golden-chain keys. Make 6-Step low with planted hands and circling legs,
> Windmill horizontal on shoulder/back with a wide leg scissor, and Baby Freeze
> with a clear hand-elbow-knee support triangle. No serpentine lower torso,
> tail support, changing costume, extra limbs, text, motion blur, photorealism
> or watermark. Aspect ratio 16:9.

The sheets were treated as fallible suggestions: inconsistent generated
anatomy was not imported. The accepted runtime sources are the authored rig,
clips and renderer.

## Measure Match five-pose ideation

On 2026-07-24 the already-configured local Grok Imagine workflow generated two
additional offline references for the required five-pose gate. They were
inspected and rejected as final sprites; they guide costume continuity and
large pose intent only.

| Selected file | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `docs/art-source/measure-match/grok/kitty-five-pose-reference.png` | 1280×720 | 518,338 | `9be93441a998ee31fed41f398d2681caae9d80c64a4c539ff2bee60dd8e8f0df` |
| `docs/art-source/measure-match/grok/soder-five-pose-reference.jpg` | 1280×720 | 181,214 | `b5840c8f80f5de626910143489abbb273d4e8c4bae8774fc5f3bd35e968d2e1d` |

KittyKaki prompt:

> Offline character-design reference sheet for Kaki-Dance: one consistent
> blue-haired cat-girl plush breakdancer named KittyKaki in dark charcoal
> oversized street hoodie, strong athletic shoulders and thighs, directional
> black dancer shoes, expressive small cream paws, recognizable sleepy navy
> eyes and tiny cat mouth, late-16-bit neo-chibi game proportions. Show exactly
> five separate full-body orthographic three-quarter poses left-to-right on a
> plain neutral background: neutral groove, anatomically clear cross-body arm
> groove, deep controlled go-down with reaching hand, low floorwork leg-cross
> with readable hips/knees, and a strong baby freeze support triangle. Every
> shoulder to upper arm to elbow to forearm to wrist to paw and every hip to
> thigh to knee to shin to ankle to foot must be visible and unambiguous;
> believable weight and occlusion. Costume and face stay identical. Reference
> art only, crisp hard edges. Avoid text, labels, logos, extra limbs, merged
> joints, backward hands, floating paws, giant white forearms, blurry edges,
> and scenery.

Soder prompt:

> Offline character-design reference sheet for Kaki-Dance: one consistent
> humanoid plush breakdancer named Soder, with KittyKaki-like normal biped
> anatomy inside a padded green snake kigurumi: snake hood over blue hair and
> plush face, two normal shoulders and arms in green sleeves with cuffs and
> small cream paws, padded green torso with brown belly panel, pelvis, two
> costume legs, directional green dancer shoes, and a soft decorative tail
> that never bears weight. Late-16-bit neo-chibi proportions. Show exactly five
> separate full-body orthographic three-quarter poses left-to-right on a plain
> neutral background: neutral groove, anatomically clear cross-body arm groove,
> deep controlled go-down with reaching hand, low floorwork leg-cross with
> readable hips/knees, and strong baby freeze support triangle. Every limb
> chain must be visible and unambiguous with believable weight and occlusion;
> costume and face identical. Reference art only, crisp hard edges. Avoid text,
> labels, logos, coil anatomy, tail support, extra limbs, merged joints,
> backward hands, floating paws, blurry edges, and scenery.

## Runtime audio

`assets/audio/moon-block-party.wav` is generated offline by
`scripts/build-breakbeat.mjs` from seeded synthesis and checked in. Runtime
playback is local Web Audio; no streaming service or cloud API is required.

- SHA-256: `6760298078ccc5fe8002c9f9f084ed1a32d55b6bb1d77f7f82b2e2a9983732e9`
- Format: mono 16-bit PCM WAV at 44.1 kHz
- Duration: 38.4 seconds / 16 bars at exactly 100 BPM
- Downbeat offset: 0.084 seconds
- Sources: deterministic synthesized kick, snare, hats, bass, stabs, scratch,
  and vinyl bed; no samples or generated vocals

## Code-authored runtime art

- Moonlit Oekaki Block Party background, floor, DJ booth, speakers, skyline,
  banners, foreground silhouettes, and vinyl-groove beat ring.
- One fixed-length hidden biped solver for KittyKaki and Soder gameplay
  semantics.
- Authored, trimmed indexed hero atlases with camera-space occlusion, cuffs,
  directional hands/feet and profile-specific costume cleanup.
- Twelve KemonoKaki-inspired crowd profiles.
- HUD, timing labels, particles, shadows, contact marks, and replay trails.

All code-authored art uses the project palette and renders at the fixed 384×216
logical resolution.

## Offline Blender shared biped

`tools/blender/build_kaki_proxy.py` generated the checked-in Blender 5.1
hero-reference artifacts on 2026-07-23. They are authoring references and are
never fetched by the runtime.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `tools/blender/kaki-hero-biped.blend` | 172,688 | `cb2a281c777c071bd566ed50a3d55a1f570eb9e164a544e8f1c498504736929c` |
| `tools/blender/exports/kaki-hero-golden-chain.json` | 281,207 | `80314e6880ecd58d90a4042d5059918ebb611ccc24a33b5c4a9f79240d5d9cd8` |

The source has one named biped armature used by both costume profiles, local
elbow/knee limits, six golden-chain timeline blocks, floor contact markers and
a fixed orthographic camera. It exports five phases per move with contacts and
bone lengths. `tools/blender/reference/hero-rescue/` contains 30 deterministic
384×216 color, silhouette and turnaround passes totaling 2,945,248 bytes.

## Measure Match production source and runtime atlases

The replacement production source was generated offline on 2026-07-24:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `tools/blender/kaki-measure-match-production.blend` | 1,006,856 | `c6b42f6ab347ac2d538391c222222f7dca553f69b4025682acc303bf3fed48ae` |
| `tools/blender/exports/kaki-measure-match-camera-depth.json` | 555,341 | `65625a6ef319fc3881b8689f9514622d64ecd99f674a46f8cc34b9685aa5b7b0` |

The source contains one `KakiDanceProductionBiped` armature for both costume
profiles and independent camera-space depths for twelve arm/leg segments. Ten
384×216 mechanics renders live under
`tools/blender/reference/measure-match/`. They are not runtime sprites.

`tools/art/hero_pose_library.py` and
`tools/art/build_hero_atlases.py` implement the authored pose, cleanup and
export workflow. Runtime outputs:

| Hero | PNG pages | PNG bytes | Metadata bytes | Total bytes | Decoded texture estimate |
| --- | ---: | ---: | ---: | ---: | ---: |
| KittyKaki | two indexed 1024×1024 | 70,878 | 729,345 | 800,223 | 8,388,608 |
| Soder | two indexed 1024×1024 | 75,119 | 729,445 | 804,564 | 8,388,608 |

Every page is local, lossless and nearest-neighbor. The metadata carries trimmed
bounds, stable pivots, contacts, twenty-one semantic anchors, effect anchors,
markers and twelve segment depths per drawing. No reference, Blender or cloud
asset is fetched at runtime.

## Appalachian Frolic source, atlases, and audio

Frolic adds no generated-image or third-party media dependency. Practitioner
footage listed in `docs/appalachian-sources.md` informed movement principles
only; no frames, motion capture, recordings, or samples were redistributed.

The deterministic shared-biped source:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `tools/blender/kaki-appalachian-frolic.blend` | 863,924 | `97b7119de226ceba5c7b294cea8bb7b637594219faf7bc2447a00d1579d42451` |
| `tools/blender/exports/kaki-appalachian-frolic-rig.json` | 2,028,074 | `c2006298dac2d749a8bee77c87b97e357472ef41f24f857f1f836616d9b41641` |

The Blender container can change a few bytes when re-saved by the same Blender
build; the JSON export is the byte-deterministic review contract.
`KakiFrolicSharedBiped` contains paired arms, hands, legs, heel/toe controls,
foot IK, knee poles, and non-supporting Soder costume controls. The Blender
profiles and camera are authoring/diagnostic sources, not public sprites.

`tools/art/appalachian_pose_library.py` and
`tools/art/build_appalachian_atlases.py` create six local runtime packs. Each
contains 164 authored drawings across fourteen movements and six transition
clips on one indexed 1024×1024 page:

| Profile packs | Compressed bytes each | Decoded texture each |
| --- | ---: | ---: |
| KittyKaki Flatfoot/Buck/Clog | 595,244–598,964 | 4,194,304 |
| Soder Flatfoot/Buck/Clog | 604,621–608,991 | 4,194,304 |

Normal play retains one selected hero/profile pack. The report, per-file
hashes, plant/joint lint, and page sizes are in
`docs/images/appalachian/frolic-atlas-report.json`.

`scripts/build-appalachian-audio.mjs` composes and synthesizes the checked-in
original “Board & Bow” master, four synchronized stems, and 39 round-robin
wood-board contacts. It uses no sample library:

| Runtime master | Format | Duration | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| `assets/audio/frolic/board-and-bow.wav` | stereo 16-bit PCM, 22.05 kHz | 68.000 s | 5,997,644 | `373e900960546d3fea36876aa3b2982a10992fde273d7f07697f05a6d0ab307b` |

The four stems are source assets and are not requested by normal play. All
runtime foot samples and their hashes are recorded in
`docs/images/appalachian/frolic-audio-report.json`.
