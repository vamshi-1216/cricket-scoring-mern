# Stats Service Statistical Specification

## 1. Scope and objectives

This document defines a Cricbuzz-style organization and explicit calculation
contract for a future Stats Service. Cricbuzz is a reference for familiar
categories and presentation only; this project does not claim to reproduce
Cricbuzz's internal or proprietary rules.

Stats Service will own derived statistical read models, not the underlying
player, team, match, or scoring records. It must not replace Player Service
profile management, Team Service roster management, Match Service lifecycle
and results, or Scoring Service delivery entry and scorecards.

The specification separates:

- **Official career and record statistics:** sourced only from eligible,
  completed matches.
- **Live statistics:** provisional values kept outside official career
  aggregates.
- **Source-supported values:** directly stored or deterministically derivable
  from source records.
- **Unavailable values:** withheld or explicitly marked unavailable if
  required source data is missing or ambiguous.

Calculation definitions below are recommendations for this project's
statistical contract, not claims that current source services already
calculate or persist every value. No Stats Service implementation or API
currently exists.

## 2. Existing source data audit

The source of truth for this audit is the repository implementation, not
planned features in the README.

### Auth Service

Auth Service stores users, authentication providers, contact verification,
account status, and sessions. The user model has no `playerId`, team ID, or
player/team membership field. Auth user IDs identify match creators and
scorers; they are not player IDs. Stats must not join an Auth user to a player
by name, email, or an assumed matching ObjectId.

Relevant source: [user model](../../services/auth-service/src/modules/users/user.model.js),
[user routes](../../services/auth-service/src/modules/users/user.routes.js),
[app routes and health handlers](../../services/auth-service/src/app.js).

### Player Service

Player Service owns player identity and profile attributes: Mongo ObjectId,
name, age, batting style, bowling style, role, one optional `teamId`,
`isActive`, and timestamps. Its API is mounted at `/api/v1/players`:

- `POST /` creates a player.
- `GET /` returns all players; there is no query filter or pagination.
- `GET /:playerId` reads one player.
- `PATCH /:playerId` updates profile attributes.
- `DELETE /:playerId` sets `isActive` false; it is a soft deactivation.

The schemas and handlers are in [player model](../../services/player-service/src/modules/players/player.model.js),
[player validation](../../services/player-service/src/modules/players/player.validation.js),
[player routes](../../services/player-service/src/modules/players/player.routes.js),
and [player service](../../services/player-service/src/modules/players/player.service.js).

`teamId` in the player record is not a reliable historical match-team
relationship. Team Service separately maintains its own `playerIds` array,
and its roster operations do not update Player Service's `teamId`.

### Team Service

Team Service stores team ObjectId, name, short name, description, home ground,
roster `playerIds`, captain, vice-captain, active state, and timestamps.
Its `/api/v1/teams` routes support create, list, get, update, deactivate, add
players, and remove a player. Team Service validates roster additions by
calling Player Service over HTTP. Team roster membership is mutable and is
not a match appearance record.

Relevant source: [team model](../../services/team-service/src/modules/teams/team.model.js),
[team validation](../../services/team-service/src/modules/teams/team.validation.js),
[team routes](../../services/team-service/src/modules/teams/team.routes.js),
and [team service](../../services/team-service/src/modules/teams/team.service.js).

### Match Service

Match records contain team IDs, match format, scheduled overs, innings per
team, `teamAPlayerIds`/`teamBPlayerIds`, captains, wicket-keepers, venue, date,
toss data, lifecycle status, creator/scoring access, cancellation data, and
final result. The squad arrays are validated as non-empty and duplicate-free
when supplied, but are not constrained to exactly 11 players and are not
explicitly distinguished as wider squad versus official playing XI. A
confirmed playing XI is mandatory source data for official appearance
statistics; a wider squad is not a substitute.

Match status is `scheduled`, `in_progress`, `completed`, or `cancelled`.
Result outcome supports `WIN`, `TIE`, and `NO_RESULT`; a win stores winner
team and a runs/wickets margin. Match finalization currently requires exactly
two ordered completed innings, validates their team order and chase target,
then calculates a win or tie. The result schema permits `NO_RESULT`, but the
observed result-calculation path does not produce one. Cancellation is a
separate lifecycle state, not a no-result result.

Match routes under `/api/v1/matches` include create, list (with status/team
filters and pagination), get by ID, update, scoring-access/permit operations,
cancel, and internal finalization. Match creation validates the teams via
Team Service. Finalization calls Scoring Service to calculate awards, then
persists result and awards.

Relevant source: [match model](../../services/match-service/src/modules/matches/match.model.js),
[match validation](../../services/match-service/src/modules/matches/match.validation.js),
[match routes](../../services/match-service/src/modules/matches/match.routes.js),
and [match service](../../services/match-service/src/modules/matches/match.service.js).

### Scoring Service

Scoring Service owns innings, deliveries, scoring figures and scoring
operation records. Innings contain match and innings IDs/numbers, batting and
bowling team IDs, current batter/bowler state, runs, wickets, legal balls,
target, extras, batting and bowling figures, retirement events, end history,
completion reason/time, status, and finalization status.

Batting figures store player ID, runs, balls faced, fours, sixes, `isOut`,
`dismissalType`, and `retiredHurt`. Bowling figures store player ID, runs
conceded, legal balls, bowler-credited wickets, wides, and no-balls; they do
not store maidens. Delivery records store ordered `sequence`, striker,
non-striker and bowler IDs, event type, bat runs, extras, total runs, legal
ball flag, completed runs, dismissal and dismissed player, fielding
attribution, and a before-state snapshot. Extras are separated into wides,
no-balls, byes, leg-byes, and penalty runs.

Dismissal types include `BOWLED`, `CAUGHT`, `LBW`, `RUN_OUT`, `STUMPED`,
`HIT_WICKET`, `OBSTRUCTING_FIELD`, and `HIT_BALL_TWICE`. The scoring rules
credit the bowler for BOWLED, CAUGHT, LBW, STUMPED, and HIT_WICKET only.
Caught and stumped dismissals require one fielder. Run-outs require a
`DIRECT_HIT` or `ASSISTED` classification and one or more fielder IDs, but
the current source does not identify a direct-hit player or preserve
per-fielder roles for assisted run-outs.

Retired Hurt and resume are represented in `retirementEvents` with event
type, player, replacement where applicable, position, reason, operation ID,
and timestamp. Delivery history has its own per-innings sequence, but
retirement events, batter replacement, and innings-end events do not share
that sequence.

Scoring read routes include:

- `GET /api/v1/matches/:matchId/innings`
- `GET /api/v1/matches/:matchId/scorecard` (latest innings)
- `GET /api/v1/matches/:matchId/innings/:inningsId/deliveries`
- `GET /api/v1/innings/:inningsId`

