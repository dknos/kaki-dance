# Kaki-Dance

**Two feet join the band.**

Kaki-Dance is a browser-based Appalachian dance instrument and improvisation
game. The shipping vertical slice is focused on buckdancing, flatfooting,
freestyle clogging, and related percussive footwork. Breaking and floorwork are
not part of this release.

Play the current build at <https://dknos.github.io/kaki-dance/>.

## Play locally

No build step is required.

```bash
npm install
npm run serve
```

Open <http://127.0.0.1:4177>. The runtime uses checked-in assets and remains
compatible with static GitHub Pages.

## The three shipping choices

- **Free Frolic** — a 64-second AABB performance. Improvise, travel, build
  phrases, and resolve the ending without a note highway.
- **Trade Licks** — the main call-and-response game. A visible rival dancer
  performs a short board rhythm; listen, then echo, vary, complement, or raise
  it during the answer bar. Listening and response quality are scored
  separately.
- **Step Shed** — seven playable lessons: alternate feet, add brush/heel/toe,
  travel, shape the upper body, hop and land, resolve on beat one, and answer a
  lick.

All three use the original local tune **Board & Bow** at 120 BPM.

## Controls

| Action | Keyboard | Standard gamepad | Touch |
| --- | --- | --- | --- |
| Left / right foot | ← / → | D-pad left / right | L FOOT / R FOOT |
| Travel and lean | WASD | Left stick | Travel stick |
| Raise / lower upper body | ↑ / ↓ | Right stick | Arm pad |
| Brush either foot | Shift + foot | LB/RB + foot | BRUSH + foot |
| Heel either foot | Control + foot | LT + foot | HEEL + foot |
| Toe either foot | Z + foot | RT + foot | TOE + foot |
| Shuffle / brush family | Q + foot | X + foot | Q · SHUFFLE |
| Cross / heel-toe family | E + foot | Y + foot | E · CROSS |
| Rock / backstep family | F + foot | B + foot | F · DRIVE |
| Turn / phrase ending | T + foot | R3 + foot | T · TURN |
| Hop / jump accent | Space | A | JUMP |
| Pause | Escape / P | Start | Pause |

Every performance binding is remappable. Arrow feet remain available as
accessibility aliases. Input is timestamped on key-down/key-up, operating-system
repeat is ignored, opposing feet are independent, and same-frame double
contacts are legal.

## Runtime design

```text
Web Audio musical clock
          │
     120 Hz simulation
          ├── timestamped left/right intent buffers
          ├── contact, support, COM, jump, and performance state
          ├── musical phrase judge and Trade Licks evaluator
          └── authored contact timestamps
                    │
          real shoe-on-wood round robins

Canvas 2D hall and HUD
          +
shared Three.js SkinnedMesh biped
          ├── one locomotion layer
          ├── independent additive foot layers
          ├── persistent upper-body pose field
          ├── procedural weight and counterbalance
          └── contact lock and visual diagnostics
```

KittyKaki and Soder use the same complete biped contract. Soder remains a
padded snake kigurumi over paired arms, hands, hips, knees, ankles, and feet;
the costume tail is never a support limb.

The lower-body controller exposes preparation, swing, brush, heel, toe,
full-foot contact, recovery, support, and airborne states. The performance
controller derives **Cold, Settling In, In the Pocket, Cooking, Scrambling,
and Recovery** from musical timing, independence, transition quality,
vocabulary, conflicts, and density—not button count.

## Frolic Lab

[Frolic Lab](frolic-lab.html) is the canonical development workbench for the
live rig. It includes:

- fixed, front, side, wide, and free cameras;
- skeleton, bone names/axes, foot-forward arrows, contacts, planted locks,
  center of mass, support, and root path;
- input buffers, modifiers, layer weights, transition candidates, musical
  clock, and per-foot contact/audio timelines;
- 1×, 0.5×, 0.25×, and 0.1× playback plus frame stepping;
- deterministic input recording/replay;
- eighths, sixteenths, L-L-R, brush-step-step, toe-heel-toe, double stomp,
  travel-tap, turn-tap, and jump-to-beat-one patterns.

## Verification

```bash
npm run verify
node scripts/appalachian-simulator-browser.mjs smoke
npm run qa:appalachian-sim:latency
npm run qa:appalachian-sim:capture
```

The native suite covers rapid and simultaneous feet, key repeat, direct
articulations, remapping, controller disconnect/reconnect, deterministic
fixed-step replay, musical-clock pause/resume, contact/audio scheduling,
round-robin Foley, foot orientation, plant drift, ground penetration, rig
limits, scoring resistance to mashing, Trade Licks listening/response scoring,
save migration, and static Pages paths.

Browser evidence is stored under
`docs/review/appalachian-instrument-gate-2/`. Automated evidence never
constitutes artistic approval; the live-rig candidate remains
**CANDIDATE — HUMAN REVIEW REQUIRED**.

## Authoring references

- [Fun-overhaul audit](docs/FUN-OVERHAUL-AUDIT.md)
- [Appalachian design](docs/appalachian-frolic-design.md)
- [Movement and cultural sources](docs/appalachian-sources.md)
- [Animation bible](docs/appalachian-animation-bible.md)
- [Audio pipeline](docs/appalachian-audio.md)
- [Asset provenance](docs/ASSET-PROVENANCE.md)
- [Performance report](docs/PERFORMANCE.md)
- [Known limitations](docs/KNOWN-LIMITATIONS.md)

Legacy rhythm-lane and breaking prototypes remain in source for a later,
separate expansion. They are unreachable from the shipping title and do not
participate in Appalachian input, scoring, tutorial, audio, or presentation.
