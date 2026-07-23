# Suno production brief: Kaki-Dance

The checked-in vertical slice ships an original instrumental breakbeat,
`Moon Block Party`, so the game works locally without a service. A polished
Suno vocal mix can replace or accompany it later.

## Production prompt

```text
Original Japanese female vocal breakbeat for a cute late-16-bit arcade
breakdancing game called Kaki-Dance. Exactly 100 BPM, confident pocket, dusty
drum break, round sub bass, vinyl scratches, short DJ cuts, restrained bright
chiptune stabs, moonlit rooftop block-party warmth. Female Japanese voice,
playful and cool rather than idol-pop, extremely sparse call-and-response
phrases with long instrumental sections for gameplay. Clear kick and snare,
clean four-bar and sixteen-bar phrase boundaries, one two-bar breakdown, one
strong final drop. No dense verse, no rap imitation, no English-heavy lyrics,
no copyrighted melody, no crowd wall, no long reverb tail. Seamless instrumental
loop or stems preferred.
```

## Minimal lyrics

```text
[Intro]
カキ・ダンス

[Hook]
まわって　パウ
ビートで　フリーズ
カキ・ダンス

[Break]
いま！

[Final Hook]
まわって　パウ
きめて　フリーズ
カキ・ダンス
```

Romaji guide:

```text
Kaki Dance
Mawatte, pau
Biito de, furiizu
Kaki Dance
Ima!
Mawatte, pau
Kimete, furiizu
Kaki Dance
```

## Alternate ultra-minimal hook

```text
カキ・ダンス
パウ、パウ
フリーズ！
```

## Delivery target

- WAV, 44.1 or 48 kHz, no mastering limiter pumping.
- Exactly 100 BPM.
- Prefer separate instrumental, vocal, drums, bass, and FX stems.
- Preserve a clearly measurable first downbeat.
- Record the final first-downbeat offset in
  `assets/audio/moon-block-party.beatmap.json`.
- Verify loop, pause, resume, retry, and latency in the Rhythm Lab.

Do not replace the checked-in track until the exported audio, rights, hash,
duration, BPM, and downbeat offset are added to `docs/ASSET-PROVENANCE.md`.
