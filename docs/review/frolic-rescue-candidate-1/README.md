# Frolic rescue candidate 1

Status: **human review required**. This directory is not named or treated as a
final/approved package. Buck, Clog, broader stage polish, and deployment remain
stopped.

Start a local server from the repository root, then open:

`http://127.0.0.1:4177/frolic-rescue-review.html`

The page uses the actual 384×216 gameplay renderer and actual runtime control
path. It switches KittyKaki/Soter, candidate/rejected art, candidate/rejected
Foley, normal/half-speed loops, skeleton/contact diagnostics, music/effects,
latency readouts, and isolated samples without autoplay.

## Mandatory media

- Model sheets: `model-sheets/`
- Native and 4× gameplay stills: `stills/`
- Neutral-background movement strips: `strips/`
- Skeleton/contact diagnostics: `diagnostics/`
- Normal and half-speed 10-second MP4s: `video/`
- Rejected/candidate visual comparisons: `comparisons/`
- Old/new Foley comparison and notes: `audio/`
- Motion, Foley, latency, music, and review-page reports: `reports/`
- Machine-readable hashes and provenance:
  `source-provenance-manifest.json`

## Review truth

The actual Blender characters render the Flatfoot public sprites at 30 source
fps. Automated motion, signal, scheduling, and browser checks pass only as
regression evidence. They do not approve the art, dancing, Foley, or mix.

Visible weaknesses to judge directly:

- rounded anatomy and large glove forms remain simple;
- arm counterbalance and personal groove may still read too restrained;
- manual pixel cleanup is blocked without Aseprite/LibreSprite;
- the stage is a readability pass, not complete environment polish;
- “Board & Bow” remains the unapproved code-synthesized master.
