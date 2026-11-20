import assert from "node:assert/strict";
import test from "node:test";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/scoring_unit_tests";
const { Innings } = await import("../modules/innings/innings.model.js");
const { Delivery } = await import("../modules/deliveries/delivery.model.js");
const { getAwards, getMatchInnings, getScoreSummaries } =
  await import("../modules/matches/match.controller.js");

const matchId = "507f1f77bcf86cd799439011";
const teamAId = "507f1f77bcf86cd799439012";
const teamBId = "507f1f77bcf86cd799439013";
const batterId = "507f1f77bcf86cd799439014";

function mockMatchData(t, secondStatus = "COMPLETED") {
  const original = { fetch: globalThis.fetch, innings: Innings.find, deliveries: Delivery.find };
  let matchFetched = false;
  globalThis.fetch = async (url) => {
    assert.ok(url.endsWith(`/api/v1/matches/${matchId}`));
    matchFetched = true;
    return new Response(JSON.stringify({
      success: true,
      data: { _id: matchId, teamAId, teamBId, teamAPlayerIds: [batterId], teamBPlayerIds: [] },
    }));
  };
  const innings = [
    {
      matchId, inningsNumber: 1, status: "COMPLETED",
      battingTeamId: teamAId, bowlingTeamId: teamBId,
      battingFigures: [{ playerId: batterId, runs: 6, ballsFaced: 1, sixes: 1, isOut: false }],
    },
    {
      matchId, inningsNumber: 2, status: secondStatus,
      battingTeamId: teamBId, bowlingTeamId: teamAId, battingFigures: [],
    },
  ];
  Innings.find = () => ({ sort: () => ({ lean: async () => innings }) });
  Delivery.find = () => ({ sort: () => ({ lean: async () => [] }) });
  t.after(() => {
    globalThis.fetch = original.fetch;
    Innings.find = original.innings;
    Delivery.find = original.deliveries;
  });
  return () => matchFetched;
}

test("awards controller loads the match and returns calculated awards", async (t) => {
  const matchFetched = mockMatchData(t);
  let body;
  const res = {
    status(code) { assert.equal(code, 200); return this; },
    json(value) { body = value; },
  };
  await getAwards({ params: { matchId } }, res, (error) => { throw error; });
  assert.equal(matchFetched(), true);
  assert.equal(body.success, true);
  assert.ok(body.data.scoringVersion >= 1);
  assert.equal(body.data.bestBatsman[0].playerId, batterId);
  assert.ok(body.data.bestBatsman[0].points > 0);
});

test("awards controller rejects unfinished innings instead of returning null awards", async (t) => {
  mockMatchData(t, "IN_PROGRESS");
  let failure;
  await getAwards({ params: { matchId } }, {
    status() { assert.fail("An unfinished match cannot return successful awards"); },
  }, (error) => { failure = error; });
  assert.equal(failure.statusCode, 409);
  assert.match(failure.message, /Both innings must be completed/);
});

test("innings list endpoint returns its records directly in data", async (t) => {
  mockMatchData(t);
  let body;
  await getMatchInnings({ params: { matchId } }, {
    status(code) { assert.equal(code, 200); return this; },
    json(value) { body = value; },
  }, (error) => { throw error; });
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data));
  assert.equal(body.data.length, 2);
  assert.equal(body.data[1].inningsNumber, 2);
});

test("score summaries batch match IDs and format partial overs", async (t) => {
  const secondMatchId = "507f1f77bcf86cd799439015";
  const innings = [
    { matchId, battingTeamId: teamAId, inningsNumber: 1, runs: 53, wickets: 2, legalBalls: 25 },
    { matchId: secondMatchId, battingTeamId: teamBId, inningsNumber: 1, runs: 70, wickets: 4, legalBalls: 36 },
  ];
  const find = t.mock.method(Innings, "find", (filter) => {
    assert.deepEqual(filter.matchId.$in.map(String), [matchId, secondMatchId]);
    return {
      select(fields) {
        assert.equal(fields, "matchId battingTeamId inningsNumber runs wickets legalBalls -_id");
        return this;
      },
      sort() { return this; },
      lean: async () => innings,
    };
  });
  let body;
  const response = {
    set() { return this; },
    json(value) { body = value; },
  };
  await getScoreSummaries({ query: { ids: `${matchId},${secondMatchId}` } }, response,
    (error) => { throw error; });
  assert.deepEqual(body.data.map(({ overs }) => overs), ["4.1", "6.0"]);

  await getScoreSummaries({ query: { ids: "invalid" } }, response, (error) => {
    assert.equal(error.statusCode, 400);
  });
  assert.equal(find.mock.callCount(), 1);
});
