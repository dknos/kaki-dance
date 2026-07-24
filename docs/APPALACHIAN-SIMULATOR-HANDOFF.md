# Appalachian simulator Gate 1 handoff

**CANDIDATE — HUMAN REVIEW REQUIRED**

No deployment, push, merge, or approval was performed.

## Play and review

From the repository root:

```bash
npm install
npm run serve
```

Open:

- game: `http://127.0.0.1:4177/` and choose Appalachian Frolic;
- review workbench: `http://127.0.0.1:4177/appalachian-simulator-review.html`;
- forced WebGL2: append `?renderer=webgl2`;
- explicit WebGPU capability-gate smoke: append `?renderer=webgpu`;
- old atlas comparison: use the review workbench’s **Old atlas** control.

## Controls

Gamepad: left stick travels; right stick shapes the authored arm field; LB/RB
isolate left/right arms; LT plus right stick controls body line and also biases
grounded variants; RT commits spring/toe variants; A holds/releases jump; X is
STEP; Y is BRUSH; B is DRIVE; D-pad left/right selects turn side; D-pad
up/down changes the small palette intent; R3 triggers a hand accent; Start
pauses.

Keyboard: WASD travels; arrows shape both arms; Q/E plus arrows isolate one
arm; Left Control plus arrows controls body line and grounds movement; Left
Shift commits; Space holds/releases jump; Z/X/C are STEP/BRUSH/DRIVE; R is a
hand accent; Escape/P pauses.

Touch provides separate travel and arm sticks, STEP/BRUSH/DRIVE/JUMP,
Ground/Commit, and left/right arm modifiers in landscape.

## Gate contents

- One shared GLB: 88 skinned mesh objects, 39 bones, 13 actions.
- Both first-class heroes: KittyKaki and Soter.
- Three selectable qualified profiles: Flatfoot, Buck, and Clog.
- Eight grounded movement candidates.
- Three distinct style jump prototypes.
- Nine authored right-stick arm-field poses.
- Independent left/right arm masks and a body-line layer.
- Twenty-four explicit 80–140 ms transition/recovery recipes with entry-frame
  ranking and bounded root warp.
- Deterministic 120 Hz travel, facing, jump, landing, Board Line, line-banking,
  scoring, and replay state.
- Genuine shoe-on-wood Foley families triggered by contact metadata, with
  velocity layers, round robin, footwear mapping, and board resonance.
- Live/atlas comparison, debug overlays, slow motion, frame step, and 13
  automated review captures.
- Ten Step Shed learn-by-doing lessons.

## Changed-file map

- Simulator state and gameplay: `js/appalachian/animation-controller.js`,
  `simulation.js`, `arm-pose-field.js`, `board-lines.js`,
  `transition-recipes.js`, `transition-graph.js`, `footwork-catalog.js`, and
  `phrase-judge.js`.
- Input and app integration: `js/input.js`, `js/game.js`,
  `js/integration-adapter.js`, `index.html`, and `styles.css`.
- Live rendering: `js/render/appalachian-three-renderer.js`,
  `js/render/renderer.js`, the local `js/vendor/` Three.js modules, and
  `assets/models/appalachian/`.
- Contact audio: `js/audio/foot-percussion-player.js` plus the retained local
  Foley receipts and sample packs under `assets/audio/frolic/feet/`.
- Blender source/export: `tools/blender/build_appalachian_frolic_rig.py`,
  `export_appalachian_simulator_glb.py`,
  `kaki-appalachian-frolic.blend`, and the archived atlas source
  `kaki-appalachian-frolic-atlas-candidate-1.blend`.
- Review surface: `appalachian-simulator-review.html`,
  `appalachian-simulator-review.css`,
  `js/appalachian-simulator-review.js`, and
  `docs/review/appalachian-simulator-gate-1/`.
- QA: `tests/appalachian-simulator.test.js`,
  `scripts/appalachian-simulator-qa.mjs`,
  `scripts/appalachian-simulator-browser.mjs`, package scripts, and compatible
  updates to the pre-existing Frolic QA.
- Documentation: `docs/APPALACHIAN-SIMULATOR-AUDIT.md`, this handoff,
  `docs/KNOWN-LIMITATIONS.md`, `docs/MOVE-AUTHORING.md`, and
  `docs/appalachian-animation-bible.md`.

## Source and provenance

Character, rig, motion, contacts, and exports are authored from
`tools/blender/kaki-appalachian-frolic.blend`. The current actions are
hand-blocked candidates informed by the practitioner and instructional sources
recorded in `docs/appalachian-sources.md`; they are not unattended generated
animation or reconstructions of personal historical steps.

The foot kit retains its CC0 source receipts in
`assets/audio/frolic/feet/manifest.json`: Joseph SARDIN shoe-on-wood/parquet
recordings and sturmankin’s trekking-shoe shuffle. No drum, cartoon impact, or
synthesized foot hit is substituted.

## QA

```bash
npm run qa:appalachian-sim
npm run qa:appalachian-sim:motion
npm run qa:appalachian-sim:arms
npm run qa:appalachian-sim:jumps
npm run qa:appalachian-sim:latency
npm run qa:appalachian-sim:audio
npm run qa:appalachian-sim:capture
```

Headless desktop evidence at this handoff:

- forced-WebGL2 live smoke: 88 skins, 39 bones, 13 actions;
- renderer p95 observed up to 1.8 ms at the 192×108 internal target during
  the integrated browser smoke; frame pacing p95 was 16.8 ms;
- sampled planted-foot residual during figure-eight smoke below 1 cm;
- input-to-visible p95: arms 16.3 ms, foot action 16.0 ms, jump anticipation
  15.4 ms;
- browser console/request failures: none after benign cancelled audio
  preloads are excluded.

These are headless desktop measurements, not physical controller/audio or
representative-phone results.

## Visible defects and required review

- Motion is a hand-blocked prototype; weight, timing, phrase character, and
  entrances/exits need practitioner and animator review.
- Feet can read close together at 192×108, especially under the padded Soter
  costume and during the Clog prototype.
- Shoulder, forearm, thigh, and knee twist/corrective deformation is basic;
  high arm poses and cross-body sweeps need anatomy review.
- Soter’s hood and belly mass can dominate the silhouette; the decorative tail
  is excluded from support but its secondary motion remains minimal.
- The three jump prototypes establish distinct systems, not an approved aerial
  library. Clog pullback articulation and every landing need half-speed review.
- The arm field is authored and bounded, but clap/pat/flourish coverage and
  collision-specific pose exclusions are still sparse.
- “Board & Bow” and the Foley mix need a human musical/audio-taste pass.
- WebGPU is not enabled; it intentionally falls back to WebGL2.
- Physical gamepad, lower-end Android/iOS, thermal, speaker latency, and
  accessibility-device review remain outstanding.

Gate waiting: **Gate 1 — live rig, performance controls, jumps, eight grounded
movements, twenty-four transitions, and both heroes.** Do not produce the full
Flatfoot pack until this gate passes human review.
