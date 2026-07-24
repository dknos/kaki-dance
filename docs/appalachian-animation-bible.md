# Appalachian Frolic animation bible

## Two-foot instrument Gate 2

Status: **CANDIDATE — HUMAN REVIEW REQUIRED**

The primary dancer is now the live shared
`KakiFrolicProductionBiped` exported to
`assets/models/appalachian/kaki-appalachian-simulator.glb`. Three.js loads 88
skinned mesh objects, 39 bones, and 23 authored actions. KittyKaki and Soter
switch mesh visibility without changing skeleton or animation compatibility.
The atlas rescue remains a comparison/fallback path.

Gate 2 exports 23 actions: the original thirteen candidates plus paired
left/right pulse, brush-return, heel-toe, backstep/chug, and low-pivot
gestures. Runtime builds twenty side-masked additive foot actions over
continuous travel/groove. It retains three style-specific jump prototypes,
nine authored arm-field poses, and twenty-four handoff/recovery recipes. It
stops before full pack production and cannot be approved by tests.

## Atlas rescue candidate 1 product gate

The dancers are the product. Environment polish and automated checks cannot
excuse an unreadable hand, reversed arm, merged foot, centered unsupported
pelvis, planted-foot skate, or Soter losing the biped inside the costume.
The archived atlas rescue is Flatfoot-only. Buck or Clog atlas mass-production
does not resume from it.

## Canonical anatomy

KittyKaki and Soter use the same weighted
`KakiFrolicProductionBiped` armature:

- root, pelvis, spine, chest, neck, and head;
- paired clavicles, upper arms, forearms, wrists, and hands;
- paired thighs, shins, feet, and toes;
- paired foot IK, knee poles, heel pivots, ball pivots, and toe pivots;
- separate Soter hood and decorative-tail controls.

Soter is KittyKaki inside a padded snake kigurumi. The hood, padded torso, and
tail layer over the complete shoulders, elbows, hips, knees, hands, and feet.
The tail is never a support contact.

## Flatfoot movement language

- low, grounded pelvis and relaxed knees;
- small vertical range and feet kept close to the board;
- the pelvis travels toward the supporting foot;
- shoulders and relaxed arms counterbalance the hips;
- near and far limbs keep separate values and silhouettes;
- heel lifts pivot around the toe and toe lifts pivot around the heel;
- planted feet remain fixed until their declared departure;
- contact compression is localized instead of bouncing the whole body;
- head and costume settle after the stronger movement.

The shared live action catalog contains:

| Action | Frames at 30 fps | Purpose |
| --- | ---: | --- |
| `groove` | 31 | interruptible neutral musical base |
| `walkingStep` | 31 | alternating foundation step |
| `slidingWalk` | 31 | low forward/back travelling prototype |
| `shuffle` | 16 | free-foot brush/shuffle |
| `heelToeChange` | 31 | readable heel and toe pivots |
| `backstep` | 16 | backward placement and support change |
| `chug` | 16 | compact strong weight transfer |
| `rockStep` | 16 | grounded weight exchange |
| `flatfootHop` | 16 | compact weight-release hop |
| `buckSpringHop` | 20 | ball-of-foot spring prototype |
| `clogJumpPullback` | 24 | projected pullback/landing prototype |
| `recovery` | 9 | short support correction |
| `turnaround` | 31 | cross, turn, and ending |
| `gesturePulseLeft/Right` | 11 | independent compact pulse |
| `gestureBrushLeft/Right` | 13 | independent brush and return |
| `gestureHeelToeLeft/Right` | 14 | independent heel/toe articulation |
| `gestureBackstepLeft/Right` | 15 | independent backstep/chug transfer |
| `gesturePivotLeft/Right` | 16 | independent low-pivot ending |

Actions are pose-to-pose keys in Blender. The source does not use the rejected
Pillow anchor library or sine-coordinate motion.

## Production source and runtime paths

1. Canonical character sheets live in
   `docs/review/frolic-rescue-candidate-1/model-sheets/`. They are identity and
   proportion references, not unattended animation frames.
2. `tools/blender/build_appalachian_frolic_rig.py` builds the modeled,
   weighted characters, shared armature, controls, toon materials, stable
   three-quarter orthographic camera, and twenty-three named 30 fps actions in
   `tools/blender/kaki-appalachian-frolic.blend`.
3. `tools/blender/export_appalachian_simulator_glb.py` exports both hero mesh
   sets, the shared skeleton, actions, contacts, support exclusions, and nine
   arm-field poses into the live GLB/manifest.
4. `tools/blender/render_appalachian_frolic_candidate.py` opens the archived
   atlas scene and
   renders every actual action frame to transparent 512×512 RGBA.
5. `tools/art/build_frolic_blender_atlases.py` reduces each render to 128×128,
   applies one page-level 96-color palette without dithering, and packs 181
   frames per hero across two 1024² pages.
6. Runtime metadata records the Blender scene hash, camera, action, render
   settings, cleanup revision, atlas revision, exact contacts, support state,
   and center of mass.

The public Flatfoot sprite is the actual Blender render. The Pillow capsule
renderer survives only in the preserved rejected baseline and debug tooling.

## Cleanup truth

The Blender render is not automatically approved pixel art. Aseprite and
LibreSprite are not installed in this workspace, so candidate 1 is labelled
`candidate-1-unretouched-toon`; specialist manual cleanup of hands, contact
keys, outline crawl, and any merged silhouettes remains blocked. It is
incorrect to call the palette conversion “authored cleanup.”

Every frame has been exposed through native 384×216 stills, 4× stills,
neutral-background strips, normal/half-speed loops, skeleton/contact overlays,
and rejected/candidate comparisons. Current visible weaknesses are recorded in
the review package and must not be waived by green motion tests.

## Responsive runtime contract

The animation controller persists board position/velocity, facing/angular
velocity, support, weight distribution, center of mass, separate left/right
foot phase/contact/articulation/queues, active family, arm height/openness and
overrides, body line, jump state, phrase phase, recent metrics, and recovery
state.

A foot edge creates visible anticipation immediately. The deterministic intent
buffer holds specialization for 72 ms; Q/E/F/T arriving in either order
coalesce into the same request. Every resolved request passes through the
transition graph, then drives one anatomical foot layer with an authored
weight-transfer, contact, and recovery envelope. Authored contact metadata—not
keydown—triggers footwear audio.

WASD locomotion, left/right foot layers, contact-aware weight transfer,
counterbalance, persistent player arm pose, body line, and style-specific
aerials are independent. Arm or travel changes never replace or restart a foot
layer.

## Foot basis contract

`foot.L`, `foot.R`, `toe.L`, and `toe.R` declare local +Y forward. Blender
forward is global -Y; exported glTF dancer forward is +Z. Feet stay connected
at the ankle without inheriting shin IK pole rotation. The right shoe is true
mirrored topology—reflected vertices and reversed winding—with positive
transforms.

Every action/frame samples both foot and toe vectors. Ordinary frames must
remain at or above a 0.78 planar dot with dancer forward. Any pivot/cross/turn
exception must be action metadata with a frame and reason. Gate 2 contains only
two such exceptions: frame 4 in each paired low pivot.

## Mechanical checks versus approval

`npm run qa:frolic:motion` checks planted-foot world drift, support/center of
mass, heel/toe pivots, knee and elbow continuity, hand attachment, left/right
depth, silhouette separation, outfit volume, and loop compatibility.
`npm run qa:frolic:latency` measures real event timestamps through simulation,
first changed hero pixels, authored contact emission, and Web Audio scheduling.
Both suites are regression gates only. They cannot approve
anatomy, weight, groove, musicality, or taste.
