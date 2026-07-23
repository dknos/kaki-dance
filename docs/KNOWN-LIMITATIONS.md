# Known limitations

- The rescued heroes are code-drawn tapered volumes, not a finished modular
  sprite atlas. This keeps contacts exact and silhouettes editable, but some
  extreme foreshortening still has fewer bespoke drawings than a production
  atlas would provide.
- 6-Step is mechanically six-phase and contact-correct, yet its two most
  front-facing crossed positions can read flatter at quarter speed than the
  strongest side-thread keys.
- Windmill now uses shoulder/back rotation, a large leg scissor and a dedicated
  clip. The compact chibi head can still overlap the near shoulder during two
  intermediate drawings, especially on KittyKaki.
- Soder is fully bipedal, but the padded hood can briefly cover the far shoulder
  in deep floor poses. The Hero Lab z-order and skeleton overlays make this
  visible rather than masking it with effects.
- The shared Blender source is an anatomy/contact blockout with low-poly
  costume volumes, not a final character mesh or motion-capture solution.
- The shipped song is an original instrumental synthesis loop. The sparse
  Japanese female vocal version is a documented Suno production brief, not yet
  a mastered runtime asset.
- Power animation is fully interactive at the phase, direction, extension,
  contact, stamina, and freeze-exit level. The checked-in Blender proxy is a
  mechanical blockout, not a polished motion-capture rig or final character
  mesh; the runtime intentionally uses hand-authored 2D keys.
- Battle contains one AI opponent and alternating turns only. Local two-player,
  crews, ghosts, and online play are outside this slice.
- Results show a deterministic best-moment replay frame, while the in-round
  trail retains five recent poses. Replay export/import and a multi-shot
  cinematic viewer are next-stage work.
- Runtime crowd members are original code-authored profiles inspired by the
  supplied KemonoKaki collection direction. Collection-specific names and
  token art are not redistributed. The project owner should confirm any
  collection or character commercial-use rights before a commercial release.
- Automated performance is a desktop Chromium baseline. A lower-end physical
  Android pass is still required.
- Accessibility includes control remapping, timing windows, latency, reduced
  motion, shake, flash, beat pulse, labels, and volume controls, but there is no
  screen-reader narration of the continuously rendered dance.
- No new hero profile should be added until it passes the same fixed-length
  biped, planted-contact, silhouette and full move-sweep thresholds.