Innings and delivery collections are currently returned without pagination.
Delivery history is sorted by sequence and omits internal creator and
operation IDs. Award calculation reads match, innings, and deliveries;
Match finalization persists Man of the Match, Best Batsman, and Best Bowler
arrays and their scoring-point breakdowns.

Relevant source: [innings model](../../services/scoring-service/src/modules/innings/innings.model.js),
[delivery model](../../services/scoring-service/src/modules/deliveries/delivery.model.js),
[scoring rules](../../services/scoring-service/src/modules/scoring/scoring.rules.js),
[scoring engine](../../services/scoring-service/src/modules/scoring/scoring.engine.js),
[innings routes](../../services/scoring-service/src/modules/innings/innings.routes.js),
[match routes](../../services/scoring-service/src/modules/matches/match.routes.js),
[award calculator](../../services/scoring-service/src/modules/awards/awards.calculator.js),
and [award constants](../../services/scoring-service/src/modules/awards/awards.constants.js).

### Existing inter-service communication

Observed integration uses direct HTTP `fetch` calls: Team calls Player;
Match calls Team, Auth, and Scoring; Scoring calls Match for match
configuration, scoring authorization, permits, and finalization. Selected
internal operations use `X-Internal-Service-Secret`. No event broker,
publisher, consumer, event bus, or transactional outbox was found. Existing
innings and delivery read endpoints are not protected by the internal-service
middleware; this should be addressed before using them as a Stats ingestion
contract.

## 3. Statistical categories and 4. definitions and formulas

### Common rules and notation

- IDs are service-owned Mongo ObjectIds. Store and aggregate by stable player,
  team, match, and innings IDs, not display names.
- `eligible(match)` means `match.status === "completed"`, a valid persisted
  final result, and complete, validated source innings for the supported
  match flow. Exclude `scheduled`, `in_progress`, `cancelled`, pending or
  failed finalization, and incomplete/corrupt source records from official
  career aggregates.
- A `MANUAL_END` innings is completed and its valid figures remain eligible
  when its match later meets the completed-match rule. The manual end is not
  itself a reason to discard scoring data.
- Appearance means a player is in the confirmed official playing XI for a
  team in that match. This confirmed XI is mandatory source data for official
  appearance statistics. Count every confirmed XI player exactly once per
  eligible match, including players with no batting, bowling, or fielding
  participation. Wider-squad membership alone is not an appearance. The
  current source model does not provide a confirmed XI; such matches cannot
  supply authoritative appearances until Match Service records one.
- `null` rates mean the denominator is zero or source data is insufficient;
  they do not mean zero performance. Counts may be zero.
- For percentages and rates, retain full precision for aggregation and round
  only for display. Display precision is a product decision, not a source
  rule.
- Legal overs are displayed in cricket notation: `floor(legalBalls / 6)`.`legalBalls % 6`.
  Thus 26 legal balls are `4.2` overs, not 4.33 decimal overs.
- Team total runs include bat runs and all recorded extras. Bowler-conceded
  runs follow Scoring's actual formula: bat runs + wides + no-balls; byes,
  leg-byes, and penalty runs are not charged to the bowler.

### 1. Player Career Statistics

| Statistic | Definition and formula | Source fields and aggregation | Eligibility, edge cases, availability |
|---|---|---|---|
| Matches played | Number of distinct eligible matches in whose confirmed XI the player appears. | Match Service match ID and confirmed XI snapshot; count distinct `matchId` per `playerId`. | Completed matches only; one count per match even across multiple innings. Every XI player counts even with zero scoring/fielding participation. **Not currently derivable:** Match stores squads, not an official XI. |
| Batting innings | Number of eligible innings in which the player actually batted/was a batter in the innings, including a zero-ball dismissal if recorded. | Scoring `Innings.battingFigures`; `Delivery.strikerId`, `nonStrikerId`, `dismissedPlayerId`; `retirementEvents`; innings closing state. Count distinct `(matchId, inningsId, playerId)`. | An XI-only player still receives a match appearance but no batting-innings count without batting evidence; wider-squad membership alone establishes neither. Current figures can omit a non-striker dismissed before facing a ball; replay/dismissal records must supplement figures. |
| Bowling innings | Number of eligible innings in which the player delivered at least one recorded ball, legal or illegal. | `Innings.bowlingFigures.playerId` and `Delivery.bowlerId`; count distinct `(matchId, inningsId, playerId)`. | An appointed bowler with no recorded delivery cannot reliably be distinguished from no bowling appearance in historical records. |
| Innings totals | Sum a player's eligible batting runs, bowler-credited wickets, and supported individual fielding contributions separately. | Scoring figures and ordered deliveries; never treat all innings wickets as a bowler's wickets. | Recompute per match so repeated imports do not double count. Do not invent individual run-out credit when the source cannot establish it. |

Career batting and bowling totals are the sums of eligible per-innings
performances, not values copied from a current Player or Team profile.
Matches played is independent of batting innings, bowling innings, and
fielding contributions. A confirmed playing XI is mandatory to calculate
official matches played; squad-only or participation-only inference is not
permitted.

### 2. Batting Records

| Statistic | Definition and formula | Source fields and aggregation | Eligibility, edge cases, availability |
|---|---|---|---|
| Matches | Distinct eligible matches with official XI appearance. | Match Service confirmed XI; distinct `matchId`. | Same appearance rule above; count XI members even without batting, bowling, or fielding; unavailable for a match lacking a confirmed XI. |
| Innings | Eligible batting innings actually entered. | `Innings.battingFigures`, delivery batter IDs, dismissal IDs, retirement events. | Count once per player per innings, not per delivery; handle zero-ball dismissal from delivery history. |
| Not outs | Eligible batting innings in which the batter was not dismissed by the end of the innings. | `battingFigures.isOut`, `retiredHurt`, dismissal deliveries, retirement/resume events. | Retired Hurt is not dismissal. If the batter later resumes and is dismissed, the innings is dismissed. If innings ends while still not dismissed, count one not out. |
| Runs | Sum of batter runs, excluding extras. | `battingFigures.runs`, checked/rebuilt from `Delivery.batRuns` for deliveries where player is striker. | Include valid runs from manually ended innings; do not allocate byes/wides/no-balls to batter unless present in `batRuns`. |
| Highest score | Maximum runs by the player in one eligible innings; show not-out state alongside (for example, `87*`). | Per-player innings `battingFigures.runs` and final dismissal state. | If tie, retain all tied innings or apply a documented display tie-break; do not discard tied records. |
| Batting average | `total runs / dismissals`, where dismissals are the player's innings dismissed count. | Sum runs and count dismissed innings from `isOut` plus dismissal delivery recovery. | Return `null` for zero dismissals. A Retired-Hurt innings is not a dismissal. |
| Strike rate | `(total runs / balls faced) × 100`. | `battingFigures.runs`, `ballsFaced`; audit against deliveries. | Return `null` for zero balls faced. Scoring currently counts a ball faced for every event except `WIDE` and `PENALTY`; keep that source behavior unless changed explicitly. |
| Hundreds | Number of eligible batting innings with at least 100 runs. | Innings batting runs; count one per innings. | A 100+ score is a hundred, not also a fifty. |
| Fifties | Number of eligible batting innings with 50–99 runs. | Innings batting runs; count one per innings. | Exactly 50 qualifies; 100+ does not. |
| Fours | Sum of batter-scored boundaries, currently increments when `batRuns === 4`. | `battingFigures.fours`; verify against deliveries with `batRuns === 4`. | Extras do not count as batter fours. |
| Sixes | Sum of batter-scored sixes, currently increments when `batRuns === 6`. | `battingFigures.sixes`; verify against deliveries with `batRuns === 6`. | Extras do not count as batter sixes. |
| Ducks | Number of eligible batting innings ending dismissed with zero batter runs. | `battingFigures.runs`, `isOut`, dismissal deliveries. | Includes zero-ball dismissal if confirmed by delivery history. A not-out zero and Retired Hurt for zero are not ducks. |

