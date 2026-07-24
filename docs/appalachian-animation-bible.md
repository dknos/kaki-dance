# Appalachian Frolic animation bible

## Candidate 1 product gate

The dancers are the product. Environment polish and automated checks cannot
excuse an unreadable hand, reversed arm, merged foot, centered unsupported
pelvis, planted-foot skate, or Soter losing the biped inside the costume.
Candidate 1 is Flatfoot-only and requires human approval before Buck or Clog
work resumes.

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

The candidate action catalog contains:

| Action | Frames at 30 fps | Purpose |
| --- | ---: | --- |
| `groove` | 31 | interruptible neutral musical base |
| `walkingStep` | 31 | alternating foundation step |
| `shuffle` | 16 | free-foot brush/shuffle |
| `heelToeChange` | 31 | readable heel and toe pivots |
| `backstep` | 16 | backward placement and support change |
| `chug` | 16 | compact strong weight transfer |
| `recovery` | 9 | short support correction |
| `turnaround` | 31 | cross, turn, and ending |

Actions are pose-to-pose keys in Blender. The source does not use the rejected
Pillow anchor library or sine-coordinate motion.

## Production source and atlas path

1. Canonical character sheets live in
   `docs/review/frolic-rescue-candidate-1/model-sheets/`. They are identity and
   proportion references, not unattended animation frames.
2. `tools/blender/build_appalachian_frolic_rig.py` builds the modeled,
   weighted characters, shared armature, controls, toon materials, stable
   three-quarter orthographic camera, and eight named 30 fps actions in
   `tools/blender/kaki-appalachian-frolic.blend`.
3. `tools/blender/render_appalachian_frolic_candidate.py` opens that scene and
   renders every actual action frame to transparent 512×512 RGBA.
4. `tools/art/build_frolic_blender_atlases.py` reduces each render to 128×128,
   applies one page-level 96-color palette without dithering, and packs 181
   frames per hero across two 1024² pages.
5. Runtime metadata records the Blender scene hash, camera, action, render
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

The animation controller now has an interruptible groove base, an atomic action
layer, and a phrase-intention layer. STEP, BRUSH, DRIVE, or LICK starts or
retargets the atomic action at the raw input time; no one- or two-beat clip
queue, transition bridge, hidden input counter, or generic squash may delay the
first action pose.

Contacts created at input are deduplicated from later action metadata. The
phrase layer may influence follow-through and recovery, but never buffer the
initial foot response.

## Mechanical checks versus approval

`npm run qa:frolic:motion` checks planted-foot world drift, support/center of
mass, heel/toe pivots, knee and elbow continuity, hand attachment, left/right
depth, silhouette separation, outfit volume, and loop compatibility.
`npm run qa:frolic:latency` measures real event timestamps through first changed
hero pixels. Both suites are regression gates only. They cannot approve
anatomy, weight, groove, musicality, or taste.
