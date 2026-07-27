# Kaki Dance fun-overhaul forensic audit

Audit date: 2026-07-26  
Audited revision: `67992c6` (`main`, matching `origin/main`)  
Status: implementation checklist, not a quality claim

## What was actually run

- `npm run verify`: 103 JavaScript modules passed syntax checking and all 128
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
- The 30-second sustained-flow browser run completed all 120 expected
  left/right contacts while travelling and shaping the upper body, used every
  articulation and movement family, landed both jumps, entered In the Pocket
  and Cooking, spent no sampled time Scrambling, triggered no generic recovery
  fallbacks, held the stage to a zero-pixel vertical range, and rendered at
  1.4 ms p95 in headless WebGL2.

## Ruthless findings

### Gameplay and input

- [x] **Rewritten:** Shift, Control, and Z now implement the required
  brush/heel/toe modifiers without doubling as arm-isolation controls.
- [x] **Rewritten:** Q/E/F/T remain compatible contextual families while
  direct foot articulation remains available from Shift/Control/Z.
- [x] **Rewritten:** every shipping Appalachian keyboard action is saved and
  remappable; the required arrow-foot aliases remain available.
- [x] **Preserve:** key-down and key-up edges are timestamped, browser key
  repeat is ignored, focus loss clears held state, simultaneous feet are
  representable, and browser defaults are prevented while play has focus.
- [x] **Preserve:** gameplay/contact state advances at a deterministic 120 Hz
  independent of render cadence.
- [x] **Added:** fixed-step replay equivalence plus controller
  connect/disconnect/reconnect coverage.

### Dance and animation

- [x] **Preserve:** the live browser dancer uses the shared Blender biped GLB,
  paired anatomical legs and shoes, additive per-foot layers, authored contact
  frames, short transition ranking, persistent board-space travel, and a
  separate upper-body pose field.
- [x] **Preserve:** both exported feet use local +Y forward; 1,696 sampled
  foot/toe vectors pass the current forward-orientation threshold.
- [x] **Rewritten:** the lower body exposes preparation, swing, articulation
  contact, rebound, recovery, support, and airborne states plus direct single
  heel and single toe primitives.
- [x] **Added:** procedural pelvis compression, knee response, hip and torso
  counter-rotation, shoulder delay, head nod, and restrained wrist looseness.
- [x] **Added:** a performance-state controller (Cold, Settling In, In the
  Pocket, Cooking, Scrambling, Recovery) driven by recent timing, clarity,
  transitions, conflicts, and recoveries rather than raw button count.
- [x] **Strengthened:** multi-contact brushes count as one player action for
  density and independence, contact offsets cannot reorder the player's
  authoritative left/right action sequence, and a requested articulation can
  ride a compatible base-motion handoff instead of collapsing into generic
  recovery.
- [x] **Bounded:** travel steering and low-pivot accents share a single
  five-radian-per-second facing budget.
- [ ] **Inspect visually:** the automatic basis and drift checks pass, but
  aesthetics, knee arcs, costume intersections, and perceived weight still
  require full/half/quarter-speed human review for both heroes.

### Music, audio, and scoring

- [x] **Preserve:** tune playback, beat/measure/phrase state, UI timing,
  contact judgment, and sample scheduling share the Web Audio-backed clock.
- [x] **Preserve:** local shoe-on-wood samples have velocity layers,
  round-robin takes, articulation families, small left/right stereo separation,
  and bounded polyphony.
- [x] **Rewritten:** Free Frolic and Trade Licks are separate title choices,
  scoring contexts, state timelines, and player expectations.
- [x] **Added:** a visible rival performs the authored Trade Licks call while
  the compact phrase rail shows the left/right call pattern.
- [x] **Preserve:** scoring already rewards timing, call anchors, legal flow,
  articulation variety, travel, arm intent, landings, and resolutions, and
  applies density/repetition decay.
- [x] **Strengthened:** conflicts, density, foot independence, transition
  quality, and recovery feed the performance state so indiscriminate mashing
  looks and scores worse immediately.

### Camera, stage, and presentation

- [x] **Preserve:** stage geometry is stable, board flex is fixed at zero, the
  3D camera presets are fixed, and body/world/camera vertical movement are
  separate.
- [x] **Fixed:** the visible resonant-board footprint now covers the full
  projected travel depth, so the dancer does not appear to step behind it at
  the far board bound.
- [x] **Reduced:** ordinary contacts cannot visibly move the horizon at the
  new 12% default; camera position, body bounce, and stage geometry remain
  separate.
- [x] **Rewritten:** the title exposes only Free Frolic, Trade Licks, and Step
  Shed. Legacy breaking and rhythm-lane modes are unreachable.
- [x] **Rewritten:** the public utility bar contains only Frolic Lab and sound,
  and the mode copy describes one coherent Appalachian game.
- [x] **Rewritten:** the shipping HUD centers phrase position, live performance
  state, crowd response, and compact left/right contact feedback.

### Frolic Lab and development tooling

- [x] **Replaced:** `frolic-lab.html` routes to the canonical live-rig workbench.
- [x] **Preserve and promote:** `appalachian-simulator-review.html` already has
  the live rig, stable board, fixed cameras, skeleton, contacts, foot axes,
  support, center of mass, root trail, input buffers, layer weights, transition
  candidates, per-foot event/audio logs, slow motion, and frame stepping.
- [x] **Added:** 0.1× speed, bone names, explicit planted-lock state, music-clock
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
- [x] **Quarantined:** legacy break-dance simulations, move clips, HUD lane, and
  title modes should remain unreachable during this pass. They can be retained
  in source for the later expansion, but they must not influence Appalachian
  controls, scoring, tutorial, or presentation.
- [x] **Fixed QA ergonomics:** browser QA starts an isolated local server,
  reports each native/browser stage, and terminates reliably after aggregate
  smoke and latency runs.
- [x] **Added:** deterministic 30-second real-key endurance QA with contact,
  support, recovery, travel, arm, jump, facing, pelvis, stage, score, state,
  render-time, and planted-drift evidence plus three shipping captures.

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
