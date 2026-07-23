import { DEFAULT_BEATMAP } from "../audio/beatmap.js";
import { characterDefinition } from "./character-catalog.js";
import { DanceAI } from "./ai.js";
import { MoveSession, goldenChainIds } from "./move-session.js";
import { RoundScorer, timingJudgment } from "./scoring.js";
import { combineRoundBreakdowns, judgeRounds } from "./round-judge.js";

const BATTLE_PHASES = Object.freeze([
  { performer: "player", round: 1 },
  { performer: "opponent", round: 1 },
  { performer: "player", round: 2 },
  { performer: "opponent", round: 2 },
  { performer: "player", round: 3, tiebreak: true },
  { performer: "opponent", round: 3, tiebreak: true },
]);
const NORMAL_BATTLE_PHASES = 4;

export class DanceSimulation {
  constructor({
    mode = "practice",
    character = "kitty",
    beatmap = DEFAULT_BEATMAP,
    timingWindows,
    seed = 0x4b414b49,
    reducedMotion = false,
  } = {}) {
    this.mode = mode;
    this.character = characterDefinition(character);
    this.opponentCharacter = characterDefinition(character === "soder" ? "kitty" : "soder");
    this.beatmap = beatmap;
    this.timingWindows = timingWindows;
    this.seed = seed;
    this.reducedMotion = reducedMotion;
    this.events = [];
    this.replay = [];
    this.playerRounds = [];
    this.opponentRounds = [];
    this.resetScorers();
    this.started = false;
    this.complete = false;
    this.startBeat = 0;
    this.phaseStartBeat = 0;
    this.battlePhaseIndex = 0;
    this.lastSnapshot = null;
    this.practiceChainIndex = 0;
    this.callout = "";
    this.calloutAge = 0;
    this.inputDevice = "keyboard";
    this.highlightSnapshot = null;
    this.highlightValue = -Infinity;
  }

  resetScorers() {
    this.playerScorer = new RoundScorer({ targetPerCategory: this.mode === "battle" ? 180 : 540 });
    this.opponentScorer = new RoundScorer({ targetPerCategory: 180 });
    this.playerSession = new MoveSession({
      character: this.character,
      scorer: this.playerScorer,
      beatmap: this.beatmap,
      timingWindows: this.timingWindows,
      reducedMotion: this.reducedMotion,
    });
    this.opponentSession = new MoveSession({
      character: this.opponentCharacter,
      scorer: this.opponentScorer,
      beatmap: this.beatmap,
      timingWindows: this.timingWindows,
      reducedMotion: this.reducedMotion,
    });
    this.ai = new DanceAI({ session: this.opponentSession, difficulty: "normal", seed: this.seed + this.battlePhaseIndex * 101 });
  }

  begin(beatSnapshot) {
    this.started = true;
    this.complete = false;
    this.startBeat = beatSnapshot.beat;
    this.phaseStartBeat = beatSnapshot.beat;
    this.battlePhaseIndex = 0;
    this.playerRounds = [];
    this.opponentRounds = [];
    this.replay = [];
    this.practiceChainIndex = 0;
    this.inputDevice = "keyboard";
    this.result = null;
    this.highlightSnapshot = null;
    this.highlightValue = -Infinity;
    this.resetScorers();
    this.playerSession.reset({ beat: beatSnapshot.beat });
    this.opponentSession.reset({ beat: beatSnapshot.beat });
    this.emit("roundStarted", { mode: this.mode, performer: this.activePerformer(), round: 1 });
  }

  update(dt, beatSnapshot, input) {
    if (!this.started || this.complete) return;
    if (input?.device) this.inputDevice = input.device;
    this.calloutAge += dt;
    if (this.calloutAge > 1.1) this.callout = "";
    const active = this.activePerformer();
    if (active === "player") {
      this.handlePlayerInput(input, beatSnapshot);
      this.playerSession.update(beatSnapshot, dt, {
        balanceX: input.x,
        freezeHeld: input.freeze,
        deliberateRest: !this.playerSession.current && Math.abs(input.x) < 0.15,
      });
      this.consumeSessionEvents(this.playerSession, "player");
    } else {
      this.ai.observePlayer(this.playerScorer.history);
      const aiInput = this.ai.update(beatSnapshot);
      this.opponentSession.update(beatSnapshot, dt, aiInput);
      this.consumeSessionEvents(this.opponentSession, "opponent");
    }
    this.considerHighlight(beatSnapshot);
    this.recordReplay(beatSnapshot, input);
    this.advanceMode(beatSnapshot);
    this.lastSnapshot = beatSnapshot;
  }

