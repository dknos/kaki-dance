# Kaki Dance fun-overhaul forensic audit

Audit date: 2026-07-26  
Audited revision: `67992c6` (`main`, matching `origin/main`)  
Status: implementation checklist, not a quality claim

## What was actually run

- `npm run verify`: 102 JavaScript modules passed syntax checking and all 115
  deterministic assertions passed.
- Local forced-WebGL2 browser smoke: passed with no console or request errors.
- Public Pages forced-WebGL2 browser smoke: passed with no console or request
  errors.
- Keyboard capture exercised simultaneous travel, arms, an anatomical foot, and
  a movement-family chord.
- Emulated standard-gamepad capture exercised both sticks, D-pad foot input,
  a face-button family, and a bumper modifier. A physical controller remains a
  required human QA item.
- Current measured browser facts: 120 Hz fixed simulation, 17.4 ms p95
  foot-input-to-visible-response in headless Chromium, 1.5 ms live-rig render
  p95 at the internal 192×108 target, 88 skinned meshes, 39 bones, 23 actions,
  20 independent foot-layer actions, and no measurable planted-foot drift in
  the automated figure-eight.

## Ruthless findings

### Gameplay and input

- [ ] **Rewrite:** Shift, Control, and Z do not implement the required
  brush/heel/toe modifiers. They currently double as older “ground/commit” and
  arm-isolation controls.
- [ ] **Rewrite:** Q/E/F/T currently specialize a pending foot edge. They need
  to act as contextual movement families while direct foot articulation remains
  available from Shift/Control/Z.
- [ ] **Rewrite:** only WASD is meaningfully exposed as remappable in the
  shipping controls. Every Appalachian keyboard action needs a saved binding.
- [x] **Preserve:** key-down and key-up edges are timestamped, browser key
  repeat is ignored, focus loss clears held state, simultaneous feet are
  representable, and browser defaults are prevented while play has focus.
- [x] **Preserve:** gameplay/contact state advances at a deterministic 120 Hz
  independent of render cadence.
- [ ] **Add:** explicit 30/60/120/144 Hz replay-equivalence tests and a
  connect/disconnect gamepad test.

### Dance and animation

- [x] **Preserve:** the live browser dancer uses the shared Blender biped GLB,
  paired anatomical legs and shoes, additive per-foot layers, authored contact
  frames, short transition ranking, persistent board-space travel, and a
  separate upper-body pose field.
- [x] **Preserve:** both exported feet use local +Y forward; 1,696 sampled
  foot/toe vectors pass the current forward-orientation threshold.
- [ ] **Rewrite:** the lower body owns contact phases, but the runtime does not
  yet expose a complete preparation/contact/rebound/recovery state vocabulary
  or direct single heel and single toe primitives.
- [ ] **Add:** procedural pelvis compression, ankle/knee response, hip and torso
  counter-rotation, shoulder delay, head nod, and restrained wrist looseness.
  The current live layer depends too heavily on authored clip motion for weight.
- [ ] **Add:** a performance-state controller (Cold, Settling In, In the
  Pocket, Cooking, Scrambling, Recovery) driven by recent timing, clarity,
  transitions, conflicts, and recoveries rather than raw button count.
- [ ] **Inspect visually:** the automatic basis and drift checks pass, but
  aesthetics, knee arcs, costume intersections, and perceived weight still
  require full/half/quarter-speed human review for both heroes.

### Music, audio, and scoring

- [x] **Preserve:** tune playback, beat/measure/phrase state, UI timing,
  contact judgment, and sample scheduling share the Web Audio-backed clock.
- [x] **Preserve:** local shoe-on-wood samples have velocity layers,
  round-robin takes, articulation families, small left/right stereo separation,
  and bounded polyphony.
- [ ] **Rewrite:** Free Frolic and call-and-response are currently interleaved
  in one 32-bar mode. They must become two clear choices with different player
  expectations.
- [ ] **Add:** a visible opponent performance in Trade Licks. The current call
  is audible but not performed by a rival dancer.
- [x] **Preserve:** scoring already rewards timing, call anchors, legal flow,
  articulation variety, travel, arm intent, landings, and resolutions, and
  applies density/repetition decay.
- [ ] **Strengthen:** simultaneous conflicts and unstable recovery need to feed
  both the performance state and the score so indiscriminate mashing looks and
  scores worse immediately.

### Camera, stage, and presentation

- [x] **Preserve:** stage geometry is stable, board flex is fixed at zero, the
  3D camera presets are fixed, and body/world/camera vertical movement are
  separate.
- [ ] **Reduce:** ordinary contacts still feed a small camera punch and the
  default screen-shake setting is 70%. Ordinary footwork should not shake the
  horizon.
- [ ] **Rewrite:** the title screen advertises Measure Match, Echo Practice,
  Freestyle, and Cypher Battle. The latter modes expose the old breaking and
  rhythm-lane systems during an Appalachian-only pass.
- [ ] **Rewrite:** the permanent utility bar and mode copy make the public build
  read as a development collection rather than one polished dance game.
- [ ] **Rewrite:** the shipping HUD names the current move and “restraint”
  instead of centering phrase position, performance state, crowd energy, and
  compact left/right contact feedback.

### Frolic Lab and development tooling

- [ ] **Replace:** `frolic-lab.html` is an atlas-era clip browser, not the
  requested isolated live-rig workbench.
- [x] **Preserve and promote:** `appalachian-simulator-review.html` already has
  the live rig, stable board, fixed cameras, skeleton, contacts, foot axes,
  support, center of mass, root trail, input buffers, layer weights, transition
  candidates, per-foot event/audio logs, slow motion, and frame stepping.
- [ ] **Add:** 0.1× speed, bone names, explicit planted-lock state, music-clock
  readout, recording/replay controls, free camera, and deterministic named
  patterns for alternating eighths/sixteenths, L-L-R syncopation,
  brush-step-step, toe-heel-toe, double stomp, travel/turn while tapping, and
  jump-to-beat-one landing.

### Architecture and performance

- [x] **Preserve:** vanilla ES modules, static Pages paths, local assets,
  Canvas 2D stage, live Three.js character, WebGL2 fallback, native Node tests,
  and lazy mode loading.
- [ ] **Optimize later:** the GLB is about 1.4 MB but renders as 88 skinned
  meshes. After feel is approved, merge compatible costume/body materials and
  meshes to reduce draw calls without losing hero selection.
- [ ] **Quarantine:** legacy break-dance simulations, move clips, HUD lane, and
  title modes should remain unreachable during this pass. They can be retained
  in source for the later expansion, but they must not influence Appalachian
  controls, scoring, tutorial, or presentation.
- [ ] **Fix QA ergonomics:** the aggregate browser suite can outlive a short
  wrapper without surfacing progress. Individual browser commands pass, but
  the aggregate script needs clearer stage logging and reliable completion.

## Implementation order from this audit

1. Promote the live simulator review into the canonical Frolic Lab and add the
   missing deterministic tools.
2. Correct the exact keyboard/controller articulation contract and remapping;
   prove rapid and simultaneous contact sequences.
3. Add body dynamics and performance states; use them in animation, scoring,
   crowd response, and the compact HUD.
4. Separate Free Frolic and Trade Licks and give Trade Licks a visible rival.
5. Remove legacy modes and lab clutter from the public surface, reduce camera
   motion, teach the seven required lessons, and only then polish the hall.
6. Re-run deterministic, browser, live Pages, low-FPS, and save-migration QA;
   capture both heroes at normal and slow speed before deployment.
