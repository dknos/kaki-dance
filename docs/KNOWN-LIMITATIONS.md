# Known limitations

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