  handlePlayerInput(input, beatSnapshot) {
    const session = this.playerSession;
    const snapshot = session.getSnapshot();
    const timing = timingJudgment(beatSnapshot.beat, beatSnapshot.bpm, this.timingWindows, this.beatmap);
    const request = (id) => session.requestMove(id, {
      beat: beatSnapshot.beat,
      timing,
      direction: Math.abs(input.x) > 0.2 ? Math.sign(input.x) : snapshot.direction,
      mirror: input.x < -0.25,
    });
    const advanced = input.toprockPressed || input.footworkPressed;

    if (input.toprockPressed) request(this.toprockChoice(input));
    if (input.footworkPressed) request(this.footworkChoice(input));
    if (input.powerPressed) {
      if (!session.extendCurrent("power", { beat: beatSnapshot.beat, accented: timing.accentHit })) {
        request(this.powerChoice(input, snapshot.stamina));
      }
    }
    if (input.freezePressed) request(this.freezeChoice(input));
    if (input.stylePressed && !advanced) request(this.styleChoice(input, snapshot));
    if (input.actionPressed) {
      if (advanced) {
        this.handleAdvancedAccent(request, input, snapshot);
      } else {
        this.handleContextAction(request, input, snapshot, beatSnapshot);
      }
    }
  }

  handleContextAction(request, input, snapshot, beatSnapshot) {
    if (snapshot.family === "toprock" && input.y > 0.28) {
      request("basicGoDown");
      return;
    }
    if (snapshot.family === "footwork" && snapshot.moveId === "sixStep") {
      if (!this.playerSession.extendCurrent("action", {
        beat: beatSnapshot.beat,
        accented: beatSnapshot.beatPhase < 0.1 || beatSnapshot.beatPhase > 0.9,
      })) request("sixStep");
      return;
    }
    if (snapshot.family === "freeze" || (snapshot.tags.includes("floor") && !snapshot.moveId && input.y < -0.25)) {
      request("cleanGetUp");
      return;
    }
    if (snapshot.moveId && snapshot.family === "toprock") {
      request(input.y > 0.1 ? "basicGoDown" : this.toprockChoice(input));
      return;
    }
    if (!snapshot.moveId && snapshot.tags.includes("floor")) {
      request("sixStep");
      return;
    }
    if (!snapshot.moveId && snapshot.tags.includes("standing")) {
      request("basicRock");
      return;
    }
    if (snapshot.family === "recovery") request("basicRock");
  }

  handleAdvancedAccent(request, input, snapshot) {
    if (snapshot.family === "toprock" && input.y > 0.2) request("basicGoDown");
    else if (snapshot.family === "freeze") request("cleanGetUp");
    else if (!snapshot.moveId && snapshot.tags.includes("floor")) request("sixStep");
    else if (!snapshot.moveId) request("basicRock");
  }

  toprockChoice(input) {
    if (input.y < -0.45) return "kickStep";
    if (input.y > 0.45) return "salsaStep";
    if (input.x < -0.35) return "indianStep";
    if (input.x > 0.35) return "crossStep";
    return "basicRock";
  }

  footworkChoice(input) {
    if (input.y < -0.45) return "cc";
    if (input.y > 0.45) return "coffeeGrinder";
    if (Math.abs(input.x) > 0.48) return "sweep";
    return "sixStep";
  }

  styleChoice(input, snapshot) {
    if (snapshot.family === "toprock" || snapshot.tags.includes("standing")) return this.toprockChoice(input);
    return this.footworkChoice(input);
  }

  powerChoice(input, stamina) {
    if (stamina < 16) return "backspin";
    if (input.y < -0.48 && stamina >= 28) return "flare";
    if (input.y > 0.55 && stamina >= 35) return "headspin";
    if (Math.abs(input.x) > 0.55) return "swipe";
    return "windmill";
  }

  freezeChoice(input) {
    if (input.y < -0.5) return "headstandFreeze";
    if (input.y > 0.5) return "turtleFreeze";
    if (Math.abs(input.x) > 0.5) return "chairFreeze";
    return "babyFreeze";
  }

