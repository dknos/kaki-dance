import { clamp } from "../core/math.js";

export const BOARD_BOUNDS = Object.freeze({
  minX: -4.25,
  maxX: 4.25,
  minZ: -2.65,
  maxZ: 2.65,
});

export const BOARD_LINE_IDS = Object.freeze([
  "cornerToCorner",
  "aroundTheBoard",
  "bandstandTurn",
  "centerSweetSpot",
  "fourCornerFrolic",
  "backstepReturn",
  "fullHallCircuit",
]);

export class BoardLineTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.path = [];
    this.distance = 0;
    this.regions = new Set();
    this.corners = new Set();
    this.centerEntries = 0;
    this.bandEntries = 0;
    this.crossings = 0;
    this.completed = new Set();
    this.last = null;
    this.lastQuadrant = "";
    this.samples = 0;
  }

  update(position, { moveId = "", clean = true } = {}) {
    const point = clampToBoard(position);
    const region = boardRegion(point);
    if (this.last) {
      const segment = Math.hypot(point.x - this.last.x, point.z - this.last.z);
      this.distance += segment;
      if (Math.sign(point.x) !== Math.sign(this.last.x) && Math.abs(point.z) < 0.8) {
        this.crossings += 1;
      }
    }
    this.regions.add(region.id);
    if (region.corner) this.corners.add(region.id);
    if (region.id === "center" && this.last && boardRegion(this.last).id !== "center") this.centerEntries += 1;
    if (region.id === "band" && this.last && boardRegion(this.last).id !== "band") this.bandEntries += 1;
    const quadrant = `${point.x < 0 ? "L" : "R"}${point.z < 0 ? "F" : "B"}`;
    if (this.lastQuadrant && quadrant !== this.lastQuadrant) this.regions.add(`turn:${quadrant}`);
    this.lastQuadrant = quadrant;
    this.last = point;
    this.samples += 1;
    if (this.path.length === 0 || this.samples % 3 === 0) this.path.push(point);
    if (this.path.length > 240) this.path.shift();

    const newlyCompleted = [];
    const complete = (id, condition) => {
      if (condition && !this.completed.has(id)) {
        this.completed.add(id);
        newlyCompleted.push(id);
      }
    };
    complete("centerSweetSpot", clean && this.centerEntries >= 2);
    complete("cornerToCorner", clean && oppositeCorners(this.corners));
    complete("bandstandTurn", clean && this.bandEntries >= 1 && /turn|backstep/i.test(moveId));
    complete("fourCornerFrolic", clean && this.corners.size >= 4);
    complete("aroundTheBoard", clean && this.distance >= 12 && this.corners.size >= 3);
    complete("backstepReturn", clean && moveId === "backstep" && this.centerEntries >= 1);
    complete("fullHallCircuit", clean && this.distance >= 20 && this.corners.size >= 4 && this.bandEntries >= 1);
    return Object.freeze({
      position: point,
      region,
      resonance: region.resonance,
      newlyCompleted: Object.freeze(newlyCompleted),
      completed: Object.freeze([...this.completed]),
      distance: this.distance,
    });
  }

  getSnapshot() {
    return Object.freeze({
      distance: this.distance,
      completed: Object.freeze([...this.completed]),
      path: Object.freeze(this.path.map((value) => Object.freeze({ ...value }))),
      region: boardRegion(this.last ?? { x: 0, z: 0 }),
      crossings: this.crossings,
      figureEightCandidate: this.crossings >= 4 && this.distance >= 8,
    });
  }
}

export function clampToBoard(position) {
  return Object.freeze({
    x: clamp(Number(position?.x) || 0, BOARD_BOUNDS.minX, BOARD_BOUNDS.maxX),
    z: clamp(Number(position?.z) || 0, BOARD_BOUNDS.minZ, BOARD_BOUNDS.maxZ),
  });
}

export function boardRegion(position) {
  const point = clampToBoard(position);
  const centerDistance = Math.hypot(point.x, point.z);
  if (centerDistance < 0.82) return region("center", "Center sweet spot", 1.14, false, 0.62);
  if (point.z <= -2.05) return region("band", "Band edge", 1.05, false, 1);
  if (point.z >= 2.05) return region("crowd", "Crowd edge", 0.96, false, 0.2);
  if (Math.abs(point.x) >= 3.5 && Math.abs(point.z) >= 1.78) {
    return region(
      `${point.x < 0 ? "left" : "right"}-${point.z < 0 ? "band" : "crowd"}-corner`,
      "Turnaround corner",
      point.x < 0 ? 0.92 : 1.08,
      true,
      point.z < 0 ? 0.82 : 0.28,
    );
  }
  const boardIndex = Math.floor((point.x - BOARD_BOUNDS.minX) / 1.7);
  const resonance = [0.94, 1.03, 1.1, 0.98, 1.06][clamp(boardIndex, 0, 4)] ?? 1;
  return region(`board-${boardIndex + 1}`, `Board plank ${boardIndex + 1}`, resonance, false, clamp((-point.z + 2.65) / 5.3, 0, 1));
}

function region(id, label, resonance, corner, bandProximity) {
  return Object.freeze({ id, label, resonance, corner, bandProximity });
}

function oppositeCorners(corners) {
  return (
    (corners.has("left-band-corner") && corners.has("right-crowd-corner"))
    || (corners.has("right-band-corner") && corners.has("left-crowd-corner"))
  );
}
