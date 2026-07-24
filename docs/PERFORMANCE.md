# Performance and compression report

Measured 2026-07-24 from the checked-in tree at the 384×216 logical resolution
with headless Chromium. Source:
`docs/images/qa-browser/smoke-report.json`.

## Runtime results

| Check | Result |
| --- | ---: |
| Display pacing, 120 presentation intervals | 16.666 ms average |
| Display pacing p95 | 16.800 ms |
| Display pacing maximum | 16.800 ms |
| Isolated atlas + stage + HUD render, 600 samples | 0.291 ms average |
| Fixed simulation rate | 120 Hz |
| Paused audio-clock drift | 0 beats |
| Resume advance in 320 ms wall time | 0.522 beats |
| Native test suite | 58/58 passing |
| Worst focused semantic-rig contact error | 3.61×10⁻¹⁵ logical px |
| Worst focused semantic-rig bone error | 5.33×10⁻¹⁵ logical px |

The full 120-interval sample remained inside one nominal 60 Hz display
interval; isolated Canvas work averaged 0.291 ms. This is a desktop automated
baseline, not a substitute for a physical low-end Android pass.

## Hero atlas cost

| Hero | Pages | Drawings | Compressed runtime bytes | Decoded texture estimate |
| --- | ---: | ---: | ---: | ---: |
| KittyKaki | 2 × 1024×1024 indexed PNG | 225 | 800,223 | 8,388,608 |
| Soder | 2 × 1024×1024 indexed PNG | 225 | 804,564 | 8,388,608 |

The compressed figure includes explicit JSON metadata. Image bytes alone are
70,878 for KittyKaki and 75,119 for Soder. Normal gameplay preloads only the
selected hero. Hero Lab intentionally holds both, for an estimated 16 MiB of
decoded atlas textures.

On the local HTTP server, initial KittyKaki resources measured:

| Resource | Decoded body | Local fetch duration |
| --- | ---: | ---: |
| `atlas.json` | 729,345 bytes | 2.7 ms |
| `atlas-0.png` | 61,190 bytes | 2.0 ms |
| `atlas-1.png` | 9,688 bytes | 1.9 ms |

The browser requests the pages in parallel after metadata validation. There is
no runtime reference-art, Blender, AI or cloud request.

## Other asset cost

| Asset/package | Result |
| --- | ---: |
| Runtime audio | 3,386,924 bytes; 38.4 s mono PCM, 44.1 kHz |
| Final proof media | 12 files, 3,996,545 bytes |
| Approval stills | 10 files, 217,279 bytes |
| Tree excluding `.git` and `node_modules` | 30,075,125 bytes |

Proof videos and source/reference art are documentation files; the game does
not fetch them.

## Mobile viewport

The automated landscape mobile viewport is 844×390. In Measure Match and
Practice it shows:

- one 78×78 PAW button;
- no direction stick;
- no Style, Power or Freeze buttons;
- a 16-cell strip clear of the hero;
- the existing 384×216 canvas scaled with nearest-neighbor presentation.

Portrait remains a rotate-device gate. Browser QA completed with zero console
errors and zero failed requests.

## Runtime bounds

- Simulation uses a fixed 1/120-second step and caps catch-up at 14 steps.
- Canvas dimensions remain 384×216 with smoothing disabled.
- Atlas pages are lossless indexed PNG with trimmed frames, padding and
  extrusion.
- Crowd count is bounded at twelve code-authored profiles.
- Particles use a fixed pool of 96.
- Replay trails retain at most five poses.
- Audio sources stop on pause, retry and destroy.
- Atlas metadata compaction is deferred until after visual approval.
