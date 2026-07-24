# Performance and asset-memory report

Measured 2026-07-24 from the checked-in 384×216 application with headless
Chromium. Machine-readable evidence lives in:

- `docs/images/appalachian/final/frolic-browser-report.json`
- `docs/images/appalachian/final/frolic-capture-report.json`
- `docs/images/appalachian/frolic-atlas-report.json`
- `docs/images/appalachian/frolic-audio-report.json`
- `docs/images/qa-browser/smoke-report.json`

## Appalachian Frolic runtime

| Check | Result |
| --- | ---: |
| Display pacing, 116 presentation intervals | 16.666 ms average |
| Display pacing p95 | 16.800 ms |
| Display pacing maximum | 16.800 ms |
| Footwork Lab stage + hero + HUD + neutral panel, 600 renders | 0.140 ms average |
| Fixed simulation rate | 120 Hz |
| Presentation target | 60 Hz |
| Native JavaScript suite | 87/87 passing across 79 checked modules |
| Browser console errors / failed requests | 0 / 0 |
| Real-time full chorus | Results in 68.588 s; 180/180 planned inputs |

The display sample stayed inside one nominal 60 Hz interval. The Footwork Lab
benchmark deliberately includes two canvases, the full Frolic stage/HUD, atlas
hero, diagnostics, and authoring readouts. It is a desktop automated baseline,
not a substitute for a physical low-end phone pass.

The full-chorus browser run crossed all eight strain checkpoints, accepted
seven varied trade responses, reached the non-looping results layer, and
rendered all five categories. Its final routine scored 77 with restraint
0.733. Evidence is in
`docs/images/appalachian/final/frolic-full-chorus-report.json`.

### Selected hero/profile atlas

Frolic has six packs but retains only the selected hero/profile pack:

| Pack range | Pages | Drawings | Transfer bytes | Decoded texture |
| --- | ---: | ---: | ---: | ---: |
| KittyKaki profiles | 1 × 1024² indexed PNG each | 164 each | 595,244–598,964 | 4,194,304 |
| Soder profiles | 1 × 1024² indexed PNG each | 164 each | 604,621–608,991 | 4,194,304 |

The transfer figure includes explicit JSON metadata. Image bytes range from
51,745 to 63,160; metadata ranges from 542,368 to 546,960. Browser QA observed
exactly one Frolic `atlas.json` and one atlas page for each selected run. The
previous mode’s atlas is released on the mode boundary.

All six generated reports have:

- `0.000 px` worst planted-foot displacement;
- no silhouette, missing-limb, contact, atlas, or transition warnings;
- worst adjacent-frame joint motion below 12 source pixels.

### Frolic audio

| Audio set | Checked-in bytes | Approx. decoded AudioBuffer bytes | Runtime-loaded |
| --- | ---: | ---: | --- |
| 68-second stereo master | 5,997,644 | 11,995,200 | yes |
| 39 round-robin foot samples + manifest | 493,286 | 979,020 | yes |
| Four synchronized mono stems | 11,995,376 | 23,990,400 | no |

The Frolic-specific loaded audio is about 6.49 MB on disk and 12.97 MB
decoded. With one atlas, the incremental decoded working set is approximately
17.17 MB (16.37 MiB), excluding the application’s shared UI and Web Audio
graph. Authored stems are source assets for future responsive mixing and are
not requested by the current runtime.

## Touch layout

The automated landscape mobile viewport is 844×390. Frolic and Step Shed show
four 66×40 pads in a two-by-two bank labeled STEP, BRUSH, DRIVE, and LICK plus
the existing direction stick. The bank begins to the right of the hero’s
lower-body gameplay region, so it never covers the shoes. A real Playwright
touch tap produced an immediate STEP input and visible micro-response.

Portrait remains a rotate-device gate. Physical haptic strength, end-to-end
speaker latency, low-end Android frame pacing, and thermal behavior still need
device testing.

## Measure Match retained baseline

The existing Measure Match browser report remains green:

| Check | Result |
| --- | ---: |
| Display pacing average | 16.666 ms |
| Display pacing p95 / maximum | 16.800 / 16.800 ms |
| Isolated atlas + stage + HUD render, 600 samples | 0.291 ms average |
| Active base hero atlas | 2 × 1024²; 8,388,608 decoded bytes |

KittyKaki’s base pack is 800,223 compressed bytes including metadata; Soder’s
is 804,564. Hero Lab intentionally holds both, for an estimated 16 MiB of
decoded base-atlas textures.

## Runtime bounds

- Canvas dimensions remain 384×216 with image smoothing disabled.
- The fixed-step loop caps catch-up at fourteen 1/120-second steps.
- Animation phase, contacts, UI, judging, and audience cues share the audio
  clock; assets are not advanced from display-frame numbers.
- Frolic atlas loading is hero/profile lazy, and all runtime URLs are local.
- Atlas pages are lossless indexed PNG with trimming, padding, and extrusion.
- Crowd count, particles, and replay histories remain bounded.
- Audio and atlas resources stop or release on pause, retry, mode switch, and
  destroy.
- A visible running game resumes an explicitly suspended AudioContext. If a
  browser reports `running` but its audio time does not advance for 750 ms, the
  musical clock switches to a monotonic failover without seeking backward;
  immediate samples still schedule from the real context timestamp. Normal tab
  hiding uses the explicit pause/resume path.
- Approval GIFs, MP4s, Blender source, stems, and diagnostic boards are
  development artifacts and are never fetched by normal play.
