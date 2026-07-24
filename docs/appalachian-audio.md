# Appalachian Frolic audio pipeline

## Board & Bow

`scripts/build-appalachian-audio.mjs` creates the original “Board & Bow”
arrangement deterministically:

- 120 BPM, 4/4, 96 PPQ gameplay map;
- two-bar / four-second count-in;
- 32-bar AABB chorus lasting 64 seconds;
- total master duration 68.000 seconds;
- original A and B melodies;
- fiddle lead, clawhammer-inspired banjo interlock, guitar pulse, and bass
  phrase support;
- 22.05 kHz, 16-bit PCM, stereo master;
- four matching mono stems.

No third-party recording, sample, runtime service, or commercial track is
used. The master measures approximately -15.7 dB mean and -1.1 dB peak in the
checked-in build.

The public vertical slice plays the local master. Separate stems remain
authored and synchronized for future responsive-mix expansion; successful
phrase events already drive restrained band/crowd foregrounding.

## Foot percussion

The same build script creates three deterministic round-robin variations for:

- soft sole;
- flat contact;
- heel;
- toe/ball;
- brush;
- scuff;
- chug;
- drag;
- slide;
- tap heel;
- tap toe;
- heavy accent;
- rival board.

Each sound combines short noise/transient material with damped wooden-board
resonance. Playback varies velocity, round-robin selection, slight left/right
pan, and tiny left/right pitch offset. Clog remaps compatible heel, toe, and
flat contacts to the tap-equipped profile.

At input time the simulation emits an immediate contact using the audio-clock
timestamp. `FootPercussionPlayer` schedules the local buffer from that
timestamp plus the configurable audio offset. Later contacts come from the
same 96 PPQ metadata that drives atlas accent phases. This keeps the feet a
player-controlled instrument instead of a decorative animation sound.

## Rebuild and verify

```bash
npm run audio:frolic:build
ffprobe assets/audio/frolic/board-and-bow.wav
npm test -- --test-name-pattern="Board & Bow|foot contacts"
```

The audio asset tests verify exact duration, format, stem dimensions, local
round-robin coverage, and the absence of remote runtime URLs.
