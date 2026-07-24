# Known limitations

## Appalachian Frolic

- Simulator Gate 2 runs a live Three.js `SkinnedMesh`/`AnimationMixer` from the
  shared Blender-authored GLB. It contains 88 skinned mesh objects, 39 bones,
  23 actions, and 20 side-masked foot-layer actions for KittyKaki and Soter.
- The release-blocking foot defect was repaired in the source rig. Foot/toe
  bones now use explicit local +Y forward, do not inherit the shin IK pole
  twist, and the right shoe is mirrored with reflected vertices and reversed
  winding under positive transforms. Blender sampled 1,696 action/bone vectors
  at a minimum dot of 0.939; the exported GLB sampled the same 1,696 vectors at
  0.941 against the 0.78 threshold. Two pivot frames are explicit metadata
  opt-outs.
- The current approval deck is intentionally small: paired basic pulse,
  brush-return, heel-toe, backstep/chug, and low-pivot gestures plus the
  existing style-specific hop/landing prototypes. Double Shuffle, Double
  Backstep, Drag-Slide, Double Step, Triple Step, Cross-step, and advanced Clog
  aerials remain unapproved; they were not mass-produced to satisfy a count.
- The contact root lock remains below the 1 cm automated threshold in the
  forced-WebGL2 figure-eight smoke. This does not prove natural weight:
  support transfers, close foot silhouettes, pelvis timing, and recoveries
  still need full-, half-, quarter-speed, and frame-by-frame dancer review.
- The independent-foot grammar, persistent arms, WASD travel, gamepad parity,
  touch controls, and deterministic 120 Hz replay are automated. Keyboard is
  the feel gate; physical gamepad and touch approval still follows it.
- WebGL2 is the Gate 2 baseline. A requested WebGPU path is capability-gated
  back to WebGL2 until animation, capture, and performance parity are proven.
  This is a future-ready boundary, not a claim that WebGPU rendering ships.
- The atlas rescue remains available for old/new comparison and fallback.
  It is not the primary simulator dancer and is still Flatfoot-only.
- The 23 live actions are hand-keyed at 30 source fps. Motion QA checks plants,
  bounded travel, entry-frame search, support state, action foot basis, jump
  states, anatomy limits, and layer independence, but cannot approve the
  dancing. Corrective shoulder/thigh twist shapes remain incomplete.
- The replacement foot kit contains 66 cuts derived from three retained CC0
  recordings of real shoes on wood/parquet. Each of eleven families has six
  distinct files across soft, medium, and strong layers. Contacts now schedule
  from authored contact metadata rather than primary keydown. Signal,
  provenance, family, velocity, and round-robin QA pass; a qualified human
  must still listen to every cut and approve “shoe on this board.”
- “Board & Bow” remains the earlier deterministic code-synthesized tune at the
  exact 120 BPM, 32-bar AABB map. It was not allowed to displace the hero,
  response, and foot-kit rescue. Its acoustic realism is not approved and is
  still an audible candidate weakness.
- The hall, dance board, band, crowd, lighting, floor, and HUD received only the
  readability pass needed to separate both feet. Figures and instruments remain
  deliberately simple authored pixel art rather than a complete environment
  polish pass.
- The three named styles are deliberately qualified gameplay profiles, not an
  authoritative taxonomy. Movement names, distinctions, contextual notes, and
  stage framing still require review by Appalachian percussive dancers from
  more than one community.
- Free Frolic and the embedded Trade Licks / Measure Echo activity share one
  solo 32-bar chorus, one tune, and one community-hall stage. Calls encode
  timing/emphasis/subdivision rather than a required animation. Additional
  tunes, partner/team forms, and named archival unlockables remain outside
  scope.
- The current responsive mix reacts through the player-controlled foot
  instrument, crowd, board, and phrase cues. Per-stem band foregrounding is a
  documented next production step, not silently claimed as complete.
- Browser QA covers native rendering, keyboard, simulated gamepad mappings,
  real touch events, live/fallback paths, local-only assets, and desktop frame
  pacing. Headless Chromium measured input-to-simulation p95 0.2 ms,
  input-to-first-changed-pixel p95 21.9 ms, and contact-to-Web-Audio-call p95
  0.4 ms. These are browser scheduling results, not physical speaker latency.
  Lower-end Android/iOS latency, haptics, thermal, and speaker-mix review
  remain required.
- Cultural-history PDFs supplied with the brief were not copied into the
  repository. The development provenance document uses their public review
  records and the cited practitioner/heritage sources.

## Measure Match and shared application

- The authored atlas is a complete playable visual slice, but final artistic
  approval remains a separate human gate. Automated anchors, contacts and
  geometry cannot certify that a paused drawing feels like finished character
  art.
- Aseprite and LibreSprite are not installed in this workspace. The checked-in
  cleanup/export pass is a deterministic Pillow-based equivalent with authored
  poses, hard palette edges, outlines, trimming, padding and extrusion. A
  specialist pixel artist may still request local silhouette or facial edits.
- Soder's soft tail remains behind the biped and never appears in semantic
  contacts. In several windmill keys it approaches the rear-leg silhouette and
  deserves particular reviewer attention at quarter speed.
- Atlas metadata is intentionally explicit and therefore large: about 729 KB
  per hero. Normal gameplay lazily loads one selected hero at about 0.80 MB
  compressed and 8 MiB decoded texture memory. Metadata compaction is deferred
  until visual approval.
- The hidden semantic rig and atlas share normalized phase and declared
  contacts, but the atlas is not reconstructed from the rig at runtime.
  Changing a clip requires regenerating both its atlas metadata and approval
  sheets.
- The complete 25-move catalog remains in experimental Freestyle/Cypher logic
  for compatibility. Public presentation maps it onto the nine authored MVP
  clips; those modes are intentionally not the milestone's quality bar.
- The generated Blender armature and costume volumes are orthographic mechanics
  and camera-depth references, not final production meshes or motion capture.
- The original track is a local synthesized instrumental. The optional vocal
  concept remains a production brief rather than a mastered runtime asset.
- Automated performance is a desktop headless-Chromium baseline. The responsive
  landscape touch layout is tested, but a lower-end physical Android frame
  pacing and thermal pass is still required.
- Accessibility includes remapping, timing windows, latency, reduced motion,
  shake, flash, beat pulse, labels and volumes. The continuously rendered dance
  has no screen-reader narration.
- Freestyle/Cypher still contain one AI opponent, alternating turns and legacy
  result categories. Local multiplayer, crews, ghosts and online play remain
  outside this slice.
