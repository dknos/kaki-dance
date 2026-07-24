# Appalachian Frolic vertical-slice design

> **Fantasy:** The band plays the tune. Your feet answer. The dance board
> becomes another instrument.

Appalachian Frolic is a clean mode boundary beside Measure Match. It shares the
audio-clock, semantic input abstraction, save data, Canvas 2D presentation, and
hero identity. It does not share Measure Match’s listen/copy/freeze state loop.

## One chorus

“Board & Bow” is an original 120 BPM, 4/4, 32-bar AABB tune with a two-bar
count-in. The audio clock is authoritative; animation, contact audio, UI,
trade calls, audience response, and judging all derive from 96 PPQ ticks.

| Bars | Strain | Play |
| --- | --- | --- |
| 1–8 | A1 | Find the Groove: open foundation and a bar-8 turnaround |
| 9–16 | A2 | Trade Licks: one-bar calls followed by one-bar responses |
| 17–24 | B1 | Build the Frolic: new melody, freer chaining, bar-24 turn |
| 25–32 | B2 | Breakdown: stronger trades and a controlled final ending |

Runtime states are `COUNT_IN`, `OPEN_JAM`, `TRADE_CALL`,
`TRADE_RESPONSE`, `TURNAROUND`, `BREAKDOWN`, `FINISH`, and `RESULTS`.
The persistent animation controller keeps a current movement and at most one
buffered successor. An authored bridge lands the successor on a sixteenth-note
boundary.

## Controls

| Semantic channel | Frolic label | Default keyboard | Gamepad | Touch |
| --- | --- | --- | --- | --- |
| Action | STEP | Space | A | STEP |
| Style | BRUSH | F | X | BRUSH |
| Power | DRIVE | Left Shift | Y | DRIVE |
| Freeze | LICK | T | B | LICK |
| Direction | travel / cross / safe turn | WASD or arrows | left stick | left stick |

STEP automatically alternates the compatible foot. Direction modifies travel
or crossing without exposing a move-name memorization requirement. Every
accepted input immediately emits a contact event, a foot/body micro-response,
and an optional short haptic pulse. A full-body transition may remain buffered
until its authored boundary.

Separate settings calibrate:

- judgment offset (moves the authoritative interpreted beat);
- foot-audio offset (sample scheduling);
- full-body visual offset (atlas phase only; the immediate micro-response is
  never delayed).

## Data and transition contract

`footwork-catalog.js` owns fourteen reusable entries: twelve core families,
turnaround, and controlled ending. Each includes style availability, duration,
entry/exit-foot rule, 96 PPQ contacts, articulation, intensity, local sample
group, root travel, transition tags, animation IDs, score traits, difficulty,
and source notes.

`footwork-transition-graph.js` accepts a successor only when:

1. an authored edge exists;
2. the current exit foot can become the next entry foot;
3. direction and travel agree;
4. a matching bridge clip exists;
5. the bridge lands on a 24-tick sixteenth boundary.

Every core movement has at least four useful successors in each supported
profile. A rejected request asks the player to shift weight or let the current
move land; it never teleports the body.

## Phrase judging

The results screen reports `TIME`, `TUNE`, `FLOW`, `FOOTWORK`, and `SPIRIT`.
A secondary restraint factor reduces the value of excessive density, one-move
loops, and constant maximum accents. It does not classify intentional A/B motif
returns as spam.

Trade responses recognize:

1. exact echo;
2. simplified echo retaining anchor accents;
3. variation retaining rhythmic identity;
4. complementary answer.

Easy play accepts a clean exact echo. Advanced evaluation can score a coherent
variation above mechanical copying. Automated seeded simulations compare
high-frequency repetition with a clean varied routine.

The checked-in anti-spam fixture scores the 64-contact, six-family routine
`70` with restraint `1.00`; a 384-contact maximum-density one-move stream
scores `41` with restraint `0.08`. The advanced call fixture accepts an
anchor-preserving variation and scores it above an exact easy echo.

## Step Shed

The learn-by-doing practice mode teaches:

1. four STEP contacts with the pulse;
2. BRUSH between foundation contacts;
3. DRIVE into a backstep or chug;
4. a one-bar anchor answer;
5. LICK in a turnaround window.

Move names appear after the body has already performed the action. The
Footwork Lab doubles as the development movebook, showing preview, rhythm
contacts, entry/exit foot, successors, profile variations, and provenance.
