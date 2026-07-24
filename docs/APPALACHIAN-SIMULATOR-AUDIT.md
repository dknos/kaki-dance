# Appalachian simulator architecture audit

Status: **CANDIDATE — HUMAN REVIEW REQUIRED**

Audit date: 2026-07-24
Audited revision: `5431cdddaa32c7356cfeac1439fd31f8a450e989` (`main`, matching `origin/main`)
Deployment configuration: `.github/workflows/pages.yml` deploys the repository
root to GitHub Pages only after the Node test job passes. No deployment was
started for this work.

## Repository and baseline truth

The worktree was clean before the baseline QA commands ran. The baseline
candidate suite regenerated its own tracked timestamped reports and screenshots;
those generated changes are retained as evidence and are not unrelated source
edits.

Commands run before implementation:

- `npm run verify`
  - 85 JavaScript modules passed syntax checking.
  - 87 assertions across 13 Node test files passed.
- `npm run qa:frolic:candidate`
  - motion, Foley, browser, latency, review-page, and provenance-manifest QA
    completed without browser console or request failures;
  - the existing headless result measured 20.6 ms p95 from input to first
    changed atlas pixel;
  - automated approval remained explicitly false.

The repository already has a valuable foundation: deterministic 120 Hz game
simulation, actual shoe-on-board sample families, source-backed movement
metadata, both supplied heroes on one Blender biped, a qualified cultural
posture, a low-resolution stage, and a separate Measure Match simulation.
Those systems should be kept.

## Required-file findings

### `js/input.js`

`InputManager` exposes one two-axis vector as `x`/`y`. Gamepad polling reads
only axes 0 and 1. Axes 2 and 3, triggers, stick click, D-pad intent, jump
charge, separate arm modifiers, and body-line control are not represented.
There is one touch stick and four legacy action buttons. Keyboard arrows are
aliases for the same direction vector rather than an arm-expression field.

Result: both analog sticks and the requested simultaneous control channels do
not exist.

### `js/appalachian/animation-controller.js`

The controller is documented in its own source as an interruptible base plus
one “atomic” action. Every new action request replaces the active request at
the current tick. The snapshot contains a clip name, normalized phase,
support-foot labels, and a small one-dimensional `rootX`; it does not contain
world position, root velocity, facing velocity, center of mass, jump state,
upper-body layers, IK state, or a transition candidate.

Arm input cannot be layered because the controller has no upper-body state.
The current immediate retarget is responsive, but it is still clip
replacement, not a persistent physical performance.

### `js/appalachian/simulation.js`

Direction chooses one of a few variants and passes a label into the animation
controller. The simulation does not integrate travel through board space.
`requestMovement` always records an accepted input transition as
`legal: true`, independent of `FootworkTransitionGraph`. It does not model
jump compression, launch, air trajectory, landing intent, recovery balance, or
Dance Line banking. The five Step Shed lessons do not teach arms, independent
arms, hops, aerial selection, spatial turnaround, or line banking.

### `js/appalachian/transition-graph.js`

The graph has a useful authored-successor table and six named bridges, but it
is not on the live player-input handoff path. `resolve` checks coarse tags,
entry foot, a direction label, and a sixteenth-note boundary. It does not
search target entry frames or score pose, velocity, facing, angular velocity,
support phase, center of mass, level, or phrase suitability. No live solver
locks a planted foot during the bridge.

Result: a graph can validate data while the player runtime bypasses it.

### `js/appalachian/footwork-catalog.js`

The catalog contains fourteen source-bounded movement families and useful
contact metadata. The runtime presentation map nevertheless points every
hero/style combination at names which ultimately resolve through the same
small rendered atlas set. Move records omit the complete simulator contract:
entry/exit level, velocity, facing, angular momentum, entry-frame candidates,
cancel windows, arm-mask compatibility, jump/landing eligibility, and valid
successor weights.

The catalog qualifies Flatfoot, Buck, and Clog as gameplay profiles rather
than a universal taxonomy. That boundary is correct and should remain.

### `js/appalachian/phrase-judge.js`

The judge rewards timing, call response, legal transitions, articulation,
variety, restraint, motif return, and turnarounds. It has no travel trace,
Board Line, arm phrase, jump/landing quality, recovery, direction-change, or
banked Dance Line events. As a consequence it cannot yet explain through play
why spatial movement and personally shaped phrases are valuable.

### `js/render/frolic-atlas.js` and `js/render/renderer.js`

