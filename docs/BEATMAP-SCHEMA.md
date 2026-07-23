# Beatmap schema

Beatmaps are local JSON records read by `BeatClock`. Audio time, not render
frames, is authoritative.

```json
{
  "id": "moonBlockParty",
  "title": "Moon Block Party",
  "bpm": 100,
  "offsetSeconds": 0.084,
  "beatsPerBar": 4,
  "barsPerPhrase": 4,
  "loopBars": 16,
  "sections": [
    { "id": "countIn", "startBar": 0, "endBar": 1, "intensity": 0.35 }
  ],
  "accents": [
    { "beat": 0, "strength": 1, "label": "drop" }
  ],
  "breaks": [
    { "startBeat": 24, "endBeat": 28 }
  ],
  "drops": [0, 32, 60]
}
```

## Fields

| Field | Rule |
| --- | --- |
| `id` | Stable non-empty identifier |
| `title` | Player-facing title |
| `bpm` | Positive number; constant for this schema version |
| `offsetSeconds` | Finite time from buffer start to beat zero |
| `beatsPerBar` | Positive integer |
| `barsPerPhrase` | Positive integer |
| `loopBars` | Positive integer matching the audio loop |
| `sections` | Ordered half-open bar ranges with `0..1` intensity |
| `accents` | Beat positions, `0..1` strength, and short semantic label |
| `breaks` | Half-open beat ranges used for musical intent |
| `drops` | Exact beat positions |

`BeatClock` computes:

```text
playbackSeconds = playbackOffset + audioTime - songStartAudioTime
beat = (playbackSeconds - offsetSeconds + latencySeconds) × bpm / 60
```

Measure is one-based. Beat, bar index, and beat index are zero-based. Negative
pre-roll beats are valid. Sections and accents wrap through `loopBars`.

## Authoring checklist

1. Export the final loop without time stretching.
2. Measure the first intended downbeat and enter it as `offsetSeconds`.
3. Confirm beat 0, every four-bar boundary, each break, and the loop seam in
   Rhythm Lab.
4. Pause for several seconds, resume, retry, and hide/restore the tab.
5. Regenerate deterministic screenshots only after the beatmap is final.
6. Record audio hash, duration, sample rate, and rights in asset provenance.