**Required batting state distinction:** Store/project per-innings status as
dismissed, not dismissed, or retired hurt at close, in addition to the raw
source fields. Retired Hurt is a not-out state unless a later dismissal in
that innings changes the final outcome.

### 3. Bowling Records

| Statistic | Definition and formula | Source fields and aggregation | Eligibility, edge cases, availability |
|---|---|---|---|
| Matches | Distinct eligible matches in which the bowler appears in the official XI. | Match Service confirmed XI; distinct `matchId`. | Do not confuse XI appearance with a bowling innings. Count a confirmed XI member even if they do not bowl; unavailable for a match lacking a confirmed XI. |
| Innings | Eligible innings in which at least one delivery is recorded for the bowler. | `Innings.bowlingFigures.playerId`, `Delivery.bowlerId`; distinct innings. | Count illegal-only participation as a bowling innings if a delivery exists. |
| Balls | Sum of legal balls bowled. | `bowlingFigures.legalBalls`; reconcile to deliveries where `bowlerId` and `isLegalBall === true`. | Wides and no-balls do not add legal balls under current scoring rules. |
| Overs | Cricket notation derived from legal balls: `floor(balls/6).balls%6`. | Aggregated legal balls. | Never calculate by decimal division or sum printed over strings. |
| Maidens | Completed six-legal-ball overs by one bowler with zero runs charged to that bowler. | Reconstruct from ordered deliveries, `bowlerId`, `isLegalBall`, `batRuns`, `extras.wides`, and `extras.noBalls`. | No maiden field is stored. Derivable only with a complete, correctly ordered delivery history and a reliable over boundary. Do not count an incomplete manually ended over. |
| Runs conceded | Sum `batRuns + wides + noBalls` for the bowler's deliveries, or use figures and verify against deliveries. | `bowlingFigures.runsConceded`; delivery `batRuns`, `extras.wides`, `extras.noBalls`. | Byes, leg-byes, and penalty runs are not included by current scoring engine. |
| Wickets | Bowler-credited dismissals only. | `bowlingFigures.wickets`, verified by dismissal type in deliveries. Credited types are BOWLED, CAUGHT, LBW, STUMPED, HIT_WICKET. | Exclude run-outs, obstructing field, and hit-ball-twice from bowler wickets. `Innings.wickets` is team wickets, not bowler wickets. |
| Best bowling figures | Best single eligible innings as `(bowler-credited wickets, runs conceded)`, wickets descending then runs ascending. | Per-player innings bowling figures. | Retain tied figures; document any further tie-break separately. |
| Bowling average | `runs conceded / bowler-credited wickets`. | Aggregated runs conceded and credited wickets. | Return `null` for zero wickets; do not substitute team wickets. |
| Economy rate | `runs conceded / legal overs`, equivalently `runs conceded × 6 / legal balls`. | Runs conceded and legal balls. | Return `null` for zero legal balls. |
| Bowling strike rate | `legal balls / bowler-credited wickets`. | Legal balls and credited wickets. | Return `null` for zero wickets. |
| Four-wicket hauls | Count eligible bowling innings with at least four bowler-credited wickets and fewer than five. | Per-player innings bowling wickets. | Exactly four qualifies; five is counted as a five-wicket haul instead. |
| Five-wicket hauls | Count eligible bowling innings with at least five bowler-credited wickets. | Per-player innings bowling wickets. | Count each innings once, including innings with six or more wickets. |

**Example — bowler with zero wickets:** A bowler concedes 24 runs from 24
legal balls and takes no credited wickets. Show `4.0 overs`, `24 runs`,
`0 wickets`, `economy 6.00`, `average null`, and `strike rate null`. Zero
wickets is a valid performance; the average and strike rate are undefined.

### 4. Fielding Records

| Statistic | Definition and formula | Source fields and aggregation | Eligibility, edge cases, availability |
|---|---|---|---|
| Catches | Credited catch dismissals by fielder. | `Delivery.dismissalType === "CAUGHT"` and `fieldingAttribution.fielderIds`. | Current validation requires exactly one fielder; count one for that player and one team wicket. |
| Stumpings | Credited stumping dismissals by fielder. | `dismissalType === "STUMPED"` and `fieldingAttribution.fielderIds`. | Current validation requires exactly one fielder; count one for that player and one team wicket. |
| Run-outs | One team run-out per `RUN_OUT` dismissal; individual credit is recorded only where source attribution establishes it. | `dismissalType`, `dismissedPlayerId`, proposed direct-hit player ID or assisted fielder IDs/roles, and `runOutType`. | Multiple participating fielders must not multiply team wickets. Unestablished individual credit is unavailable, not apportioned by assumption. |
| Direct-hit run-outs | One team run-out event; credit the identified direct-hit player when the source identifies that player. | Requires a `directHitByPlayerId` (or equivalent explicit credited-player field) with `runOutType === "DIRECT_HIT"`. | Current source lacks this field. Do not infer the credited player from an unordered `fielderIds` list; individual direct-hit attribution is unavailable until the source is extended. |
| Assisted run-outs | One team run-out event; preserve every participating fielder and that fielder's source-recorded role. | Requires per-fielder records such as `{ playerId, role }` for `runOutType === "ASSISTED"`. | Current source stores only an unordered ID array. Participant/role history and individual credit are unavailable until the source is extended. Do not assign equal or other invented shares. |
| Total fielding dismissals | Catches + stumpings + individually supported run-out credits. | Deduplicated delivery dismissal events and explicit fielder attribution. | Count one team wicket per run-out. If individual credit cannot be established, retain the team dismissal but mark individual run-out attribution unavailable; do not multiply or apportion a wicket by assumption. |

