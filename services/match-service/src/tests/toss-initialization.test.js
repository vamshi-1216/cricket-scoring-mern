import assert from "node:assert/strict";
import test from "node:test";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/match_unit_tests";
const { Match } = await import("../modules/matches/match.model.js");
const { updateMatch } = await import("../modules/matches/match.service.js");

const matchId = "507f1f77bcf86cd799439011";
const userId = "507f1f77bcf86cd799439012";
const teamAId = "507f1f77bcf86cd799439013";
const teamBId = "507f1f77bcf86cd799439014";
const toss = { tossWinnerId: teamAId, tossDecision: "bat", battingFirstId: teamAId };

function mockDependencies(t, savedToss, inningsExist) {
  const original = {
    findById: Match.findById,
    findOneAndUpdate: Match.findOneAndUpdate,
    fetch: globalThis.fetch,
  };
  const match = {
    _id: matchId,
    status: "scheduled",
    teamAId,
    teamBId,
    scoringAccess: { ownerId: userId, activeScorerId: userId },
    ...savedToss,
    async save() {},
  };
  const requests = [];
  Match.findById = async () => match;
  Match.findOneAndUpdate = () => ({
    lean: async () => ({ ...match, status: "in_progress" }),
  });
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const innings = { _id: "507f1f77bcf86cd799439015", matchId };
    const data = options.method === "POST"
      ? { innings, created: !inningsExist }
      : inningsExist ? [innings] : [];
    return new Response(JSON.stringify({ success: true, data }), {
      status: options.method === "POST" ? 201 : 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    Match.findById = original.findById;
    Match.findOneAndUpdate = original.findOneAndUpdate;
    globalThis.fetch = original.fetch;
  });
  return requests;
}

test("saving a toss accepts scoring's nested innings response", async (t) => {
  const requests = mockDependencies(t, {}, false);
  const result = await updateMatch(matchId, toss, userId, "access_token=test");
  assert.equal(result.status, "in_progress");
  const initialization = requests.find(({ options }) => options.method === "POST");
  assert.equal(initialization.options.headers.Cookie, "access_token=test");
});

test("retrying the saved toss recovers an already initialized innings", async (t) => {
  const requests = mockDependencies(t, toss, true);
  const result = await updateMatch(matchId, toss, userId, "access_token=test");
  assert.equal(result.status, "in_progress");
  assert.equal(requests.filter(({ options }) => options.method === "POST").length, 1);
});

test("changing a toss remains blocked when innings already exist", async (t) => {
  mockDependencies(t, toss, true);
  await assert.rejects(
    updateMatch(matchId, { ...toss, tossDecision: "bowl" }, userId, "access_token=test"),
    (error) => error.statusCode === 409 && error.message.includes("cannot be changed")
  );
});
