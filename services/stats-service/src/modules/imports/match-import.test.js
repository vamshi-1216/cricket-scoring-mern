import assert from "node:assert/strict";
import test from "node:test";
import { buildMatchProjection } from "./match-projection.js";
import { loadMatchSource } from "./match-source.js";

const id = (value) => String(value).padStart(24, "0");
const [matchId, teamAId, teamBId, batter, runOut, reserve, bowler, partner] =
  Array.from({ length: 8 }, (_, index) => id(index + 1));
const config = {
  MATCH_SERVICE_URL: "http://match.test",
  SCORING_SERVICE_URL: "http://scoring.test",
  INTERNAL_SERVICE_SECRET: "fixture-secret",
};

function fixture({ changed = false, legacy = false, gap = false, corrected = false } = {}) {
  const match = {
    _id: matchId, format: "T20", status: "completed", inningsPerTeam: 1, teamAId, teamBId,
    result: { outcome: "WIN", winnerTeamId: teamAId, finalizedAt: "2026-11-19T01:00:00Z" },
    playingXI: legacy ? undefined : {
      isConfirmed: true, revision: 1,
      teamAPlayerIds: [batter, runOut, reserve], teamBPlayerIds: [bowler, partner],
    },
  };
  const completeness = { complete: true };
  const first = {
    _id: id(9), matchId, completeness, sourceRevision: corrected ? 3 : 2, inningsNumber: 1,
    battingTeamId: teamAId, bowlingTeamId: teamBId, runs: 4, wickets: 1, legalBalls: 2,
    battingFigures: [{ playerId: batter, runs: 4, ballsFaced: 2, fours: 1, sixes: 0 }],
    bowlingFigures: [{ playerId: bowler, legalBalls: 2, wickets: 0, runsConceded: 4 }],
  };
  const second = {
    _id: id(10), matchId, completeness, sourceRevision: 1, inningsNumber: 2,
    battingTeamId: teamBId, bowlingTeamId: teamAId, runs: 0, wickets: 0, legalBalls: 0,
    battingFigures: [], bowlingFigures: [],
  };
  const delivery = {
    matchId, inningsId: first._id, isLegalBall: true, bowlerId: bowler,
    strikerId: batter, nonStrikerId: runOut,
  };
  let exports = 0;
  return async (url, { headers }) => {
    const reply = (data) => Response.json({ success: true, data });
    if (url.host === "match.test") return reply(match);
    assert.equal(headers["X-Internal-Service-Secret"], config.INTERNAL_SERVICE_SECRET);
    if (url.pathname.endsWith("/export")) {
      exports += 1;
      const sourceRevision = changed && exports === 2 ? 3 : first.sourceRevision;
      return reply({ matchId, allInningsComplete: true, inningsCount: 2,
        innings: [{ ...first, sourceRevision }, second] });
    }
    const isFirst = url.pathname.includes(first._id);
    const isNextPage = url.searchParams.has("cursor");
    const source = isFirst ? first : second;
    const deliveries = isFirst ? [
      isNextPage
        ? { ...delivery, sequence: gap ? 3 : 2, totalRuns: 0,
            dismissedPlayerId: runOut, dismissalType: "RUN_OUT" }
        : { ...delivery, sequence: 1, totalRuns: 4 },
    ] : [];
    const hasMore = isFirst && !isNextPage;
    return reply({
      matchId, inningsId: source._id, sourceRevision: source.sourceRevision, completeness, deliveries,
      pagination: { returnedCount: deliveries.length, hasMore, nextCursor: hasMore ? "second" : null },
    });
  };
}

async function project(options) {
  const { match, inningsSources } = await loadMatchSource(matchId, config, fixture(options));
  return buildMatchProjection(match, inningsSources);
}

test("imports all pages and counts appearances and zero-ball dismissals", async () => {
  const projection = await project();
  const players = new Map(projection.players.map((player) => [player.playerId, player]));
  assert.deepEqual(projection.innings.map(({ runs }) => runs), [4, 0]);
  assert.equal(players.get(batter).batting.runs, 4);
  assert.equal(players.get(reserve).appearance, true);
  assert.equal(players.get(reserve).batting, null);
  assert.deepEqual(players.get(runOut).batting, {
    runs: 0, ballsFaced: 0, fours: 0, sixes: 0, isOut: true, dismissalType: "RUN_OUT",
  });
  assert.deepEqual(players.get(bowler).bowling, { runsConceded: 4, legalBalls: 2, wickets: 0 });
  assert.deepEqual(await project(), projection);
});

test("historical matches without confirmed XI retain figures with unknown appearances", async () => {
  const projection = await project({ legacy: true });
  assert.equal(projection.lineups, null);
  assert.equal(projection.players.length, 3);
  assert.ok(projection.players.every(({ appearance }) => appearance === null));
});

