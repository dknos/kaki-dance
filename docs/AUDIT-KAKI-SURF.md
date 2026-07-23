# Kaki-Surf v2.4.0 portability audit

Audited on 2026-07-23 against `dknos/kaki-surf` remote `main` commit
`561ebdd5693190356cbae55c3051a1e035f89ab3`. The local Kaki-Surf working tree
was clean and was not modified.

## Required source review

| Source | Portable lesson | Kaki-Dance decision |
| --- | --- | --- |
| `js/rider-animation.js` | Frozen pixel-pose timelines, deterministic presentation variants, reduced-motion sampling | Generalize to a full articulated Kaki rig, contact-authored timelines, and sampled pose cadence |
| `js/sprites.js` | Code-authored silhouettes and pixel-snapped modular parts | Draw a plush articulated dancer from rig anchors with deterministic limb ordering |
| `js/tricks.js` | Renderer-free session state and plain-data manifests | Replace aerial sessions with beat-relative `MoveSession` and a declared transition graph |
| `js/trick-catalog.js` | Frozen tuning records with no renderer callbacks | Use renderer-independent `MoveDefinition` records containing stances, contacts, costs, windows, and timelines |
| `js/trick-scoring.js` | Pure signatures, completion filtering, and repeat decay | Keep scoring pure; expand it to the five judging categories and phrase signatures |
| `js/input.js` | Keyboard/gamepad/touch normalization, edge buffers, lifecycle clearing | Preserve the input boundary while remapping actions to dance grammar |
| `js/renderer.js` | One 384×216 composition, interpolation, bounded particles, semantic events | Build a new three-quarter cypher renderer behind a narrow interface |
| `js/asset-loader.js` | Independent validation and complete code fallback | Treat local optional music/art independently; code-authored stage remains the complete fallback |
| `js/integration-adapter.js` | Lazy construction and frozen lifecycle surface | Expose `createKakiDance` with start/pause/resume/restart/destroy/snapshot |
| `docs/TRICK-GRAMMAR.md` | Simulation owns trick truth; renderer consumes stable fields | Dance move/contact/score truth stays in `js/dance` |
| `docs/CONTROLS-AND-FEEL.md` | Simple default, advanced Q/E/F/T, buffered contextual actions | Retain the familiar language with new dance contexts |
| `docs/ASSET-MANIFEST.md` | Local relative assets, validated dimensions, provenance | Keep runtime static and local; document the original song and code-authored art |

## Portable systems

- 384×216 fixed logical Canvas with nearest-neighbor scaling.
- Fixed 1/120-second gameplay update with bounded catch-up.
- Seeded gameplay and deterministic QA inputs.
- Held, pressed, released, and buffered logical input actions.
- Independent keyboard, controller, and touch ownership.
- Renderer-independent catalogs and session manifests.
- Pure scoring and recent-signature repeat decay.
- Semantic events shared by renderer and audio.
- Defensive local storage with a standalone key.
- Static relative module graph, no bundler, and native Node tests.
- Narrow host adapter and explicit lifecycle cleanup.

## Surf-specific systems intentionally excluded

- Wave profiles, surface queries, curl and tube state.
- Board trim, slope drive, wave collision, launches, air bounds, and landings.
- Board catalog, wildlife, traffic, pickups, and surf conditions.
- Surf scoring buckets, Flow, wave camera, and surfing tutorials.
- Surf-specific player fields and sprite poses.

Kaki-Dance implements a new beat/contact/balance simulation. No surf physics or
surf world state is imported or copied into this repository.
