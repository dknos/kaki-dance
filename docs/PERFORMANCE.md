# Performance report

Measured 2026-07-23 from the checked-in tree at 384×216 using headless Chromium
and the browser smoke sequence.

## Results

| Check | Result |
| --- | --- |
| 120 presentation frames | 16.666 ms average |
| Presentation p95 | 16.8 ms |
| Presentation maximum | 16.8 ms |
| Isolated rescued Soder windmill render, 600 samples | 0.470 ms average |
| Shared-biped contact/bone sweep | 10,100 poses |
| Worst declared-contact error | 7.95×10⁻¹⁵ logical px |
| Worst bone-length error | 8.89×10⁻¹⁵ logical px |
| Native test suite | 40/40 passing |
| Runtime audio | 38.4 s, mono PCM, 44.1 kHz, 3.23 MiB |
| Hero review/capture package | 1.94 MB across 27 files |
| Full tree excluding `.git` and `node_modules` | 20.08 MB |

The browser report is stored in
`docs/images/qa-browser/smoke-report.json`. Its request and console error arrays
were empty. Pause/resume measured zero beat drift while paused.

The focused Hero Lab browser report is stored at
`docs/images/hero-rescue/after/hero-browser-report.json`. It sampled the six
golden-chain moves in both directions for both profiles, verified native
384×216 proof images and reported no request or console errors.

## Runtime bounds

- Simulation uses a fixed 1/120-second step and caps catch-up at 14 steps.
- Canvas is fixed at 384×216 with smoothing disabled.
- Crowd count is bounded at twelve code-authored profiles.
- Particles use a fixed pool of 96.
- Replay trails retain at most five poses.
- Audio sources are stopped on pause, retry, and destroy.
- Camera transforms and stage coordinates are integer-snapped.

## Profiling rule

Keep Canvas 2D until an ordinary target device shows sustained render work over
the frame budget. Renderer replacement must not change `MoveSession`, contact,
beat, scoring, AI, or replay state. Test at least one lower-end Android device
before calling mobile performance final; the current automated result is a
desktop headless baseline.