**Required Scoring Service source changes:** For a `DIRECT_HIT`, record the
player who made the direct hit in an explicit field and validate that the
credited player is among the participating fielders. For an `ASSISTED`
run-out, replace or augment the unordered `fielderIds` list with structured
per-fielder records containing stable player ID and role (for example,
thrower/receiver, with the supported role vocabulary defined by Scoring).
Keep the dismissal itself as one delivery event and one team wicket. Stats
may count direct-hit player credit from the explicit ID and preserve assisted
participants/roles; only calculate individual assisted credits under an
explicit source-backed attribution rule. If the source cannot establish
individual credit, expose the team run-out and mark individual attribution
unavailable rather than inventing credits.

### 5. All-Round Records

No separate all-round performance or rating model exists. Player role is
profile metadata, not proof of match performance. Use the actual batting and
bowling contributions rather than role labels to construct summaries.

| Statistic / presentation | Definition and formula | Source fields and aggregation | Eligibility, edge cases, availability |
|---|---|---|---|
| All-round match summary | Present one player's batting line and bowling line side by side for each eligible match (for example, `32 runs; 2/18`). | Same eligible innings batting and bowling figures. Join by player and match ID. | Supported where figures exist; no scalar rating implied. |
| Batting-and-bowling contribution | Include a performance in a two-discipline list when the player has a batting innings and a bowling innings in that match; show runs, batting average/strike rate and credited wickets, bowling average/economy. | Batting and bowling figures, keyed to the same player and match. | This is a set of paired measurements, not a combined score. Define qualification and tie ordering for leaderboards before implementing one. |
| Career all-round summary | Show career batting totals/rates adjacent to career bowling totals/rates. | Aggregate the eligible career batting and bowling records independently. | Do not add runs and wickets into an arbitrary composite. Existing award points are award-specific, not an all-round rating. |

### 6. Team Records

| Statistic | Definition and formula | Source fields and aggregation | Eligibility, edge cases, availability |
|---|---|---|---|
| Matches | Count eligible completed matches involving the team once each. | Match `teamAId`, `teamBId`, `status`, and result. | Cancelled and unfinished matches excluded. A completed match with missing/invalid result is quarantined rather than silently counted. |
| Wins | Count eligible results with `outcome === "WIN"` and `winnerTeamId` equal to the team. | Match `result.outcome`, `result.winnerTeamId`. | Validate winner is a participating team. |
| Losses | For a valid two-team win, count one loss for the other participating team. | Match team IDs and validated winner. | A tie or no-result is not a loss. |
| Ties | Count eligible result outcomes `TIE`; count one tie for each participating team. | Match `result.outcome`. | Tie does not count in decided-match denominator. |
| No-results | Count eligible result outcomes `NO_RESULT`; count one no-result for each participating team. | Match `result.outcome`. | Cancelled is not a no-result. Current schema allows this outcome but the observed finalization calculation does not create it. |
| Win percentage | `(wins / decided matches) × 100`, where `decided matches = wins + losses`. | Aggregated validated results. | Ties and no-results are excluded. Return `null` when decided matches is zero. |
| Team batting records | Team innings runs, wickets lost, legal balls, extras, highest/lowest totals and scoring rate if defined. | Scoring innings `battingTeamId`, `runs`, `wickets`, `legalBalls`, `extras`; Match status/result. | Use completed eligible matches. Team total includes all extras; do not infer team identity from current rosters. |
| Team bowling records | Opponent runs, wickets taken as a team, legal balls bowled and derived economy. | Scoring innings `bowlingTeamId`, `runs`, `wickets`, `legalBalls`; innings order. | Team wickets are not a sum of only bowler-credited wickets; distinguish run-outs and other non-bowler dismissals. |

**Example — tie and no-result:** A tied completed match increments each
team's matches and ties, but not wins/losses or decided matches. A completed
no-result (if such a result is made sourceable) increments matches and
no-results, but not the win-percentage denominator. A cancelled match
increments none of these official records. If a team has one win, one loss,
one tie, and one no-result, its win percentage is `1 / (1 + 1) × 100 = 50%`.

### 7. Match Records and Awards

| Statistic | Definition and formula | Source fields and aggregation | Eligibility, edge cases, availability |
|---|---|---|---|
| Match result | Persisted outcome, winner, margin, reason, finalized time. | Match `status`, `result.outcome`, `winnerTeamId`, `margin`, `reason`, `finalizedAt`. | Official only after completed status and valid result. Current finalization supports two completed innings and produces win/tie; no-result is schema-only in the observed result path. |
| Player of the Match | Display Match's persisted `result.awards.manOfTheMatch` winner(s), labeled as Player of the Match. | Match result awards; `playerId`, `teamId`, points and batting/bowling/fielding breakdown. | Existing award calculator permits tied winners. No result matches cannot receive awards in current award logic. Do not recalculate with Stats-specific rules. |
| Best Batter | Display persisted `result.awards.bestBatsman` winner(s). | Match result awards, scoring version, player/team IDs and breakdown. | Award is points-based, not simply most runs. Preserve source ties and scoring version. |
| Best Bowler | Display persisted `result.awards.bestBowler` winner(s). | Match result awards and breakdown. | Award is points-based, not simply best wickets/average. Preserve source ties and scoring version. |
| Highest individual score | Highest player runs in an eligible innings. | Scoring batting figures, with delivery recovery for missing zero-ball dismissals. | Keep ties; include match/innings IDs and not-out marker. |
| Best bowling figures | Most bowler-credited wickets for fewest runs conceded in an eligible innings. | Scoring bowling figures, validated against delivery dismissal types. | Team wickets are not bowler wickets; keep ties unless a documented display rule is chosen. |
| Highest team total | Maximum completed innings runs for a team in an eligible match. | Scoring innings `battingTeamId`, `runs`; Match identity/result. | Match attribution must use the innings team ID, not current roster membership. |
| Lowest team total | Minimum completed innings runs for a team in an eligible match. | Same as highest total. | Include only eligible, valid innings; confirm treatment of innings with zero deliveries before publishing. |
| Most runs / wickets in a match | Maximum aggregate batting runs or credited wickets for a player across that match's eligible innings. | Per-match sum of Scoring batting or bowling figures. | Do not confuse with existing award categories; preserve tied records. |

