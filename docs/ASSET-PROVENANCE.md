# Asset manifest and provenance

Gameplay, collision, contact, scoring, beat timing, and crowd behavior remain
code-owned. Raster references never define gameplay state.

## User-supplied character references

| Runtime file | Original user path | SHA-256 | Use |
| --- | --- | --- | --- |
| `assets/portraits/kittykaki.webp` | `C:\Users\rneeb\Downloads\kittykaki_fumo_real (1).webp` | `718dfbaeb7074154750bddf0dfad7473bf6ef42491761d1f771082687c4cca66` | Character-select portrait and plush proportion/color reference |
| `assets/portraits/soder.png` | `C:\Users\rneeb\Downloads\5017fbac-c2d1-4d7a-b14b-1642e9b1ac05.png` | `ce8f5d387825aa3c1d5b0c1f9b55f0a7f3d63c084d7bda75f388d9b3c3d7eae6` | Character-select portrait and dedicated coil/hood topology reference |

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
- KittyKaki articulated pixel puppet and Soder dedicated coil puppet.
- Twelve KemonoKaki-inspired crowd profiles.
- HUD, timing labels, particles, shadows, contact marks, and replay trails.

All code-authored art uses the project palette and renders at the fixed 384×216
logical resolution.

## Offline Blender proxy

`tools/blender/build_kaki_proxy.py` generated the checked-in Blender 5.1
mechanics-study artifacts on 2026-07-23. They are authoring references and are
never fetched by the runtime.

| Artifact | SHA-256 |
| --- | --- |
| `tools/blender/kaki-power-proxy.blend` | `7b25187b7f11b81ccc86e6df077322e97d08f7e7100424a9b6e4b0ce8323acad` |
| `tools/blender/exports/kaki-power-reference.json` | `366d1b3d754ed00e8165731e15e6b99f36e4ae5905dddfcce7e02ec1d938de49` |

The five 384×216 reference passes are deterministically regenerated from the
`.blend` for backspin, swipe, windmill, flare, and headspin. The proxy contains
19 named bones, five timeline markers, contact markers, and a fixed
three-quarter orthographic camera.
