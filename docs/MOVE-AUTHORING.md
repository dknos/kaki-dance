# Move-authoring guide

Moves are data first. Add gameplay truth to `js/dance/move-catalog.js`, pose
keys to `js/animation/move-clips.js`, and only then adjust drawing code if the
existing rigs cannot express the silhouette.

## Required manifest contract

Every move declares:

- identity, family, difficulty, duration, loop behavior, and pose cadence;
- entry and exit stance tags;
- eligible preceding families and explicit follow-ups;
- named planted contacts with normalized start/end phases and floor anchors;
- center-of-mass and root-motion intent;
- facing, mirroring, stamina, balance, cancel, and accent behavior;
- player extension input and failure recovery;
- five-category score properties;
- animation clip, sound events, and crowd potential.

The renderer never adds contacts or makes a transition legal.

## Authoring sequence

1. Research the recognizable support pattern and record links in
   `MOVE-REFERENCES.md`.
2. Block entry, anticipation, readable apex, accent, recovery, and exit poses.
3. Choose intentional pose cadence: usually 12–15 fps for held groove, 20 fps
   for footwork, and 20–30 fps for power.
4. Declare contact handoffs. Overlap contacts only where both supports are
   physically intended.
5. Enter compatible tags and follow-ups. Run graph validation.
6. Verify normal and mirrored directions on KittyKaki and Soder.
7. Inspect contact error, COM, support region, and limb reach in Animation Lab.
8. Exercise extensions, low stamina, early buffered requests, freeze failure,
   and recovery.
9. Capture entry/mid/accent/exit frames and run the full test suite.

For a move-to-move handoff, use the deterministic pose bridge. Angle fields
take the shortest path, bend side is held until the receiving anticipation key,
and active contact anchors remain exact. Do not add an unmarked elbow or knee
side change to make a transition convenient.

## Contact definition

```js
{
  id: "left-paw-entry",
  limb: "leftPaw",
  start: 0.0,
  end: 0.38,
  point: [-18, 0]
}
```

Contact phases are inclusive and normalized over the move loop. Anchors are in
dancer-local logical pixels. Mirror swaps named left/right limbs and negates X.
The contact solver owns the locked anchor; the analytic limb solver moves the
plush mass around it and reports residual error.

Current acceptance threshold is at most `0.01` logical pixel in the exhaustive
101-phase test sweep.

## Stance tags

Use small mechanical claims rather than visual pose names:

- `standing`
- `goDownReady`
- `floor`
- `twoHandsAvailable`
- `powerReady`
- `freezeReady`
- `momentum`

Entry tags are all required. Exit tags describe the move's completed state.
`eligiblePrecedingFamilies` and `validFollowUps` are separate checks; both must
agree.

## Character topology

KittyKaki and Soder use the same `BipedRig`: root, pelvis, chest, neck, head,
paired shoulders, elbows, wrists, hands, hips, knees, ankles and feet. The two
profiles may change costume volume, palette, extremity shape, head treatment
and secondary attachments, but never move semantics or anatomy.

Upper-arm, forearm, thigh and shin lengths are profile constants. A planted
target beyond reach must cause a bounded root, pelvis or chest correction; an
authoring error must never be disguised by scaling a bone. Every golden-chain
clip is sampled at 101 phases for both profiles and mirrors to prove length
preservation, joint limits and declared bend-side changes.

Soder's snake hood, padded sleeves and leggings, belly panel and soft tail are
costume volumes. His tail is not a contact-capable support.

## Offline Blender reference

The authoritative Blender source uses one armature for both profiles and blocks
the six golden-chain moves before broader content work. It exports five-phase
joint keypoints, declared contact metadata, color passes, silhouettes and
front/three-quarter/mirrored turnarounds. Runtime remains 2D, and final keys
must still be hand-directed into Kaki proportions, held drawings, readable
paws and pixel-stable anchors.