The award calculator currently defines Man of the Match, Best Batsman, and Best
Bowler with scoring version 1. Its scoring points include batting, bowling, and
fielding components, but Stats must consume persisted winners and not treat
award points as career runs/wickets or a general all-round rating. There are
no other source awards to display as existing awards.

### 8. Partnerships

Partnerships are not stored as records. They are a proposed derived
statistic reconstructed from the ordered delivery stream and innings state.
The result is reliable only when all deliveries and batter changes can be
ordered unambiguously.

| Statistic | Definition and formula | Source fields and aggregation | Eligibility, edge cases, availability |
|---|---|---|---|
| Batters involved | The unordered pair of active batters in a partnership segment. | `Delivery.strikerId`, `nonStrikerId`, and `beforeState`; innings retirement events for changes between deliveries. | Pair order can change ends without changing the partnership. A batter change starts a new pair segment. |
| Partnership runs | Sum `Delivery.totalRuns` for deliveries in the segment. | `totalRuns` includes bat runs and recorded wides, no-balls, byes, leg-byes, and penalty runs. | Include extras in team partnership runs, including extras on the wicket delivery that ends the pair. Do not sum batter runs only. |
| Partnership legal balls | Count deliveries in the segment with `isLegalBall === true`. | Ordered Delivery `isLegalBall`. | Wides and no-balls do not add legal balls; illegal deliveries may still add runs. |
| Start/end delivery | First/last delivery sequence attributed to the pair. | Delivery `sequence` within `inningsId`. | Use sequence, not timestamps, to order deliveries. Expose null/unknown where no delivery exists. |
| Dismissal/end reason | Wicket type for a wicket-ended pair; otherwise retirement/change, innings end, or match/innings completion reason. | Delivery dismissal fields; `retirementEvents`; Innings `completionReason`, `endHistory`, `status`. | Retired Hurt is an end/change reason, not a dismissal. Manual end is distinct from wicket and automatic completion. |
| Highest partnership | Maximum partnership runs within one eligible innings, preserving the pair and innings. | Reconstructed partnership segments; sort by runs descending. | Retain ties. Match/career views aggregate only completed eligible matches. |

**Deterministic reconstruction contract:**

1. Process the complete innings event stream in ascending shared
   `eventSequence`, not separate delivery and retirement lists.
2. Maintain the active batter pair as replay state. A delivery is attributed
   to the pair active immediately before that event; pair order may change
   ends without changing the partnership.
3. Allocate each delivery's `totalRuns` and legal-ball flag to that active
   pair.
4. Include the wicket delivery's runs/ball in the partnership it ends, then
   close it with that dismissal type. If a successor batter appears in the
   following batter-replacement event, start a new partnership with the
   remaining batter and successor.
5. On a Retired-Hurt event, close the current pair with end reason
   `RETIRED_HURT` (not a wicket). A new batter/replacement forms a new segment.
   A resume event starts a new segment with the then-active partner; do not
   merge it into the earlier pair. Runs/balls already accumulated by the
   returning batter remain in that batter's innings score.
6. Apply batter replacement/selection events in sequence. Close the final
   segment at the innings-end event with `MANUAL_END`,
   `AUTOMATIC`, or the supported terminal reason. A zero-delivery segment
   cannot be represented with start/end delivery under current source data.

The shared event sequence establishes the exact order between a delivery,
Retired-Hurt/resume, batter replacement, and innings end. Replaying these
events in order determines the pair active for each delivery and the exact
event that closes each partnership; timestamps alone do not provide this
ordering guarantee.

**Example — wicket-ended partnership:** If A and B have 18 runs from 20
legal balls, and the next delivery adds two runs and dismisses B, close A/B
at 20 runs and 21 legal balls with that dismissal type (assuming the wicket
delivery is legal). If C comes in, begin a new A/C partnership at the next
delivery. If A is dismissed on that delivery instead, the next pair is
determined by the actual active batter state, including run-out crossing
rules.

**Example — Retired Hurt and return:** If A retires hurt while paired with B,
close that pair as `RETIRED_HURT`, not as a wicket. A replacement forms a
separate partnership. If A later resumes with C, record another A/C segment;
do not join the two A segments across the intervening retirement.

**Required event-order source contract:** Scoring Service should assign one
strictly increasing `eventSequence` per innings to every state-changing
scoring event, including each delivery, Retired Hurt, resume, batter
replacement/selection, and innings end. Allocate and persist the sequence
atomically with the event and its state transition; retries of the same
idempotent operation must retain the original event sequence rather than
create a second event. Delivery's existing `sequence` may remain for
delivery-specific ordering, but it is not a substitute for the shared
cross-event sequence. Stats replays the complete event stream by
`eventSequence`, applying each event to the active batter pair and innings
state in order. This establishes whether a retirement/replacement occurred
before or after a delivery, which pair receives each delivery's runs and
legal ball, when a partnership closes, and how a returning batter forms a
new segment. Timestamps alone must never be treated as a deterministic
ordering contract. Current source lacks this sequence, so affected historical
partnerships cannot be claimed deterministic and must be marked unavailable
or provisional.

### 9. Live Match Statistics

Live statistics use the same source innings and deliveries but are stored and
served separately from official career and record projections. A live result
must never increment career totals.

| Live statistic | Definition and source | Availability and handling |
|---|---|---|
| Current innings score | Current innings `runs`, `wickets`, `legalBalls`, extras, batting/bowling teams, and derived overs. | Directly available from Scoring innings. Reconcile against deliveries before publishing if a sync is partial. |
| Batter/bowler live figures | Current innings batting and bowling figures. | Available for recorded participants; can be incomplete while scoring is in progress. |
| Current run rate | `innings.runs × 6 / innings.legalBalls`. | Return `null` before any legal ball. Do not mix with career rate. |
| Required run rate | `(targetRuns - currentRuns) × 6 / (scheduledLegalBalls - currentLegalBalls)`. | Only when a valid target and scheduled-ball limit exist and balls remain; otherwise null/not applicable. Match format/overs may support the limit, but rain-revised target/overs are not stored. |
| Projected score | Not specified. | No projection formula/source exists. Do not publish until a method and label are approved. |
| Provisional partnerships | Replay the unified per-innings event sequence, including deliveries, retirements, resumes, batter changes, and innings end. | Mark incomplete/provisional until the event stream is complete. Current source lacks a shared sequence, so deterministic reconstruction around these events is unavailable; timestamps alone are insufficient. |
| Live awards | None treated as official. | Existing awards are calculated and persisted during match finalization. Do not expose provisional award guesses as persisted awards. |

Live projection keys and storage must be distinct from official per-match
records. On finalization, Stats should import/rebuild the official projection
from the final source state and only then aggregate it into career/team
records.

