# Offline shared-biped reference pipeline

This tool builds one constrained plush biped armature and attaches both hero
profiles to it:

- KittyKaki: athletic hoodie body, pale paws, directional shoes, ears and tail.
- Soder: the same arms, legs and joints inside a padded green snake kigurumi.

There is no alternate Soder anatomy. His costume tail is a secondary attachment
to the shared pelvis and is never a support limb.

Run from the repository root:

```bash
blender --background --factory-startup \
  --python tools/blender/build_kaki_proxy.py -- \
  --output tools/blender/kaki-hero-biped.blend
```

Outputs:

- `kaki-hero-biped.blend` — the shared armature, both costume profiles, local
  joint constraints, contact markers, orthographic cameras and six labeled
  golden-chain blocks at 24 fps.
- `exports/kaki-hero-golden-chain.json` — deterministic root, torso, arm, hand,
  leg, foot and attachment keypoints at five phases per move, with contact
  metadata and measured bone lengths.
- `reference/hero-rescue/` — 384×216 color and silhouette passes for both
  profiles, plus front, three-quarter and mirrored turnarounds.

The blocks establish anatomy, contact order and large movement arcs. They are
not final motion capture and are never shipped as runtime frames. The browser
clips remain hand-directed, stepped pixel animation in
`js/animation/move-clips.js`.
