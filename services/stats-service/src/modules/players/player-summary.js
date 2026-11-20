function emptySummary() {
  return {
    importedMatches: 0, appearances: 0, unknownAppearances: 0,
    batting: {
      innings: 0, runs: 0, balls: 0, outs: 0, fours: 0, sixes: 0,
      highest: null, notOuts: 0, ducks: 0, fifties: 0, hundreds: 0,
      doubleHundreds: 0, tripleHundreds: 0, quadrupleHundreds: 0,
    },
    bowling: {
      innings: 0, wickets: 0, runs: 0, balls: 0, best: null,
      fourWicketHauls: 0, fiveWicketHauls: 0, tenWicketMatches: 0, maidens: 0,
    },
  };
}

function addMatch(summary, player) {
  summary.importedMatches++;
  if (player.appearance === true) summary.appearances++;
  if (player.appearance == null) summary.unknownAppearances++;

  if (player.batting) {
    const { runs, ballsFaced, isOut, fours, sixes } = player.batting;
    const batting = summary.batting;
    batting.innings++;
    batting.runs += runs;
    batting.balls += ballsFaced;
    batting.outs += Number(isOut);
    batting.fours += fours;
    batting.sixes += sixes;
    batting.notOuts += Number(!isOut);
    batting.ducks += Number(isOut && runs === 0);
    batting.fifties += Number(runs >= 50 && runs < 100);
    batting.hundreds += Number(runs >= 100);
    batting.doubleHundreds += Number(runs >= 200);
    batting.tripleHundreds += Number(runs >= 300);
    batting.quadrupleHundreds += Number(runs >= 400);
    if (!batting.highest || runs > batting.highest.runs ||
      (runs === batting.highest.runs && batting.highest.isOut && !isOut)) {
      batting.highest = { runs, isOut };
    }
  }

  if (player.bowling) {
    const { wickets, runsConceded, legalBalls, maidens } = player.bowling;
    const bowling = summary.bowling;
    bowling.innings++;
    bowling.wickets += wickets;
    bowling.runs += runsConceded;
    bowling.balls += legalBalls;
    bowling.fourWicketHauls += Number(wickets === 4);
    bowling.fiveWicketHauls += Number(wickets >= 5);
    bowling.tenWicketMatches += Number(wickets >= 10);
    bowling.maidens = bowling.maidens == null || maidens == null
      ? null
      : bowling.maidens + maidens;
    if (!bowling.best || wickets > bowling.best.wickets ||
      (wickets === bowling.best.wickets && runsConceded < bowling.best.runs)) {
      bowling.best = { wickets, runs: runsConceded };
    }
  }
}

function withRates(summary) {
  const { batting, bowling } = summary;
  batting.average = batting.outs ? batting.runs / batting.outs : null;
  batting.strikeRate = batting.balls ? batting.runs * 100 / batting.balls : null;
  bowling.average = bowling.wickets ? bowling.runs / bowling.wickets : null;
  bowling.economy = bowling.balls ? bowling.runs * 6 / bowling.balls : null;
  bowling.strikeRate = bowling.wickets ? bowling.balls / bowling.wickets : null;
  return summary;
}

export async function summarizePlayer(matches) {
  const summary = emptySummary();
  const byFormat = new Map();
  for await (const { projection } of matches) {
    const [player] = projection.players;
    addMatch(summary, player);
    if (typeof projection.format !== "string" || !projection.format) continue;
    if (!byFormat.has(projection.format)) byFormat.set(projection.format, emptySummary());
    addMatch(byFormat.get(projection.format), player);
  }
  return {
    ...withRates(summary),
    byFormat: Object.fromEntries([...byFormat].map(([format, totals]) => [format, withRates(totals)])),
  };
}
