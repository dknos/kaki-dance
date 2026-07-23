import { DEFAULT_BEATMAP } from "../audio/beatmap.js";
import { MOVE_CLIPS } from "../animation/move-clips.js";
import { solveCharacterRig } from "../animation/kaki-rig.js";
import {
  createPoseBridge,
  samplePoseBridge,
  samplePoseTimeline,
} from "../animation/pose-timeline.js";
import { characterDefinition } from "../dance/character-catalog.js";
import { ContactSolver } from "../dance/contact-solver.js";
import { getMoveDefinition } from "../dance/move-catalog.js";

export function buildMoveQaSnapshot({
  moveId = "basicRock",
  phase = 0.5,
  character = "kitty",
  mirror = false,
  balance = 0,
  wobble = 0,
  stamina = 72,
  reducedMotion = false,
  beat = 16,
  mode = "practice",
  performer = "player",
  transitionFrom = "",
  transitionProgress = 1,
  previousRig = null,
  debugAssertions = false,
} = {}) {
  const move = getMoveDefinition(moveId);
  if (!move) throw new Error(`Unknown QA move ${moveId}.`);
  const characterValue = characterDefinition(character);
  let pose = samplePoseTimeline(MOVE_CLIPS[move.animationClip], phase, {
    bpm: DEFAULT_BEATMAP.bpm,
    durationBeats: move.loopLength || move.durationBeats,
    reducedMotion,
    sampleCadence: move.poseCadence,
  });
  const previousMove = getMoveDefinition(transitionFrom);
  if (previousMove && transitionProgress < 1) {
    const previousPose = samplePoseTimeline(
      MOVE_CLIPS[previousMove.animationClip],
      1,
      {
        bpm: DEFAULT_BEATMAP.bpm,
        durationBeats: previousMove.loopLength || previousMove.durationBeats,
        reducedMotion,
        sampleCadence: previousMove.poseCadence,
      },
    );
    const bridge = createPoseBridge(previousPose.pose, pose.pose, { drawings: 5 });
    pose = {
      ...pose,
      pose: samplePoseBridge(bridge, transitionProgress),
      label: `${previousMove.id}-to-${move.id}`,
    };
  }
  const contactSolver = new ContactSolver();
  const contacts = contactSolver.resolve(move, phase, { mirror, baseX: 0, baseY: 0, loop: 0 });
  const rig = solveCharacterRig(characterValue, pose.pose, contacts, {
    mirror,
    balance,
    wobble,
    previousRig,
    debugAssertions,
  });
  const measured = contactSolver.measure(rig, contacts.contacts);
  const dancer = Object.freeze({
    moveId: move.id,
    moveName: move.displayName,
    family: move.family,
    phase,
    startBeat: beat - phase * move.durationBeats,
    endBeat: beat + (1 - phase) * move.durationBeats,
    loop: 0,
    extensions: 0,
    tags: Object.freeze([...move.exitTags]),
    stamina: Math.max(0, Math.min(100, Number(stamina) || 0)),
    momentum: move.family === "power" ? 0.8 : 0,
    direction: mirror ? -1 : 1,
    mirror,
    balance: Object.freeze({ offset: balance, velocity: 0, wobble, failed: wobble > 1, stableBeats: 2 }),
    pose,
    rig,
    contacts: Object.freeze({ ...contacts, error: measured.average, measured }),
    queuedMove: "",
  });
  const beatSnapshot = syntheticBeat(beat);
  const waiting = Object.freeze({
    ...dancer,
    moveId: "basicRock",
    moveName: "BASIC ROCK",
    family: "toprock",
    phase: 0.2,
  });
  const score = Object.freeze({
    musicality: 62, vocabulary: 58, originality: 66, technique: 71, execution: 74,
    total: 66, reasons: Object.freeze([]), maxCrowdHeat: 68,
  });
  return Object.freeze({
    mode,
    started: true,
    complete: false,
    performer,
    character: characterValue,
    waitingCharacter: characterDefinition(character === "soder" ? "kitty" : "soder"),
    dancer,
    player: performer === "player" ? dancer : waiting,
    opponent: performer === "opponent" ? dancer : waiting,
    beat: beatSnapshot,
    elapsedBeats: beat,
    remainingBeats: mode === "battle" ? 12 : Infinity,
    round: 1,
    battlePhase: 0,
    crowdHeat: 68,
    playerScore: score,
    opponentScore: score,
    callout: "",
    calloutAge: 0,
    practiceChainIndex: 0,
    practiceNext: "basicRock",
    result: null,
    replayLength: 0,
  });
}

export function syntheticBeat(beat, beatmap = DEFAULT_BEATMAP) {
  const beatIndex = Math.floor(beat);
  const beatPhase = ((beat % 1) + 1) % 1;
  const barIndex = Math.floor(beat / beatmap.beatsPerBar);
  return Object.freeze({
    audioTime: beat * 60 / beatmap.bpm,
    playbackSeconds: beat * 60 / beatmap.bpm,
    beat,
    beatIndex,
    beatPhase,
    beatInBar: ((beatIndex % beatmap.beatsPerBar) + beatmap.beatsPerBar) % beatmap.beatsPerBar,
    barIndex,
    measure: barIndex + 1,
    phrase: Math.floor(barIndex / beatmap.barsPerPhrase) + 1,
    section: "qa",
    intensity: 0.72,
    bpm: beatmap.bpm,
    paused: false,
    running: true,
  });
}