test("rejects a revision change after the delivery pages were read", async () => {
  await assert.rejects(project({ changed: true }), { statusCode: 409 });
});

test("rejects incomplete delivery history", async () => {
  await assert.rejects(project({ gap: true }), /Delivery history is incomplete/);
});

test("HTTP imports require authentication and publish projections through the stats endpoints", async (t) => {
  Object.assign(process.env, config, {
    MONGODB_URI: "mongodb://localhost:27017/stats-test",
    INTERNAL_SERVICE_SECRET: "test-secret-that-is-at-least-32-characters",
  });
  const { default: app } = await import("../../app.js");
  const { MatchProjection } = await import("./match-projection.model.js");
  let stored;
  t.mock.method(MatchProjection, "findById", () => ({
    select: () => ({ lean: async () => stored }),
  }));
  t.mock.method(MatchProjection, "find", (filter, fields) => {
    if (fields) {
      assert.deepEqual(fields, { "projection.players.$": 1, "projection.format": 1, _id: 0 });
      const player = stored?.projection.players.find(
        ({ playerId }) => playerId === filter["projection.players.playerId"]
      );
      return { lean: () => ({ cursor: () => player ? [{
        projection: { format: stored.projection.format, players: [player] },
      }] : [] }) };
    }
    return {
      sort: () => ({
        limit: () => ({
          select: () => ({ lean: async () => stored ? [stored] : [] }),
        }),
      }),
    };
  });
  t.mock.method(MatchProjection, "exists", async ({ fingerprint }) =>
    stored?.fingerprint === fingerprint);
  const create = t.mock.method(MatchProjection, "create", async (document) => {
    assert.equal(stored, undefined);
    stored = document;
  });
  const update = t.mock.method(MatchProjection, "updateOne", async (filter, { $set }) => {
    assert.equal(filter.revision, stored.revision);
    stored = { ...stored, ...$set };
    return { matchedCount: 1 };
  });
  const realFetch = globalThis.fetch;
  let sourceOptions;
  let source;
  t.mock.method(globalThis, "fetch", (url, options) => {
    assert.equal(options.headers["X-Internal-Service-Secret"],
      url.host === "scoring.test" ? process.env.INTERNAL_SERVICE_SECRET : undefined);
    const headers = url.host === "scoring.test"
      ? { "X-Internal-Service-Secret": config.INTERNAL_SERVICE_SECRET }
      : {};
    return source(url, { headers });
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const url = `${base}/internal/stats/matches/${matchId}/import`;
  const request = (secret) => {
    source = fixture(sourceOptions);
    return realFetch(url, {
      method: "POST",
      headers: secret ? { "X-Internal-Service-Secret": secret } : {},
    });
  };

  const secret = process.env.INTERNAL_SERVICE_SECRET;
  const matchesUrl = `${base}/stats/matches`;
  assert.deepEqual((await (await realFetch(matchesUrl)).json()).data, []);
  assert.equal((await realFetch(`${matchesUrl}/${matchId}`)).status, 404);
  assert.equal((await request()).status, 401);
  const created = await request(secret);
  assert.equal(created.status, 201);
  assert.equal((await created.json()).data.outcome, "created");
  assert.equal((await (await request(secret)).json()).data.outcome, "unchanged");
  assert.equal(create.mock.callCount(), 1);
  assert.equal(update.mock.callCount(), 0);
  const list = await (await realFetch(matchesUrl)).json();
  assert.deepEqual(list.data.map((match) => match.matchId), [matchId]);
  assert.equal(list.data[0].format, "T20");
  assert.equal(list.nextCursor, null);
  const details = await (await realFetch(`${matchesUrl}/${matchId}`)).json();
  assert.deepEqual(details.data, stored.projection);
  assert.equal((await realFetch(`${matchesUrl}?cursor=invalid`)).status, 400);
  const playerStats = `${base}/stats/players`;
  const { data: career } = await (await realFetch(`${playerStats}/${batter}`)).json();
  assert.equal(career.appearances, 1);
  assert.equal(career.batting.runs, 4);
  assert.equal(career.byFormat.T20.batting.runs, 4);
  assert.equal((await realFetch(`${playerStats}/invalid`)).status, 400);
  const { data: emptyCareer } = await (await realFetch(`${playerStats}/${id(99)}`)).json();
  assert.equal(emptyCareer.importedMatches, 0);

  sourceOptions = { corrected: true };
  assert.equal((await (await request(secret)).json()).data.outcome, "updated");
  assert.equal(stored.projection.innings[0].sourceRevision, 3);
  sourceOptions = { gap: true };
  assert.equal((await request(secret)).status, 409);
  assert.equal(update.mock.callCount(), 1);
});