### 10. Leaderboards

Leaderboards are views over eligible career/match projections, not new source
statistics. Every leaderboard must state its scope, filters, qualification,
sort order, and tie behavior.

| Leaderboard | Metric and source | Required qualification/edge rules |
|---|---|---|
| Most runs | Sum batting runs. | Completed matches only; optionally minimum batting innings, set as a product rule. Ties retain the same rank or shared position. |
| Highest batting average | Runs / dismissals. | Null averages excluded; minimum dismissals must be declared. |
| Highest strike rate | Runs / balls faced × 100. | Null rates excluded; minimum balls faced must be declared. |
| Most hundreds/fifties | Innings milestone counts. | Completed matches only; ties shared. |
| Most wickets | Bowler-credited wickets. | Completed matches only; use credited wickets, not team wickets. |
| Best bowling average/economy/strike rate | Defined career formulas. | Exclude null denominators; declare minimum wickets/balls; economy uses legal balls. |
| Most catches/stumpings/run-outs | Deduplicated fielding events and source-supported individual credits. | Direct hits require an identified player; assisted events preserve participants/roles. Exclude unavailable individual credits rather than assuming equal shares. |
| All-round performance | Paired batting and bowling values. | No scalar score currently specified; do not rank a made-up combined value. If ranking is required, approve qualification and ordering first. |
| Team win percentage | Wins / (wins + losses) × 100. | Ties and no-results excluded; null with no decided matches. |

Live matches are excluded from all official leaderboards. Results with equal
metrics must not be silently dropped; return all tied records or apply an
explicit, stable display ordering after the metric tie.

## 5. Data source mapping

| Data required by Stats | Owning service and source fields | Purpose and restrictions |
|---|---|---|
| Match identity and eligibility | Match Service `Match._id`, `status`, `result`, `matchDate`, `format`, `overs`, `inningsPerTeam`, `teamAId`, `teamBId`, `venue`, `battingFirstId`. | Validate official eligibility and retain match context. Do not write match lifecycle or result fields from Stats. |
| Official player appearance and match team assignment | Match Service's separate confirmed playing-XI snapshot (required future source; existing squad fields are not XI data). | Preserve team-at-match association by `(matchId, teamId, playerId)`; count each confirmed XI player once per eligible match even with no statistical participation. A wider squad is not an appearance. Never infer historical team from current Player `teamId` or Team roster. |
| Match awards | Match Service persisted `result.awards` (from Scoring award calculation). | Display source awards and scoring version; do not recalculate or invent categories. |
| Innings totals and player figures | Scoring Service Innings `matchId`, `inningsNumber`, batting/bowling team IDs, runs, wickets, legal balls, extras, figures, status, completion fields, retirement events. | Main aggregate source; preserve innings identity and distinguish team wickets from bowler wickets. |
| Delivery facts and dismissals | Scoring Service Delivery `sequence`, proposed shared innings `eventSequence`, batter/bowler IDs, `batRuns`, extras, `totalRuns`, `isLegalBall`, dismissal fields, structured fielder IDs/roles, direct-hit player ID, `beforeState`. | Validate/rebuild figures; reconstruct fielding, maidens, and partnerships. Current data lacks shared event ordering and individual run-out role/credit fields; complete ordered history is required for reliable replay. |
| Player identity and display name | Player Service stable player ID and current profile; Match Service historical player-name snapshot at XI confirmation (recommended future field). | Aggregate only by stable `playerId`. Use the match-time display-name snapshot for historical scorecards; current profile may enrich current profile views but must not rewrite old scorecards when a name changes. |
| Team identity and display name | Team Service stable team ID and current profile; Match Service historical team-name snapshot at match confirmation (recommended future field). | Aggregate only by stable `teamId`. Use the match-time name for historical scorecards; a later team rename must not rewrite old scorecards. |
| Auth user identity | Auth Service user records. | Not needed for player/team stats. Do not join match creator/scorer IDs to player IDs without an explicit relationship. |

## 6. Eligibility and aggregation rules

1. **Import match source:** Retrieve Match identity, participants, lifecycle,
   result, and awards. Retrieve all Scoring innings and each innings'
   delivery history. Validate match IDs, innings IDs/numbers, team IDs,
   sequence uniqueness/order, result fields, and source response shape.
2. **Do not import partial official totals:** If a required service is
   unavailable, a response is malformed, innings are missing, or delivery
   history is incomplete, record the sync failure and leave the official
   projection unchanged or marked stale. Never return an empty success as if
   it meant zero stats.
3. **Eligibility gate:** Only a completed Match with a valid persisted result
   and complete required Scoring source qualifies. Exclude live, scheduled,
   cancelled, and pending finalization. Manually completed innings are
   retained. No-result can be handled if source data later produces a valid
   completed no-result, but current finalization does not create one.
4. **Preserve match-time identity:** Key all aggregation by stable source IDs
   and store participating team IDs with each player's match performance.
   Capture player and team display-name snapshots in the match record at
   confirmation (including confirmed XI members and their match team).
   Historical scorecards render those snapshots so later Player profile
   edits or Team renames cannot change past presentation. Current
   profile/roster data is optional enrichment only and must not rewrite match
   attribution or snapshots.
5. **Replace, do not increment blindly:** Upsert one canonical Stats
   projection per `matchId`. Build an idempotency fingerprint/checksum from
   the normalized Match record, innings, deliveries, and source revision
   data. If a re-import changes that source fingerprint, replace that match
   projection and recompute affected player/team aggregates from canonical
   projections. Do not add the same match totals a second time.
6. **Reconcile:** Periodically page through completed matches and compare
   source fingerprints/status with Stats projections. Rebuild missing,
   stale, or changed projections. A source change from completed to
   cancelled or invalid must remove/exclude that match from official
   aggregates after reconciliation.
7. **Expose freshness and failures:** Store sync state such as
   `PENDING`, `READY`, `FAILED`, or `STALE`, timestamps, source fingerprint,
   and a safe failure reason. Keep last-known-good official data distinguishable
   from a current projection; communicate stale status rather than silently
   serving it as current.
8. **Service boundary:** Stats calls service APIs only. It must not connect
   to or query another service's MongoDB. Existing source reads need
   pagination and internal-service protection before bulk or recurring
   ingestion. Scoring's current innings/delivery endpoints are not
   paginated, so large-history ingestion needs a new source contract.
9. **Live isolation:** Keep live match projections separate, keyed to the
   match and source revision, and do not aggregate them into career/team
   official totals until the eligibility gate succeeds.
10. **Future push delivery:** No event system exists now. An outbox and
    event consumer may be considered later, but are not prerequisites for a
    pull-based first version. Any future event must be idempotent and trigger
    projection replacement/rebuild, not non-idempotent career increments.

