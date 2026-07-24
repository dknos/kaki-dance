# Measure Match and authored-hero milestone

## Outcome

The default game is now a one-button measure-copy rhythm sequence:

```text
LISTEN → COPY → KEEP THE GROOVE → FREEZE
```

The first response starts after one count-in bar and one audible/visible call
bar. Space, gamepad A or the single touch PAW can complete the tutorial and the
full beginner sequence.

Public heroes now render from authored indexed sprite atlases. The fixed-length
`BipedRig` is retained invisibly for contacts, support, center of mass,
eligibility, effects and deterministic replay.

## 16-bar sequence

| Bars | Choreography |
| --- | --- |
| 1 | Count-in |
| 2–5 | Quarter/backbeat Basic Rock calls and copies |
| 6–7 | Go Down |
| 8–11 | Open and syncopated 6-Step |
| 12–13 | Windmill |
| 14–15 | Power-to-freeze phrase |
| 16 | Baby Freeze hold, Clean Get-Up and Victory |

The response animation is selected during CALL and proceeds continuously from
the audio clock. A miss subdues feedback but does not restart or interrupt the
phrase.

## Runtime files

| Area | Files |
| --- | --- |
| Beatmap and clock helpers | `assets/audio/moon-block-party.beatmap.json`, `js/audio/beatmap.js` |
| Timing and scoring | `js/dance/measure-judge.js` |
| Predictive sequence | `js/dance/measure-match-simulation.js` |
| Atlas playback | `js/render/hero-atlas.js`, `js/render/renderer.js` |
| Player UI | `js/render/hud.js`, `js/game.js`, `index.html`, `styles.css` |
| Hero diagnostics | `hero-lab.html`, `js/hero-lab.js`, `hero-rescue.html` |
| Offline source | `tools/art/`, `tools/blender/build_measure_match_rig.py` |
| Tests | `tests/hero-atlas.test.js`, `tests/measure-match.test.js` |

## Visual evidence

- Rejected baseline: `docs/images/measure-match/rejected-ce32ead/`
- Ten approval poses and still sheets:
  `docs/images/measure-match/approval/`
- Normal/quarter-speed motion, full gameplay, tutorial, Hero Lab and full
  review board: `docs/images/measure-match/final/`
- Browser/device proof: `docs/images/qa-browser/`

Exact local review URLs:

- <http://127.0.0.1:4177/hero-rescue.html>
- <http://127.0.0.1:4177/hero-lab.html>
- <http://127.0.0.1:4177/qa.html>
- <http://127.0.0.1:4177/>

## Verification boundary

Automated tests validate timing ownership, deterministic phase, contacts,
anchors, pivots, indexed pages and public/procedural renderer separation.
Visual acceptance remains a distinct gate: pause the quarter-speed videos and
trace every arm and leg chain in the random-frame sheets.
