# Offline Blender power-reference pipeline

This pipeline builds a license-clean plush Kaki proxy, blocks five complex
power mechanics, renders fixed orthographic three-quarter reference passes, and
exports selected bone endpoints to JSON. Blender is never loaded at runtime.

```bash
blender --background --factory-startup \
  --python tools/blender/build_kaki_proxy.py -- \
  --output tools/blender/kaki-power-proxy.blend
```

Outputs:

- `kaki-power-proxy.blend` — articulated proxy, 24 fps timeline, labeled clip
  blocks, contact markers, and three-quarter camera.
- `reference/{backspin,swipe,windmill,flare,headspin}.png` — midpoint reference
  passes at 384×216.
- `exports/kaki-power-reference.json` — deterministic entry/mid/exit bone data.

The timeline is a mechanics study, not final motion capture. Use it to inspect
COM orientation, large arcs, and contact order, then author fewer and stronger
keys in `js/animation/move-clips.js`. Do not render these proxy frames directly
into the game.