## 7. Edge cases and practical examples

- **Playing-XI player never participates:** For an eligible completed match
  with a confirmed XI, count one appearance for that player even with zero
  batting, bowling, and fielding participation.
  Add no batting or bowling innings and no fielding contribution unless the
  player actually has that source participation. A wider-squad-only player
  receives no appearance.
- **Dismissed batter versus Retired Hurt:** A batter with runs 0 and
  `isOut === true` (or confirmed dismissal delivery) has one dismissal and a
  duck. A batter with `retiredHurt === true` and no dismissal is not
  dismissed; they have no duck and their innings is not out. A later
  dismissal after resuming changes the final innings state to dismissed.
- **Bowler with zero wickets:** Keep wickets as zero; average and bowling
  strike rate are null. Economy remains calculable when legal balls exist.
- **Run-out involving multiple fielders:** Count exactly one team wicket and
  one team run-out event. A direct-hit record must identify the direct-hit
  player. An assisted record must preserve each participating fielder ID and
  role. Do not assign equal/fractional credits by default; if individual
  credit is not established by source data, mark it unavailable while
  retaining the team dismissal and recorded participants.
- **Tie and no-result:** A tie counts as a match and tie for both teams,
  not a win/loss and not a decided match. No-result similarly counts as a
  match/no-result only if a completed valid no-result is represented in
  Match source; it is excluded from decided matches. Current Match
  finalization does not calculate no-result.
- **Player returning after Retired Hurt:** Keep prior runs/balls in that
  player's innings score; do not count retirement as a dismissal. Treat the
  return as a new partnership segment with the batter then at the other end.
  Current retirement event timestamps do not guarantee deterministic
  ordering with delivery sequence.
- **Partnership ends because of a wicket:** Assign the wicket delivery's
  runs and legal-ball status to the partnership active before the wicket.
  Close the partnership once with that dismissal reason; start the next
  segment only when a new pair is present. One dismissal is one team wicket,
  regardless of fielding attribution count.
- **Player/team profile changed after a match:** Keep stable match-specific
  player/team IDs as aggregation keys and render historical scorecards from
  recommended match-time player and team display-name snapshots. A later
  Player profile edit or Team rename must not rewrite historical names.
  Current profile values may be shown separately as current profile
  enrichment, not substituted into past scorecards.
- **Scoring/Match service unavailable or partial delivery page:** Do not
  replace a known-good official projection with zeros or partial totals.
  Record failure/staleness, retry, and reconcile before publishing as fresh.
- **Manual innings end:** Retain valid figures and delivery history from a
  completed `MANUAL_END` innings if its match reaches valid completed
  status. Distinguish the innings end reason in match/partnership display.

## 8. Live versus career statistics

| Concern | Live projection | Official career/records projection |
|---|---|---|
| Source eligibility | Match is scheduled/in progress and Scoring is updating. | Match is completed with valid result and complete source records. |
| Update behavior | Refresh/replay from latest innings/delivery state; mark provisional. | Import or rebuild an immutable-by-default per-match projection after finalization; reconcile source changes explicitly. |
| Display | May show current score, player figures, run rates, and provisional partnerships. | Only eligible completed-match totals, averages, records, and leaderboards. |
| Aggregation | Stored separately from player career/team totals. | Derived only from canonical eligible match projections. |
| Failure behavior | Surface last sync time and stale/provisional state. | Preserve last-known-good projection but mark stale; do not silently claim freshness. |
| Finalization | Does not itself make values official. | Re-import final Match result/awards and complete Scoring data, then replace projection and recompute aggregates. |

## 9. Recommended Stats Service architecture

The initial importer is available at
`POST /api/v1/internal/stats/matches/:matchId/import` on Stats Service.
Configure Stats Service from `services/stats-service/.env.example` and send
the shared secret in the `X-Internal-Service-Secret` header. The endpoint
returns `created`, `unchanged`, or `updated` with the stored match projection.
It currently covers finalized one-innings-per-team limited-overs wins and
ties. Historical records without a confirmed playing XI retain their
scoring figures and report appearances as unknown.

Open **Stats** in the app or visit `/stats` to browse imported matches.
Select **Player stats**, or select a player in the Players directory, to see
batting and bowling totals, rates and best figures by format. Older
projections without maiden figures show a dash until they are re-imported.
The page uses `GET /api/v1/stats/matches` and
`GET /api/v1/stats/matches/:matchId`. Locally, start Stats Service on port
4006. For a deployed frontend, run Stats Service behind the
`/api/v1/stats/` reverse proxy or set `VITE_STATS_API_URL` before building.

### Ownership and read-model boundaries

- A dedicated Stats Service and its own database own only derived,
  rebuildable projections and synchronization metadata.
- Recommended logical records: per-match projection; per-player-per-match
  performance; per-team-per-match result/innings summary; optional
  materialized career/team aggregates; synchronization checkpoint/status.
- Keep each performance linked to `matchId`, `inningsId`, `playerId`, and
  `teamId` as applicable. Preserve match-time player/team display-name
  snapshots alongside stable IDs; use IDs for aggregation and snapshots for
  historical presentation. Preserve source fields or a normalized source
  snapshot/checksum so that rebuilds are auditable.
- Career aggregates may be computed from match projections or maintained as
  materialized read models, but the per-match projection remains the
  canonical rebuild unit.
- Do not duplicate Player or Team management, Match lifecycle/finalization,
  Scoring delivery entry, scorecard ownership, or existing award calculation.

### Source retrieval and enrichment

- **Match Service:** retrieve match status/result, match format/date/context,
  participating teams, wider squads, confirmed XI and match-time display-name
  snapshots when added, and persisted awards.
  Use the paginated match list for backfill and match-by-ID reads for
  validation/reconciliation.
- **Scoring Service:** retrieve every ordered innings and complete ordered
  delivery history for official projection calculation and repair. Existing
  read endpoints return all records without pagination and need an
  internal-only, paginated export/read contract for scale and protection.
- **Player Service:** call only when current player profile fields are
  required in a response. Prefer a future batch lookup over N individual
  requests or the current unpaginated all-player endpoint. Match-time player
  name snapshots should be used for historical scorecards; current profile
  data remains optional enrichment and is not an aggregation key.
- **Team Service:** call only when current team name/short name is needed.
  Team IDs in Match and Scoring remain the match attribution authority.
  Match-time team-name snapshots should be used for historical scorecards;
  current Team profile is not a historical display-name source.
- **Auth Service:** no player identity lookup is currently defined. Do not
  call it for player stats unless an explicit identity relationship is added.

### Synchronization, recalculation, and failure handling

