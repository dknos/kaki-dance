# Appalachian Frolic animation bible

## Product gate

The dancers are the product. Environment polish cannot excuse an unreadable
hand, reversed arm, merged foot, centered unsupported pelvis, planted-foot
skate, or Soder losing the human biped inside the costume.

Both heroes use the same full topology:

- root, pelvis, lower and upper spine, neck, head;
- paired clavicles, upper arms, forearms, wrists, and hands;
- paired thighs, knees, shins, ankles, heels, toes, and foot IK;
- paired knee poles;
- non-contact-bearing Soder hood and fabric controls.

Anatomical left/right is stable even when the sprite is mirrored. Soder’s hood
and padded tail are costume fabric attached to the shared anatomy, never a
coil-body solver.

## Profile pose languages

### Flatfoot

- pelvis low, knees continuously responsive;
- small vertical range and close-to-board foot trajectories;
- smoother lateral/root travel;
- heels, toes, drags, and brushes stay visually distinct;
- quiet arms counterbalance the pelvis;
- holds and lower density are positive animation choices.

### Buck

- more elastic foot spring and ball-of-foot emphasis;
- brighter syncopated recoil below the knee;
- scissor/cross paths use independent depth for each leg;
- torso remains restrained while arms answer sharper weight shifts.

### Clog

- higher knee paths and clearer projected silhouettes;
- repeated double/triple patterns have decisive recoil;
- optional tap heel/toe pixels identify the shoe profile;
- turns and final poses project farther without becoming weightless.

Speed, bounce, color, and volume are not the style system. Each pack has its
own anchors, pelvis height, lift, arm counterbalance, shoe treatment, contact
timing, and sound mapping.

## Contact rules

- A declared plant remains fixed in board space. Current generated result:
  `0.000 px` worst displacement across all six packs.
- Heel lift pivots around a fixed toe; toe lift pivots around a fixed heel.
- Sliding and dragging frames are explicitly non-planted until they settle.
- The pelvis moves toward the supporting leg.
- Crossing toes remain separated by the silhouette lint; the build has zero
  merge warnings.
- A joint may not jump more than 16 source pixels between frames. The current
  worst case is below 12 px.
- Every percussive catalog contact maps to an atlas accent phase and local
  sample family.

## Source and cleanup pipeline

1. `tools/art/appalachian_pose_library.py` authors independent biped anchors,
   support truth, center of mass, segment depth, contacts, and style mechanics.
2. `tools/blender/build_appalachian_frolic_rig.py` deterministically creates
   `KakiFrolicSharedBiped`, 30 bones/controls, KittyKaki and Soder costume
   proxies, three 24 fps actions, a 384×216 orthographic camera, and a JSON
   review export.
3. `tools/art/build_appalachian_atlases.py` performs the deliberate pixel
   cleanup pass: stable volume, hard edges, one/two-pixel outlines, separate
   limbs and joints, directional shoes, style shoe details, camera-space
   occlusion, trimming, extrusion, indexed packing, and lint.
4. Runtime loads one selected hero/profile 1024² indexed atlas. Animation is
   sampled at 60 Hz from audio-clock phase while source drawings use purposeful
   12–16 fps holds.

Blender proxy meshes are mechanics and occlusion proof, not public art.
Generated pixels are not approved by mere frame completeness; native stills,
4× nearest boards, diagnostic overlays, and six loops are the approval media.

## Approval poses

Every hero/profile board contains neutral, foundation walk, shuffle, backstep,
chug, heel-toe change, drag-slide, crisscross, turnaround, and controlled
ending. The capture set contains actual-stage native and 4× boards,
split-contrast neutral native and 4× boards, and diagnostic boards. Diagnostic
versions mark:

- anatomical left skeleton in mint;
- anatomical right skeleton in orange;
- contact boxes in amber;
- center of mass in chalk;
- support-foot label.

The Footwork Lab adds actual-stage, neutral-contrast, transition, root trail,
atlas-page, and world-coordinate inspection.
