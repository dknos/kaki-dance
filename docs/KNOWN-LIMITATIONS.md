# Known limitations

## Appalachian Frolic

- Simulator Gate 1 now runs a live Three.js `SkinnedMesh`/`AnimationMixer`
  character from the shared Blender-authored GLB. Flatfoot, Buck, and Clog are
  selectable and have distinct jump height/timing/contact profiles. The full
  Flatfoot, Buck, and Clog content packs are not produced or approved; Gate 1
  deliberately stops at eight grounded movement candidates, three jump
  prototypes, and twenty-four transition/recovery recipes.
- The live export includes 88 skinned mesh objects across KittyKaki and Soter,
  39 bones, and 13 actions on `KakiFrolicProductionBiped`. The shapes retain
  deliberately rounded, low-resolution proportions. Review captures still
  show close foot silhouettes, large glove/costume masses, simple shoulder and
  knee deformation, and motion that can read blocked rather than fully
  weighted. Corrective shapes/twist deformation remain incomplete.
- The contact root lock holds the reported planted foot under the 1 cm
  automated threshold in the forced-WebGL2 figure-eight smoke. This does not
  prove natural weight transfer: the transition release threshold and
  animation contact timing need half-speed dancer review.
- WebGL2 is the Gate 1 baseline. A requested WebGPU path is capability-gated
  back to WebGL2 until animation, capture, and performance parity are proven.
  This is a future-ready boundary, not a claim that WebGPU rendering ships.
- The atlas rescue remains available for old/new comparison and fallback.
  It is not the primary simulator dancer and is still Flatfoot-only.
- The public Flatfoot pixels now come from the modeled, weighted, and animated
  characters archived in
  `tools/blender/kaki-appalachian-frolic-atlas-candidate-1.blend`. The previous
  Pillow capsule renderer remains only as rejected-baseline/debug evidence.
  Aseprite and LibreSprite are not installed, so candidate 1 retains the
  palette-reduced toon render; manual hand, foot-contact, outline-crawl, and
  silhouette cleanup is still blocked.
- The 13 live actions are hand-keyed at 30 source fps and the persistent
  controller can retarget through the live transition solver. Motion QA checks
  plants, bounded travel, entry-frame search, jump states, anatomy limits, and
  layer independence, but it does not approve the dancing.
- The replacement foot kit contains 66 cuts derived from three retained CC0
  recordings of real shoes on wood/parquet. Each of eleven families has six
  distinct files split across soft, medium, and strong layers. Signal QA passes;
  whether each classification and the full mix convincingly read as
  shoe-on-board Foley remains a mandatory human audition.
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
- The slice is intentionally one solo 32-bar chorus, one tune, and one
  community-hall stage. Couple dance, square dance, team clogging, crews,
  additional tunes, and named archival unlockables remain outside scope.
- The current responsive mix reacts through the player-controlled foot
  instrument, crowd, board, and phrase cues. Per-stem band foregrounding is a
  documented next production step, not silently claimed as complete.
- Browser QA covers native rendering, keyboard, simulated gamepad mappings,
  real touch events, live/fallback paths, local-only assets, and desktop frame
  pacing. Candidate latency numbers come from headless Chromium; its virtual
  audio output latency is not a physical speaker result. A physical lower-end
  Android/iOS latency, haptics, thermal, and speaker-mix pass remains required.
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
