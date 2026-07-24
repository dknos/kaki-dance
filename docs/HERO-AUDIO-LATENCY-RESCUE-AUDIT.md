# Hero, Audio, and Latency Rescue Audit

Status: rejected baseline recorded; Flatfoot replacement is a human-review candidate, not approved.

Audit date: 2026-07-24
Audited revision: `0c82fe75eacf5e412a5a8e51a587932e9cc80e9d`
Native gameplay size: 384 × 216

## Baseline record

The worktree was clean before rescue work began. `npm run verify` passed all
13 suites at the rejected revision. That result establishes only that the old
files and contracts were internally consistent; it does not override the
visible, audible, or control-response failures below.

The locally served game was captured at native resolution for KittyKaki and
Soter in Flatfoot, Buck, and Clog. Every checked-in MP4 and GIF loop was also
inspected at normal speed and half speed. The rejected files, native captures,
and measured runtime observations are preserved in
`docs/review/rejected-0c82fe7/`.

Observed foundation-to-BRUSH visible clip changes in the rejected runtime:

| Hero | Profile | Delay |
| --- | --- | ---: |
| KittyKaki | Flatfoot | 390.7 ms |
| KittyKaki | Buck | 366.7 ms |
| KittyKaki | Clog | 377.6 ms |
| Soter | Flatfoot | 399.9 ms |
| Soter | Buck | 390.9 ms |
| Soter | Clog | 409.2 ms |

At 384 × 216, the rejected frames confirm the reported failure: crossing legs
collapse into a dark shape, hands read as pale disconnected marks, upper-body
counterbalance is weak, and the board, band, crowd, room, and HUD compete with
rather than clarify the dancer. The three profiles read primarily as small
lift/amplitude variants.

## Confirmed pipeline findings

1. **The public sprites come from Pillow primitives, not Blender.**
   `tools/art/build_appalachian_atlases.py` imports `render_frame` from
   `tools/art/build_hero_atlases.py`. That renderer draws the production PNG
   pixels with Pillow ellipses, polygons, lines, and coordinate anchors. The
   Blender scene is not invoked by the public atlas build.

2. **The rejected Blender scene is a proxy/mechanical proof.**
   `tools/blender/build_appalachian_frolic_rig.py` creates proxy volumes rather
   than a production modeled, weighted, animated, and rendered character.
   `docs/appalachian-animation-bible.md` and `docs/KNOWN-LIMITATIONS.md` also
   describe the Blender work as a proxy/mechanics proof.

3. **Motion is primarily coordinate manipulation plus sine curves.**
   `tools/art/appalachian_pose_library.py` moves body anchors and derives much
   of its timing/offset motion from `sin(...)` and style parameters. It is not
   hand-keyed pose-to-pose character animation.

4. **Most rejected source clips are 12 fps.**
   The fourteen main movement clips are declared at 12 fps. Transition bridges
   are 16 fps. The shipped Appalachian MP4 loops also probe as 12 fps (the GIF
   encodes at approximately 12.5 fps).

5. **The controller holds a complete clip and buffers the next request.**
   `js/appalachian/animation-controller.js` keeps `current` and one `queued`
   movement. `update()` does not promote the queued request until the current
   duration has elapsed; it may then enter a transition bridge.

6. **That design creates a normal 0.5–1 second action wait.**
   At the fixed 120 BPM tune map, 96 ticks equal 0.5 seconds and 192 ticks equal
   1 second. The controller can therefore make a requested foot action wait for
   the active one- or two-beat movement to finish.

7. **Transition bridges add another 125–250 ms.**
   Bridge durations are 24–48 ticks at 120 BPM, which is 125–250 ms.

8. **The immediate micro-response is not the requested foot action.**
   `js/render/frolic-atlas.js` applies only about +1.8% horizontal scale and
   -1.4% vertical scale. This generic squash does not identify a foot, contact,
   support change, heel, toe, brush, or chug.

9. **Controls secretly rotate through candidate moves.**
   `PROFILE_CHOICES` and `inputCounters` in
   `js/appalachian/simulation.js` select a different move after repeated
   identical inputs. Meaning is therefore hidden and context is not sufficient
   to predict the result.

10. **The rejected foot kit is synthetic tonal percussion.**
    `scripts/build-appalachian-audio.mjs` combines seeded noise with
    low-frequency sine resonators, normalizes every generated file toward the
    same peak, and includes long tonal tails. The 460 ms `heavyAccent` includes
    a 92 Hz resonant mode. This construction explains the conga/tom character.

11. **Browser QA does not measure event-to-first-hero-pixel latency.**
    `scripts/appalachian-browser-smoke.mjs` records a `microResponse` field but
    does not compare the raw input timestamp with the first changed pixel
    inside the hero rectangle.

12. **Audio QA does not establish that the samples sound like shoes.**
    `tests/appalachian-assets.test.js` checks filenames, file format, metadata,
    and scheduling contracts. It contains no perceptual shoe-versus-drum
    audition or classification. `js/audio/foot-percussion-player.js` also makes
    its old left/right distinction mainly with playback-rate pitch changes.

## Rescue decision

Green automation is retained as regression protection, not artistic approval.
The rejected Pillow renderer is limited to old/new review and debug overlays.
The replacement Flatfoot pixels must originate in the production Blender
scene, and the replacement Foley must originate in real or appropriately
licensed shoe-on-board recordings. Buck and Clog remain outside this candidate
scope and must not silently fall back to the rejected library.