  consumeSessionEvents(session, performer) {
    session.consumeEvents((event) => {
      this.emit(event.type, { performer, ...event });
      if (event.type === "invalid" || event.type === "buffered") this.setCallout(event.message);
      if (event.type === "moveStarted") {
        const callout = calloutForMove(event.moveId, event.timing);
        if (callout) this.setCallout(callout);
      }
      if (event.type === "moveCompleted" && performer === "player" && this.mode === "practice") {
        this.advancePracticeChain(event.moveId);
      }
      if (event.type === "moveFailed") this.setCallout("RECOVER!");
    });
  }

  advancePracticeChain(moveId) {
    const chain = goldenChainIds();
    if (moveId === chain[this.practiceChainIndex]) {
      this.practiceChainIndex += 1;
      if (this.practiceChainIndex >= chain.length) {
        this.practiceChainIndex = 0;
        this.emit("goldenChain", { message: "PURRFECT CHAIN!" });
        this.setCallout("PURRFECT!");
      }
    } else if (moveId === chain[0]) {
      this.practiceChainIndex = 1;
    }
  }

  advanceMode(beatSnapshot) {
    if (this.mode === "practice") return;
    const elapsed = beatSnapshot.beat - this.startBeat;
    if (this.mode === "freestyle" && elapsed >= 100) {
      this.completeSimulation();
      return;
    }
    if (this.mode !== "battle") return;
    const phaseElapsed = beatSnapshot.beat - this.phaseStartBeat;
    if (phaseElapsed < 32) return;
    const phase = BATTLE_PHASES[this.battlePhaseIndex];
    if (phase.performer === "player") {
      if (this.playerSession.current) this.playerSession.finishMove(beatSnapshot.beat);
      const breakdown = this.playerScorer.getBreakdown();
      this.playerRounds.push(breakdown);
      this.emit("roundCompleted", { performer: "player", round: phase.round, breakdown });
    } else {
      if (this.opponentSession.current) this.opponentSession.finishMove(beatSnapshot.beat);
      const breakdown = this.opponentScorer.getBreakdown();
      this.opponentRounds.push(breakdown);
      this.emit("roundCompleted", { performer: "opponent", round: phase.round, breakdown });
    }
    this.battlePhaseIndex += 1;
    if (this.battlePhaseIndex === NORMAL_BATTLE_PHASES && !this.preliminaryBattleIsTied()) {
      this.completeSimulation();
      return;
    }
    if (this.battlePhaseIndex >= BATTLE_PHASES.length) {
      this.completeSimulation();
      return;
    }
    this.beginNextBattlePhase(beatSnapshot);
  }

  beginNextBattlePhase(beatSnapshot) {
    this.phaseStartBeat = beatSnapshot.beat;
    const phase = BATTLE_PHASES[this.battlePhaseIndex];
    if (phase.performer === "player") {
      this.playerScorer = new RoundScorer({ targetPerCategory: 180 });
      this.playerSession.scorer = this.playerScorer;
      this.playerSession.reset({ beat: beatSnapshot.beat });
    } else {
      this.opponentScorer = new RoundScorer({ targetPerCategory: 180 });
      this.opponentSession.scorer = this.opponentScorer;
      this.opponentSession.reset({ beat: beatSnapshot.beat });
      this.ai = new DanceAI({ session: this.opponentSession, difficulty: "normal", seed: this.seed + this.battlePhaseIndex * 101 });
    }
    this.emit("roundStarted", {
      mode: "battle",
      performer: phase.performer,
      round: phase.round,
      tiebreak: Boolean(phase.tiebreak),
    });
    this.setCallout(phase.tiebreak
      ? phase.performer === "player" ? "TIEBREAK—YOUR ROUND!" : "TIEBREAK—MIKAN!"
      : phase.performer === "player" ? "YOUR ROUND!" : "MIKAN ANSWERS!");
  }

  completeSimulation() {
    this.complete = true;
    if (this.mode === "freestyle") {
      const breakdown = this.playerScorer.getBreakdown();
      this.emit("roundCompleted", { performer: "player", round: 1, breakdown });
      this.result = judgeRounds(breakdown);
    } else if (this.mode === "battle") {
      const player = combineRoundBreakdowns(this.playerRounds);
      const opponent = combineRoundBreakdowns(this.opponentRounds);
      this.result = judgeRounds(player, opponent);
    } else {
      this.result = judgeRounds(this.playerScorer.getBreakdown());
    }
    this.emit("complete", { result: this.result });
  }

  preliminaryBattleIsTied() {
    const player = combineRoundBreakdowns(this.playerRounds);
    const opponent = combineRoundBreakdowns(this.opponentRounds);
    return Boolean(player && opponent && judgeRounds(player, opponent).winner === "tie");
  }