- First implementation can use pull-based backfill and reconciliation over
  Match Service's paginated completed-match list; no event broker is assumed.
- Use a unique match projection key and a source fingerprint to make repeated
  imports idempotent. A repeated unchanged import is a no-op; changed source
  data replaces that match's projection and recomputes affected aggregates.
- Recalculate from source records rather than trying to infer corrections
  from incremental counters. If Match result/status, innings, figures, or
  deliveries change, rebuild the complete match projection.
- Store source status, last attempted/successful sync time, fingerprint,
  projection version, and failure reason. Represent missing source records
  distinctly from valid zero-value records.
- A profile service outage should not invalidate numeric projections if
  IDs and statistics are available. A Match or Scoring data outage or
  incomplete history must prevent a projection from being marked fresh.
- Add events/outbox only as a future integration decision, with changes made
  at owning services. No Kafka, event publishing, consumer, or transactional
  outbox functionality was found in the repository.

## 10. Missing data, limitations, and future requirements

| Gap / limitation | Consequence | Requirement before the affected statistic can be authoritative |
|---|---|---|
| No confirmed official playing-XI field/snapshot; Match stores flexible squad arrays and Scoring records only some active players. | Cannot count official appearances for confirmed XI players who never participate or distinguish wider squad membership from XI membership. Participation-based inference would violate the official appearance rule. | Match Service must persist a confirmed playing XI separately from the wider squad. Count every confirmed XI member once per eligible completed match regardless of participation. Preserve confirmation time and revision/version history, including which revision became official. |
| No enforced fixed XI size in Match validation. | `teamAPlayerIds`/`teamBPlayerIds` cannot be assumed to contain exactly eleven. | Define supported XI size and validate the designated XI separately from a wider squad. |
| No match-time player or team display-name snapshots. Player and Team APIs return current mutable profile data. | A renamed player or team could change how an old scorecard appears if Stats resolves historical labels from current profiles. | At match/playing-XI confirmation, capture player and team display-name snapshots in Match-owned match data. Keep stable player/team IDs as aggregation keys; use snapshots only for historical display. |
| Team roster and Player `teamId` are separate mutable records. | Current roster is not historical match membership. | Use Match's match-specific team IDs, wider squads, and confirmed XI; do not infer history from current roster. |
| Non-striker may be dismissed before facing a ball without an existing batting figure. | Innings, out status, duck, and player figure totals may be incomplete if Stats trusts figures alone. | Replay delivery `dismissedPlayerId`/batter IDs and reconcile; preferably make zero-ball dismissed batter figures explicit in Scoring. |
| Delivery sequence is per-delivery; Retired Hurt/resume, batter replacement, and innings-end events lack one shared event sequence. | Partnership boundaries and active batter pairs cannot be ordered reliably across event types; timestamps alone cannot provide deterministic ordering. | Scoring Service must persist one strictly monotonically increasing innings event sequence covering every delivery, Retired Hurt, resume, batter replacement/selection, and innings-end event. Allocate it atomically with the state transition and preserve it on idempotent retries. |
| Delivery history endpoint is unpaginated and no explicit history completeness/version contract is exposed to Stats. | Large matches can be expensive or truncated by transport limits; reliable rebuild completeness is difficult to attest. | Add internal, paginated export with stable ordering, continuation token, innings/source revision, and completeness metadata. |
| Existing Scoring innings/delivery reads are not internal-service protected. | They are unsuitable as a trusted service-to-service bulk ingestion boundary as currently exposed. | Add internal authentication/authorization for Stats export reads and safe response limits. |
| Bowling figures do not store maidens. | Maiden totals require delivery replay and complete over reconstruction. | Either derive from complete deliveries with explicit over rules or persist validated maiden figures in Scoring. |
| Run-out source stores only `fielderIds` and `runOutType`; it does not identify who made a direct hit or preserve each assisted fielder's role. | Team dismissal is known, but individual direct-hit credit and role-aware assisted attribution are not. | Scoring Service must add an explicit direct-hit player ID and structured assisted fielder entries with player IDs and roles. Count one team wicket per run-out. If individual credit cannot be established, mark individual attribution unavailable; do not assume equal/fractional credit. |
| Match result enum allows `NO_RESULT`, but current finalization requires two completed innings and observed result calculation returns win/tie. | No-results cannot currently be sourced through the normal finalization path; cancellation is not equivalent. | Define and implement a Match-owned no-result finalization flow before publishing such records. |
| Match Service finalization currently requires exactly two ordered innings; Scoring second-innings setup is limited to supported limited-overs, one-innings-per-team matches. | The `TEST` format and `inningsPerTeam: 2` configuration do not currently provide a complete multi-innings Test scoring/finalization flow. | Resolve supported formats/lifecycle before including Test career records. |
| No rain-revised target/overs, competition, tournament, season, or venue-normalization model is present in reviewed schemas. | DLS/required-rate variants, season leaderboards, and competition records are unavailable or limited. | Add source-owned metadata before offering those filters or calculations. |
| No stored partnership records or unified event stream. | Partnership stats require reconstruction and are indeterminate around retirement/resume and batter changes in historical matches. | Add the single ordered event-sequence contract above; mark unreconstructible historical cases unavailable. |
| Player and Team APIs expose current profile values, not match-time snapshots; Player list is unpaginated and there is no batch lookup. | Historical names may drift; enrichment can be inefficient. | Keep stable IDs authoritative; capture match-time player/team display-name snapshots for historical scorecards. Add optional batch reads for current profile enrichment if required. |
| No standalone fielding/all-round awards or all-round rating exists. | Stats cannot truthfully present those as existing awards or use an existing combined rating. | Display actual component metrics; approve any future composite formula and source ownership separately. |

### Decisions to confirm before implementation

1. **Official XI size and confirmation workflow:** Confirm whether the
   separately stored official XI must contain exactly eleven players for
   every supported format, and who/what confirms it. A confirmed XI itself
   remains mandatory for official appearances.
2. **Run-out role vocabulary and assisted credit:** Confirm the Scoring
   Service role values for assisted participants and whether any
   role-specific individual credit should be published. Direct-hit attribution
   requires the identified player; absent individual source credit remains
   unavailable, with no equal-credit default.
3. **All-round leaderboard:** Confirm whether paired batting/bowling measures
   without a composite rank satisfy the requirement, or specify an approved
   ranking formula and minimum qualifications.
4. **No-result and supported formats:** Confirm whether no-result and
   multi-innings/Test statistics are in scope before their Match/Scoring
   lifecycle support exists.
5. **Display precision and ties:** Select display rounding and whether tied
   leaderboards share positions or use an additional stable tie-break.

These are specification decisions only. No implementation was performed.
