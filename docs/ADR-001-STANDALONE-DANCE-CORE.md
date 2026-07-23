# ADR-001: Standalone audio-clocked dance core

Status: accepted 2026-07-23.

## Decision

Kaki-Dance is a standalone native JavaScript module set with a 384×216 Canvas
renderer, deterministic 1/120-second gameplay updates, Web Audio as the music
clock, local relative assets, no runtime bundler, and a narrow host adapter.

Gameplay truth is renderer-independent:

```text
AudioContext.currentTime -> BeatClock -> MoveSession / scoring / AI
                                      -> stable snapshot + semantic events
                                      -> renderer / SFX / host callbacks
```

The fixed step owns input consumption, move requests, stamina, balance,
declared-contact anchors, scoring events, AI decisions, and replay records.
`BeatClock` supplies authoritative musical position to every step. Animation,
camera, crowds, particles, and hit-stop consume gameplay snapshots but never
alter eligibility or score.

## Contact rule

Every planted paw or foot comes from the current `MoveDefinition`. The contact
solver locks a named limb to a floor anchor for the declared interval and
reports error. The renderer never invents contact truth from the shape it draws.

## Static host rule

`index.html` loads relative CSS, modules, WAV, JSON, and SVG. There is no
`dist`, CDN, server process, or runtime network service. GitHub Pages can serve
the checked-in tree unchanged.

## Why Canvas first

The bottleneck to validate is authored dance grammar, contact stability, beat
feel, and readable plush poses. Canvas 2D is sufficient for the bounded crowd
and particle budget. The render facade can be replaced later without changing
move, timing, scoring, AI, or replay state.