  activePerformer() {
    if (this.mode !== "battle") return "player";
    return BATTLE_PHASES[this.battlePhaseIndex]?.performer ?? "player";
  }

  activeSession() {
    return this.activePerformer() === "player" ? this.playerSession : this.opponentSession;
  }

  recordReplay(beatSnapshot, input) {
    this.replay.push(Object.freeze({
      step: this.replay.length,
      beat: Math.round(beatSnapshot.beat * 1e6) / 1e6,
      performer: this.activePerformer(),
      input: Object.freeze({
        x: Math.round(input.x * 1000) / 1000,
        y: Math.round(input.y * 1000) / 1000,
        actionPressed: input.actionPressed,
        stylePressed: input.stylePressed,
        powerPressed: input.powerPressed,
        freezePressed: input.freezePressed,
      }),
      moveId: this.activeSession().current?.move.id ?? "",
    }));
  }

  considerHighlight(beatSnapshot) {
    if (this.activePerformer() !== "player") return;
    const session = this.playerSession;
    const move = session.current?.move;
    if (!move) return;
    const phase = session.localPhaseAt(beatSnapshot.beat);
    const accentProximity = 1 - Math.min(1, Math.min(beatSnapshot.beatPhase, 1 - beatSnapshot.beatPhase) * 4);
    const value = this.playerScorer.crowdHeat
      + move.difficulty * 28
      + accentProximity * 8
      + (move.family === "freeze" ? 10 : move.family === "power" ? 7 : 0)
      + phase * 0.5;
    if (value <= this.highlightValue) return;
    this.highlightValue = value;
    this.highlightSnapshot = this.getSnapshot(beatSnapshot);
  }

  getHighlightSnapshot() {
    return this.highlightSnapshot;
  }

  setCallout(message) {
    this.callout = message;
    this.calloutAge = 0;
  }

  emit(type, detail = {}) {
    this.events.push(Object.freeze({ type, ...detail }));
  }

  consumeEvents(callback) {
    while (this.events.length) callback(this.events.shift());
  }

  getSnapshot(beatSnapshot = this.lastSnapshot) {
    const activeSession = this.activeSession();
    const playerBreakdown = this.playerScorer.getBreakdown();
    const opponentBreakdown = this.opponentScorer.getBreakdown();
    const phase = this.mode === "battle" ? BATTLE_PHASES[this.battlePhaseIndex] : null;
    const elapsedBeats = beatSnapshot ? beatSnapshot.beat - (this.mode === "battle" ? this.phaseStartBeat : this.startBeat) : 0;
    const totalBeats = this.mode === "freestyle" ? 100 : this.mode === "battle" ? 32 : Infinity;
    return Object.freeze({
      mode: this.mode,
      started: this.started,
      complete: this.complete,
      performer: this.activePerformer(),
      character: this.activePerformer() === "player" ? this.character : this.opponentCharacter,
      waitingCharacter: this.activePerformer() === "player" ? this.opponentCharacter : this.character,
      dancer: activeSession.getSnapshot(),
      player: this.playerSession.getSnapshot(),
      opponent: this.opponentSession.getSnapshot(),
      beat: beatSnapshot,
      elapsedBeats,
      remainingBeats: Number.isFinite(totalBeats) ? Math.max(0, totalBeats - elapsedBeats) : Infinity,
      round: phase?.round ?? 1,
      battlePhase: this.battlePhaseIndex,
      crowdHeat: activeSession.scorer?.crowdHeat ?? 0,
      playerScore: playerBreakdown,
      opponentScore: opponentBreakdown,
      callout: this.callout,
      calloutAge: this.calloutAge,
      practiceChainIndex: this.practiceChainIndex,
      practiceNext: goldenChainIds()[this.practiceChainIndex],
      inputDevice: this.inputDevice,
      result: this.result ?? null,
      replayLength: this.replay.length,
    });
  }
}

function calloutForMove(moveId, timing) {
  if (timing === "perfect" && moveId.includes("Freeze")) return "PURRFECT!";
  if (moveId.includes("Freeze")) return "FROZEN!";
  if (["windmill", "flare", "headspin", "swipe"].includes(moveId)) return timing === "perfect" ? "COOKING!" : "POWER!";
  if (moveId === "sixStep" && timing === "perfect") return "PAW WORK!";
  if (timing === "perfect") return "CLEAN!";
  return "";
}
