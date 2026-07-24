# Appalachian Frolic audio pipeline

## Rescue boundary

Candidate 1 replaces the rejected synthesized foot kit, not the tune. “Board &
Bow” remains the checked-in 120 BPM, 32-bar AABB master with its exact
four-second count-in and gameplay timing map. It is still a deterministic
code-synthesized fiddle/banjo/guitar/bass arrangement and is not approved as
convincing acoustic music.

## Shoe-on-board Foley candidate

`scripts/build-appalachian-audio.mjs` cuts 66 local 48 kHz, 24-bit mono samples
from three retained CC0 recordings:

| Source | Recording | Author | License |
| --- | --- | --- | --- |
| [BigSoundBank 1515](https://bigsoundbank.com/steps-on-a-wooden-floor-1-s1515.html) | real shoes on a wood floor/deck | Joseph SARDIN | CC0 / public domain equivalent |
| [BigSoundBank 0376](https://bigsoundbank.com/footsteps-shoe-on-parquet-s0376.html) | real shoes on old parquet | Joseph SARDIN | CC0 / public domain equivalent |
| [Freesound 273380](https://freesound.org/people/sturmankin/sounds/273380/) | trekking shoes shuffling on wood | sturmankin | CC0 1.0 |

The original downloads, source hashes, URLs, cut ranges, and per-sample hashes
are stored below `assets/audio/frolic/feet/sources/` and in
`assets/audio/frolic/feet/manifest.json`.

The eleven pilot families are soft sole, flat sole, heel, toe/ball, brush,
scuff, chug, drag, slide, tap heel, and tap toe. Each family has six genuinely
different files: two soft, two medium, and two strong. The builder trims,
fades, high-passes, and writes the real recordings without oscillator
resonators, pitch-derived left/right variants, or peak-normalizing every strike
to the same loudness.

The runtime foot bus uses:

- a 100 Hz source high-pass and 70 Hz bus high-pass;
- gentle transient compression;
- bounded polyphony;
- natural velocity gain and round-robin selection;
- immediate scheduling from the raw input timestamp.

The input contact is marked consumed before animation metadata crosses it, so a
press cannot play one strike immediately and then duplicate it on the later
contact frame.

## Audition and verification

```bash
npm run audio:frolic:build
npm run qa:frolic:foley
npm run qa:frolic:review
```

The Foley QA checks PCM format, clipping, DC offset, sub-bass, ringing, tails,
exact duplicates, repetition, polyphony, runtime scheduling, and provenance.
Those checks can reject a sample; they cannot decide that it sounds like a shoe.
Use `frolic-rescue-review.html` to isolate every cut, rotate round robins,
compare rejected/candidate kits, and hear the foot bus alone or with music.
Human audition remains mandatory.
