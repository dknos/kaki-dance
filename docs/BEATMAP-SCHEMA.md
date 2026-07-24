# Beatmap schema v2

Beatmap v2 adds authored one-measure call/copy patterns to the local 100 BPM,
4/4 track. `AudioContext.currentTime`, through `BeatClock`, remains
authoritative; render frames never advance musical time.

Every bar is sixteen sixteenth-note cells:

```text
[....] [....] [....] [....]
```

## Example

```json
{
  "schemaVersion": 2,
  "id": "moonBlockParty",
  "bpm": 100,
  "offsetSeconds": 0.084,
  "beatsPerBar": 4,
  "ticksPerBar": 16,
  "loopBars": 16,
  "patterns": [
    {
      "id": "pocket-quarters",
      "callBar": 2,
      "responseBar": 3,
      "subdivision": 16,
      "callTicks": [0, 4, 8, 12],
      "targetTicks": [0, 4, 8, 12],
      "targetStrengths": [1, 0.86, 0.74, 0.92],
      "optionalStyleTicks": [6, 14],
      "choreographyId": "basic-rock-a",
      "section": "onboarding",
      "difficulty": 1,
      "phraseEnding": false,
      "freezeOpportunity": false,
      "cueSounds": ["hat", "snare", "hat", "snare"]
    }
  ],
  "finale": {
    "bar": 16,
    "choreographyId": "baby-freeze-resolution",
    "freezeTick": 0,
    "holdTicks": 8,
    "getUpTick": 8,
    "victoryTick": 14
  }
}
```

## Pattern fields

| Field | Rule |
| --- | --- |
| `id` | Unique stable identifier |
| `callBar` | One-based measure containing the audible/visible call |
| `responseBar` | Later one-based measure judged as the player's copy |
| `subdivision` | `16` for this MVP |
| `callTicks` | Authored cells illuminated while the song performs the call |
| `targetTicks` | Authored response cells matched by player input |
| `targetStrengths` | One `0..1` accent weight per target |
| `optionalStyleTicks` | Separately judged cells claimed only by the Style input |
| `choreographyId` | Predictively selected authored phrase |
| `section` | Musical/structural label |
| `difficulty` | MVP progression level `1..3` |
| `phraseEnding` | Whether the measure closes a phrase |
| `freezeOpportunity` | Whether its phrase can resolve to the freeze |
| `cueSounds` | Semantic descriptions of the authored audio accents |

Call and response ticks may differ. The response is authored against the actual
kick, snare, scratch, stab and break section rather than blindly copying an
incompatible audio bar.

## Shipped 16-bar arrangement

| Bars | Pattern / presentation |
| --- | --- |
| 1 | Count-in |
| 2 → 3 | Quarter-note Basic Rock |
| 4 → 5 | Backbeat Basic Rock |
| 6 → 7 | Break-compatible Go Down |
| 8 → 9 | Open 6-Step |
| 10 → 11 | Syncopated 6-Step |
| 12 → 13 | Windmill scissor |
| 14 → 15 | Power accents into Baby Freeze |
| 16 | Freeze hold → Clean Get-Up → Victory |

There are no triplets, tempo changes or targets longer than one bar.

## Judgment

For an input at audio beat `b`:

1. Advance the active response measure so expired pending targets become misses.
2. Find the closest still-pending target within the selected accepted window.
3. Claim that one target only; a second input cannot claim it again.
4. Store signed error:

   ```text
   errorMs = (inputBeat - targetBeat) × 60,000 / bpm
   ```

5. An unmatched normal input is an extra.
6. A Style press searches the independent optional Style targets.
7. At measure end, report accuracy, mean absolute error, worst error, misses,
   extras, optional Style accuracy, completion and phrase streak.

Immediate grades are `PURRFECT`, `CLEAN`, `IN THE POCKET`, `SHAKY` and
`LOST THE BEAT`.

## Predictive presentation

During CALL the scheduler already knows the response target and:

- selects choreography and direction;
- prepares its entry stance;
- preloads the selected hero atlas;
- starts authored anticipation before response accents;
- displays and sounds the target pattern.

During COPY, the atlas proceeds through its normalized audio-clock phase whether
the player hits or misses. Input changes impact feedback and scoring, not the
underlying animation clock, so taps never restart a move.

## Audio-clock equation

```text
playbackSeconds = playbackOffset + audioTime - songStartAudioTime
beat = (playbackSeconds - offsetSeconds + latencySeconds) × bpm / 60
```

Measures are one-based. Beat, bar index and beat index are zero-based. Negative
pre-roll beats are valid. Sections and legacy accent helpers wrap at the
16-bar loop boundary.
