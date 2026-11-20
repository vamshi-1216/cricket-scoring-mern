import assert from "node:assert/strict";
import test from "node:test";
import { summarizePlayer } from "./player-summary.js";

const match = (player, format = "T20") => ({ projection: { format, players: [player] } });

test("career rates use cumulative balls, dismissals, and wickets", async () => {
  const summary = await summarizePlayer([
    match({
      appearance: true,
      batting: { runs: 24, ballsFaced: 12, isOut: false, fours: 3, sixes: 1 },
      bowling: { runsConceded: 12, legalBalls: 12, wickets: 2, maidens: 1 },
    }),
    match({
      appearance: null,
      batting: { runs: 6, ballsFaced: 8, isOut: true, fours: 0, sixes: 0 },
      bowling: { runsConceded: 24, legalBalls: 6, wickets: 0 },
    }, "ODI"),
    match({ appearance: true }),
  ]);

  assert.equal(summary.importedMatches, 3);
  assert.equal(summary.appearances, 2);
  assert.equal(summary.unknownAppearances, 1);
  assert.deepEqual(summary.batting, {
    innings: 2, runs: 30, balls: 20, outs: 1, fours: 3, sixes: 1,
    average: 30, strikeRate: 150,
    highest: { runs: 24, isOut: false },
    notOuts: 1, ducks: 0, fifties: 0, hundreds: 0, doubleHundreds: 0,
    tripleHundreds: 0, quadrupleHundreds: 0,
  });
  assert.deepEqual(summary.bowling, {
    innings: 2, wickets: 2, runs: 36, balls: 18, average: 18, economy: 12, strikeRate: 9,
    best: { wickets: 2, runs: 12 }, maidens: null, fourWicketHauls: 0,
    fiveWicketHauls: 0, tenWicketMatches: 0,
  });
  assert.equal(summary.byFormat.T20.batting.runs, 24);
  assert.equal(summary.byFormat.T20.bowling.maidens, 1);
  assert.equal(summary.byFormat.ODI.batting.runs, 6);
  assert.equal(summary.byFormat.ODI.bowling.maidens, null);
});

test("returns unknown rates when the denominator is zero", async () => {
  const summary = await summarizePlayer([]);
  assert.equal(summary.importedMatches, 0);
  assert.equal(summary.batting.average, null);
  assert.equal(summary.batting.strikeRate, null);
  assert.equal(summary.bowling.average, null);
  assert.equal(summary.bowling.economy, null);
});
