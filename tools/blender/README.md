# Offline authored-atlas and shared-armature pipeline

Kaki-Dance separates hidden gameplay anatomy from public presentation. The
runtime never calls Blender, Grok, Vertex or an image-generation API.

## Production flow

```text
offline character references
          ↓
one shared Blender biped + orthographic camera depth
          ↓
authored pose library / contacts / markers
          ↓
hard-edge pixel cleanup and trimmed atlas packing
          ↓
indexed PNG pages + metadata
          ↓
Canvas playback from normalized audio-clock phase
```

### 1. Pose and costume references

Selected Grok references live under:

- `docs/art-source/measure-match/grok/kitty-five-pose-reference.png`
- `docs/art-source/measure-match/grok/soder-five-pose-reference.jpg`

They are fallible visual references, not final sprites.

### 2. Shared Blender source

Generate the production armature/depth source:

```bash
blender --background --factory-startup \
  --python tools/blender/build_measure_match_rig.py
```

Outputs:

- `kaki-measure-match-production.blend` — one
  `KakiDanceProductionBiped` armature with KittyKaki and Soder costume proxy
  collections, orthographic camera and nine clip blocks at 12 fps.
- `exports/kaki-measure-match-camera-depth.json` — twenty-one semantic anchors,
  contacts, phase markers and independent camera depth for left/right upper
  arms, forearms, hands, thighs, shins and feet.
- `reference/measure-match/` — the ten approval-pose mechanics renders.

Both profiles use identical biped bones. Soder's tail is attached to the pelvis
as costume geometry and never appears in the contact list.

The Blender meshes are mechanics, weight and occlusion blockouts. They are not
automatically accepted as final public frames.

### 3. Authored pose library

`tools/art/hero_pose_library.py` defines:

- anatomical left/right independent of screen left/right;
- dedicated Basic Rock, Go Down, 6-Step, Windmill, Baby Freeze and Clean
  Get-Up mechanics;
- Idle/Groove, Victory and Miss/Recovery;
- stable normalized roots;
- support contacts and animation markers;
- twelve independent segment depths;
- explicit cross-body and limb-clearance drawings.

### 4. Pixel cleanup and atlas export

Run:

```bash
python3 tools/art/build_hero_atlases.py
```

The deterministic offline cleanup/export pass:

- constrains the palette;
- uses opaque hard edges and one/two-pixel outlines;
- draws separate upper/lower limbs, joints, cuffs, paws and directional shoes;
- applies authored camera-space occlusion;
- trims each drawing;
- adds one-pixel extrusion and three-pixel packing padding;
- writes indexed 1024×1024 PNG pages;
- exports pivots, anchors, contacts, effects and segment depths;
- regenerates native/4× approvals, silhouettes, key poses and random-20 sheets.

Outputs:

- `assets/heroes/kitty/atlas-{0,1}.png` and `atlas.json`
- `assets/heroes/soder/atlas-{0,1}.png` and `atlas.json`
- `docs/images/measure-match/approval/`
- `docs/images/measure-match/hero-atlas-report.json`

Aseprite and LibreSprite are not installed in the current workspace, so this is
the checked-in equivalent cleanup workflow. Visual approval remains a manual
review of paused stills and quarter-speed playback.

### 5. Runtime

`js/render/hero-atlas.js` loads only local assets. `js/render/renderer.js` uses
`AtlasHeroRenderer` for public heroes and never imports the rejected procedural
limb renderer. `js/hero-lab.js` may show that procedural layer only when its
explicit debug checkbox is enabled.

## Appalachian Frolic shared biped

Frolic uses a separate deterministic authoring source while preserving the
same non-negotiable anatomy for both heroes:

```bash
npm run rig:frolic:build
```

That command runs `build_appalachian_frolic_rig.py` and writes:

- `kaki-appalachian-frolic.blend` — one `KakiFrolicSharedBiped` armature,
  paired arm/hand and leg/heel/toe/foot-IK controls, knee poles, Soder costume
  controls, three 24 fps profile actions, twenty authored clip blocks per
  profile, and a 384×216 orthographic camera;
- `exports/kaki-appalachian-frolic-rig.json` — deterministic bone hierarchy,
  profile/clip timing, contact/control facts, hero costume bindings, and camera
  review data.

Both `KittyKaki_Profile` and `Soder_Profile` bind to that armature. Soder’s hood,
belly, and padded tail are costume controls; the tail is never a support limb.
Heel, toe, ankle, foot IK, knee, pelvis, and center-of-mass behavior remain
available to the pixel pose library and diagnostic overlays.

The public 164-drawing profile packs are rebuilt separately:

```bash
npm run art:frolic:build
```

The exporter creates exactly one indexed 1024² page for each hero/profile,
then runs plant displacement, adjacent-joint motion, missing-limb, left/right
foot, contact, transition, atlas-bounds, and silhouette-separation lint. The
game retains one selected pack at a time. The Blender proxy volumes remain
mechanics/occlusion evidence and are never rendered in public gameplay.

## Legacy source

`build_kaki_proxy.py`, `kaki-hero-biped.blend`,
`exports/kaki-hero-golden-chain.json` and `reference/hero-rescue/` are preserved
as evidence from the rejected `ce32ead` procedural rescue. They continue to
verify the hidden semantic rig but are not final hero presentation.
