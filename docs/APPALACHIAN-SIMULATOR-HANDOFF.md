# Appalachian two-foot instrument Gate 2 handoff

**CANDIDATE — HUMAN REVIEW REQUIRED**

No deployment, push, merge, or pull request was performed.

## Outcome

Appalachian Frolic now plays as a two-foot performance instrument:

- Left/Right Arrow are independent anatomical foot edges with separate
  deterministic buffers and no operating-system repeat.
- Q/E/F/T specialize the same gesture inside a 72 ms intent window, in either
  key order, without adding a duplicate default tap.
- WASD travel, persistent authored arm height, arm isolation, modifiers,
  footwork, turns, and charged style hops coexist without restarting one
  another.
- Free Frolic and Trade Licks / Measure Echo reward timing, phrase fit, foot
  clarity, flow, use of space, personal style, and landing/resolution.

## Root causes and rig repair

The “both feet face screen-right” defect originated in the authoritative
Blender rig. Both deform feet inherited the shin IK pole rotation, twisting
their evaluated forward axes about 90 degrees even though their edit-bone rest
tails were nominally forward. The glTF exporter and runtime camera faithfully
showed that broken pose; it was not a Three.js basis-conversion defect.

The shared source rig now:

- keeps connected ankle positions but disables inherited shin rotation on
  `foot.L` and `foot.R`;
- declares local +Y as foot/toe forward and applies explicit zero bone roll;
- builds the anatomical right shoe from reflected vertices with reversed face
  winding and positive applied transforms;
- validates shoe transforms, faces, normals, weights, and both heroes before
  export;
- samples foot/toe forward on every frame of all 23 actions.

Blender validated 1,696 vectors at minimum dot 0.939. The live exported GLB
validated 1,696 vectors at minimum dot 0.941 against a 0.78 threshold. Only the
two authored low-pivot frame-4 poses opt out, with reasons in action metadata.

## Controls

| Purpose | Keyboard | Gamepad |
| --- | --- | --- |
| Travel | WASD | Left stick |
| Left/right foot | Left/Right Arrow | D-pad left/right |
| Both arms | Up/Down | Right stick |
| Isolate arms | Shift+Up/Down left, Ctrl+Up/Down right | LB/RB |
| Brush / shuffle | Q | X |
| Heel-toe / articulation | E | Y |
| Drive / backstep / chug | F | B |
| Turn / phrase ending | T, with A/D direction | R3 |
| Grounded / committed | Ctrl / Shift | LT/RT |
| Charge/release hop | Space | A |
| Pause | Escape/P | Start |

Touch exposes travel and arm sticks, both feet, Q/E/F/T, jump, both arm
isolates, and both movement modifiers. Z/X/C remain unadvertised compatibility
bindings.

## Animation and gameplay work

- Added paired Blender actions for basic pulse, brush-return, heel-toe,
  backstep/chug, and low pivot: ten new actions, twenty runtime side-masked
  additive layers.
- Added per-foot phase, articulation, contact, queue, support, weight,
  anticipation, attack, recover, and authored Foley state.
- All live gesture requests use the existing transition graph and record a
  resolved support/contact/entry-phase/facing/style handoff.
- Supporting-foot gestures insert a visible short weight transfer; grounded
  state never reports both feet unsupported.
- Arms persist after release, use spring-smoothed authored pose samples, retain
  style-specific range, and do not replace foot or travel state.
- Contact sound moved to authored contact events. The retained local
  shoe-on-wood families still use velocity layers and round robin.

This is deliberately the smallest approval deck. Double Shuffle, Double
Backstep, Drag-Slide, Double Step, Triple Step, Cross-step, and advanced Clog
aerials remain unapproved.

## Changed areas

- Rig/export: `tools/blender/build_appalachian_frolic_rig.py`,
  `tools/blender/export_appalachian_simulator_glb.py`, the `.blend`, production
  JSON, GLB, and simulator manifest.
- Instrument state: `js/appalachian/performance-intent.js`,
  `foot-gesture-deck.js`, `animation-controller.js`, `simulation.js`,
  `transition-graph.js`, and `phrase-judge.js`.
- Input/application: `js/input.js`, `js/game.js`, `index.html`, and
  `styles.css`.
- Live review: `js/render/appalachian-three-renderer.js`, `renderer.js`,
  `hud.js`, the review HTML/JS, browser QA, captures, and reports.
- Tests/docs: the Appalachian test suites, README, animation bible, known
  limitations, and this handoff.

## QA evidence

- `npm run verify`: 115 tests pass.
- Blender source validation: 23 actions, 1,696 sampled vectors, minimum 0.939.
- Exported-runtime validation: 23 actions, 1,696 sampled vectors, minimum
  0.941, no failed action.
- Forced-WebGL2 smoke: 88 skinned meshes, 39 bones, 23 actions, 20 foot-layer
  actions, no console/request failures.
- Figure-eight planted-foot drift: below 1 cm.
- Rapid input: 32 alternating edges at 16 edges/second retained in order.
- Headless Chromium p95: input-to-simulation 0.2 ms; first changed dancer pixel
  18.8 ms; contact-to-Web-Audio scheduling call 0.4 ms.
- Physical speaker latency is not claimed from headless Chromium.

Before/after evidence:

- [before foot repair](review/appalachian-instrument-gate-2/captures/before-foot-basis-repair.png)
- [after foot repair](review/appalachian-instrument-gate-2/captures/after-foot-basis-repair.png)
- [front/side/gameplay pose set](review/appalachian-instrument-gate-2/captures/)
- [browser reports](review/appalachian-instrument-gate-2/reports/)

## Human review still required

- Appalachian practitioner review across personal/regional variation.
- Full-, half-, quarter-speed and frame-by-frame weight, knee, ankle, arm,
  costume, contact, and landing review for both heroes.
- Human audition of every Foley cut and the full board/tune/crowd mix.
- Keyboard feel approval before physical gamepad/touch approval.
- Physical controller, lower-end phone, haptics, thermal, accessibility-device,
  and speaker-latency testing.

## Play and review locally

Terminal A:

```bash
cd /home/nemoclaw/kaki-dance
npm install
npm run serve
```

Terminal B, while the local server is running:

```bash
cd /home/nemoclaw/kaki-dance
npm run rig:frolic:build
npm run rig:frolic:export
npm run verify
npm run qa:appalachian-sim
npm run qa:appalachian-sim:latency
npm run qa:appalachian-sim:capture
```

- Game: <http://127.0.0.1:4177/>
- Workbench: <http://127.0.0.1:4177/appalachian-simulator-review.html>
- Forced WebGL2: <http://127.0.0.1:4177/appalachian-simulator-review.html?renderer=webgl2>
- WebGPU capability gate: <http://127.0.0.1:4177/appalachian-simulator-review.html?renderer=webgpu>

The workbench includes skeleton/bone axes, anatomical L/R, foot/toe forward
arrows, support/contact, center of mass, root trail, per-foot buffers,
modifier/chord state, transition candidates, input/contact timelines, camera
presets, slow motion, and frame stepping.
