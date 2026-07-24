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
The persistent animation controller keeps continuous travel/groove, separate
left/right intent and gesture queues, support/weight/contact state, upper-body
pose, body lean, jump state, and authored transition state.

## Controls

| Semantic channel | Default keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Left/right anatomical foot | Left/Right Arrow | D-pad left/right | L/R FOOT |
| Travel | WASD | Left stick | Travel stick |
| Persistent arms | Up/Down; Shift left; Ctrl right | Right stick; LB/RB isolate | Arm stick + isolates |
| Brush / shuffle | Q | X | BRUSH |
| Heel-toe / articulation | E | Y | HEEL/TOE |
| Drive / backstep / chug | F | B | DRIVE |
| Turn / phrase ending | T (+ A/D side) | R3 | TURN |
| Grounded / committed | Ctrl / Shift | LT / RT | GROUND / COMMIT |
| Style hop | Space hold/release | A | JUMP |

Each anatomical foot keydown edge creates one immediate anticipation. The
intent buffer allows Q/E/F/T to specialize it for 72 ms, regardless of key
order, without emitting a duplicate basic tap. Audio follows authored contact
metadata rather than keydown.

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

`transition-graph.js` accepts a successor only when:

1. an authored edge exists;
2. the current exit foot can become the next entry foot;
3. direction and travel agree;
4. a matching bridge clip exists;
5. the bridge lands on a 24-tick sixteenth boundary.

Every core movement has at least four useful successors in each supported
profile. A rejected request asks the player to shift weight or let the current
move land; it never teleports the body.

## Phrase judging

The results screen reports `TIME`, `TUNE / PHRASE FIT`, `FOOT CLARITY`,
`FLOW`, `USE OF SPACE`, `PERSONAL STYLE`, and `LANDING / RESOLUTION`.
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

The checked-in anti-spam fixture requires a varied, restrained routine to score
at least twenty points above a maximum-density one-move stream. The advanced
call fixture accepts an anchor-preserving variation and scores it above an
exact easy echo.

## Step Shed

The ten learn-by-doing lessons teach:

1. WASD board travel;
2. four alternating Left/Right Arrow contacts;
3. Q brush-return;
4. F backstep/chug;
5. persistent arms;
6. anatomical one-arm isolation;
7. compact style hop;
8. a documented aerial detail;
9. T turnaround;
10. a controlled ending or clean landing.

Move names appear after the body has already performed the action. The
Footwork Lab doubles as the development movebook, showing preview, rhythm
contacts, entry/exit foot, successors, profile variations, and provenance.
