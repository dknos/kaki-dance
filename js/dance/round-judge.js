import { SCORE_CATEGORIES } from "./scoring.js";

export function judgeRounds(player, opponent = null) {
  if (!opponent) {
    return Object.freeze({
      winner: player.total >= 70 ? "player" : "session",
      player,
      opponent: null,
      categoryWinners: Object.freeze({}),
      margin: player.total,
    });
  }
  const categoryWinners = {};
  let playerVotes = 0;
  let opponentVotes = 0;
  for (const category of SCORE_CATEGORIES) {
    const delta = player[category] - opponent[category];
    categoryWinners[category] = delta === 0 ? "tie" : delta > 0 ? "player" : "opponent";
    if (delta > 0) playerVotes += 1;
    if (delta < 0) opponentVotes += 1;
  }
  const totalDelta = player.total - opponent.total;
  const winner = playerVotes === opponentVotes
    ? totalDelta === 0 ? "tie" : totalDelta > 0 ? "player" : "opponent"
    : playerVotes > opponentVotes ? "player" : "opponent";
  return Object.freeze({
    winner,
    player,
    opponent,
    categoryWinners: Object.freeze(categoryWinners),
    votes: Object.freeze({ player: playerVotes, opponent: opponentVotes }),
    margin: Math.abs(totalDelta),
  });
}

export function combineRoundBreakdowns(rounds = []) {
  if (!rounds.length) return null;
  const result = {};
  for (const category of [...SCORE_CATEGORIES, "total"]) {
    result[category] = Math.round(rounds.reduce((sum, round) => sum + (round?.[category] ?? 0), 0) / rounds.length);
  }
  result.reasons = Object.freeze(rounds.flatMap((round) => round?.reasons ?? []).slice(0, 5));
  return Object.freeze(result);
}