`FrolicAtlasLibrary` fetches `atlas.json` plus one or two PNG pages.
`KakiDanceRenderer.renderFrolic` draws one selected bitmap at a fixed screen
point plus `dancer.rootX`. No Three.js scene, `GLTFLoader`, `SkinnedMesh`,
`AnimationMixer`, live bone palette, or low-resolution 3D render target is
created. The current atlas path is suitable as fallback and old/new evidence,
not as the simulator's primary dancer.

### Blender source

`tools/blender/kaki-appalachian-frolic.blend` opens successfully in Blender
5.1.1 and contains:

- one `KakiFrolicProductionBiped` armature;
- 103 scene objects;
- weighted KittyKaki and Soter collections;
- paired legs, feet, arms, hands, visible limb joints, foot IK, knee poles,
  heel/ball/toe controls, and costume-only hood/tail controls;
- eight `FrolicCandidate.*` actions.

The current build manifest reports 40 weighted Kitty mesh objects and 48
weighted Soter mesh objects. Soter's tail is a costume control and not a
support contact. This is a viable source for a live export, but its present
actions are Flatfoot candidate blocks and do not yet constitute the requested
style jump pack or approval-quality library.

### Documentation and review package

`docs/appalachian-animation-bible.md`,
`docs/appalachian-sources.md`, `docs/MOVE-AUTHORING.md`, and
`docs/KNOWN-LIMITATIONS.md` correctly preserve shared-biped anatomy, provenance
boundaries, contact-first authoring, cultural qualification, and human-review
requirements. They also explicitly describe the current runtime as 2D and the
candidate as Flatfoot-only.

`docs/review/frolic-rescue-candidate-1/` is a strong atlas-rescue evidence
package, but it reviews the old 384×216 sprite runtime, not a live 3D
simulator. Its approval state remains unchanged.

## Verified shortcomings

| Requested check | Current truth |
| --- | --- |
| “3D-looking” dancer is rendered into PNG atlases | Verified. Blender is the source, but the browser fetches atlas JSON and PNG pages. |
| No live skeletal character | Verified. No Three.js, glTF loader, skinned-mesh runtime, or animation mixer is present. |
| Only left-stick axes are read | Verified. Gamepad axes 0/1 feed the sole direction vector. |
| No right-stick arm control | Verified. Axes 2/3 and an arm state are absent. |
| Direction selects or offsets canned movement | Verified. Direction chooses a small move variant and `rootX` offset. |
| Buck and Clog disabled | Verified in the title UI and `selectFrolicStyle`, which hard-codes Flatfoot. |
| Inputs replace atomic clips | Verified by the controller request path. |
| Transition graph does not control every handoff | Verified. The simulation does not instantiate or call it. |
| Cannot freely traverse the board | Verified. No persistent board/world position is integrated. |
| Insufficient visible personal style | Verified as a documented candidate limitation; the current runtime has no player-shaped arm layer. |
| Fun of moving and phrasing is not explained | Verified. Scoring has no spatial lines, arm phrase, jump/landing, or banked-line state. |

## Architecture decision

The simulator candidate will use the existing Blender biped as the
authoritative character and export source, export one self-contained shared
GLB containing both hero mesh sets on one skeleton, and render the selected
live skinned character with Three.js. The live
runtime will own:

- persistent board-space motion and facing;
- an `AnimationMixer` lower-body/action state above authored clips;
- a stable authored arm-pose field applied as a separate masked layer;
- separate left/right arm overrides and a body-line additive;
- charged, style-specific authored hops with deterministic air/landing state;
- contact-aware candidate selection, short inertial handoffs, one bounded
  request buffer, recovery fallback, and contact-driven Foley events;
- diagnostics needed to review bones, contacts, support, center of mass, root
  trail, layer weights, and transition scores.

The low-resolution Canvas stage and atlas renderer remain available as fallback
and comparison. Measure Match stays on its existing renderer/simulation path.
WebGL2 is the candidate baseline. A WebGPU path may be attempted only behind
capability detection and may not delay or destabilize the dancer.

## Honest Gate 1 boundary

The implementation gate can prove live rig loading, control plumbing,
deterministic travel/jump state, layer separation, eight grounded candidate
families, three distinct jump prototypes, twenty-four resolved transition or
recovery records, both heroes, contact Foley scheduling, and a complete
thirty-second test line.

It cannot approve dance weight, personality, cultural accuracy, animation
appeal, footwear taste, or whether the controls are fun. Those remain explicit
human reviews. No later movement pack should be mass-produced from this
candidate before that review.
