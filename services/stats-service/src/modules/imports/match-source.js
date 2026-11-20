import { ServiceError } from "../../utils/service-error.js";
import { getMatchSnapshot, objectIdPattern } from "./match-projection.js";

function incomplete(message) {
  return new ServiceError(message, 409, "INCONSISTENT_MATCH_SOURCE");
}

async function readSource(baseUrl, path, service, headers, fetchSource) {
  try {
    const response = await fetchSource(new URL(path, baseUrl), {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404 && service === "Match Service") {
      throw new ServiceError("Match was not found.", 404, "MATCH_NOT_FOUND");
    }
    if (response.status === 404 || response.status === 409) {
      throw incomplete("Source changed or is incomplete. Retry the match import.");
    }
    if (response.ok) {
      const body = await response.json();
      if (body?.success === true && body.data) return body.data;
    }
  } catch (error) {
    if (error instanceof ServiceError) throw error;
  }
  throw new ServiceError(`${service} could not supply match data.`, 502, "MATCH_SOURCE_UNAVAILABLE");
}

export async function loadMatchSource(matchId, config, fetchSource = fetch) {
  const matchPath = `/api/v1/matches/${matchId}`;
  const scoringPath = `/api/v1/internal/stats/matches/${matchId}`;
  const headers = { "X-Internal-Service-Secret": config.INTERNAL_SERVICE_SECRET };
  const readMatch = async () => getMatchSnapshot(
    await readSource(config.MATCH_SERVICE_URL, matchPath, "Match Service", {}, fetchSource),
    matchId
  );
  const readScoring = (path) =>
    readSource(config.SCORING_SERVICE_URL, path, "Scoring Service", headers, fetchSource);

  const match = await readMatch();
  const initial = await readScoring(`${scoringPath}/export`);
  if (initial.matchId !== matchId || initial.allInningsComplete !== true ||
      initial.inningsCount !== 2 || !Array.isArray(initial.innings) ||
      initial.innings.length !== 2) {
    throw incomplete("Expected two complete innings in the scoring export.");
  }

  const inningsSources = [];
  for (const source of initial.innings) {
    if (source?.matchId !== matchId || typeof source._id !== "string" ||
        !objectIdPattern.test(source._id) || source.completeness?.complete !== true ||
        !Number.isSafeInteger(source.sourceRevision) || source.sourceRevision < 0) {
      throw incomplete("Scoring export contains invalid innings metadata.");
    }
    const deliveries = [];
    const seenCursors = new Set();
    let cursor = null;
    do {
      const query = cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`;
      const page = await readScoring(`${scoringPath}/innings/${source._id}/deliveries${query}`);
      const pagination = page.pagination;
      if (page.matchId !== matchId || page.inningsId !== source._id ||
          page.sourceRevision !== source.sourceRevision || page.completeness?.complete !== true ||
          !Array.isArray(page.deliveries) || pagination?.returnedCount !== page.deliveries.length ||
          page.deliveries.some((delivery) => delivery?.matchId !== matchId ||
            delivery.inningsId !== source._id)) {
        throw incomplete("Delivery page does not match the innings export.");
      }
      cursor = pagination.nextCursor;
      if (cursor === null ? pagination.hasMore !== false :
          (pagination.hasMore !== true || typeof cursor !== "string" || !cursor ||
            seenCursors.has(cursor) || page.deliveries.length === 0)) {
        throw incomplete("Invalid delivery pagination.");
      }
      if (cursor !== null) seenCursors.add(cursor);
      deliveries.push(...page.deliveries);
    } while (cursor !== null);
    inningsSources.push({ source, deliveries });
  }

  const [latestMatch, latestScoring] = await Promise.all([
    readMatch(),
    readScoring(`${scoringPath}/export`),
  ]);
  if (JSON.stringify(match) !== JSON.stringify(latestMatch) ||
      latestScoring.matchId !== matchId || latestScoring.allInningsComplete !== true ||
      latestScoring.innings?.length !== initial.innings.length ||
      initial.innings.some((source, index) => {
        const latest = latestScoring.innings[index];
        return latest?._id !== source._id || latest.sourceRevision !== source.sourceRevision;
      })) {
    throw incomplete("Source changed during import. Retry the match import.");
  }
  return { match, inningsSources };
}
