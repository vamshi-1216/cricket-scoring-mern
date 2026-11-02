# Internal Service Authentication Review

Reviewed 2026-11-02. Read-only inspection; no tests, builds, lint, type checks, or runtime verification were performed. No `.env` values or secret values were read or included.

## CRITICAL

None found.

## WARNING

- Both services require a secret length of at least 32 characters, but the schemas accept whitespace-only values. Such a value is syntactically valid yet unsuitable as a shared secret. Configure a high-entropy secret and consider rejecting values that are blank after trimming.
  - `services/match-service/src/config/env.js:12`
  - `services/scoring-service/src/config/env.js:10`
- Deployment secret provisioning and whether service URLs use TLS were not verified.

## PASSED

- Both environment schemas expose `INTERNAL_SERVICE_SECRET`; missing values are rejected by the internal-auth middleware, and configured values shorter than 32 characters fail environment validation.
  - `services/match-service/src/config/env.js:12,16-20`
  - `services/scoring-service/src/config/env.js:10,16-20`
- Both middleware implementations reject missing headers and compare SHA-256 digests with `timingSafeEqual`. Hashing both inputs to fixed-length digests avoids length-mismatch exceptions.
  - `services/match-service/src/middleware/require-internal-service.js:5-32`
  - `services/scoring-service/src/middleware/require-internal-service.js:5-32`
- Scoring Service sends the internal header from the shared finalization helper used by immediate finalization and the pending-finalization retry worker. Match Service sends it when requesting awards.
  - `services/scoring-service/src/modules/innings/innings.service.js:122-168,188-217,955-965`
  - `services/match-service/src/modules/matches/match.service.js:362-367`
- Match finalization and Scoring awards routes apply internal authentication. Public match detail and scorecard GET routes remain unguarded.
  - `services/match-service/src/modules/matches/match.routes.js:14-15`
  - `services/scoring-service/src/modules/matches/match.routes.js:10,12`
- Inspected handlers do not return or log the secret/header. Finalization retains its completed-result idempotency and conditional atomic result/awards update; retry state remains handled by Scoring Service.
  - `services/match-service/src/modules/matches/match.service.js:923-981`
  - `services/scoring-service/src/modules/innings/innings.service.js:167-217,955-965`

## Phase A Scoring Permit Infrastructure Review

Reviewed 2026-11-02. Read-only source review; no tests, builds, lint, type checks, or migrations were run. No `.env` values or secrets were read.

### CRITICAL

None found.

### HIGH

- Transfer, reclaim, and finalization can leave permits active. These flows do not close the permit gate or wait for `activePermitCount` to drain; permit status retrieval also does not check the current scorer, permission version, or match status. An old permit can therefore continue to appear active after access changes or finalization.
  - `services/match-service/src/modules/matches/match.service.js:1171-1211,1259-1313,1316-1384` — `finalizeMatch`, `transferScoringAccess`, `reclaimScoringAccess`
  - `services/match-service/src/modules/matches/match.service.js:376-382` — `getScoringPermitStatus`

### MEDIUM

- Reusing a request ID returns the existing permit before checking its state or current match access. A released permit can therefore be returned in a successful acquisition response; callers must not treat that response as proof that a permit is active.
  - `services/match-service/src/modules/matches/match.service.js:170-181,218-237,306-310` — `assertDuplicatePermitMatches`, `acquireScoringPermit`
  - `services/match-service/src/modules/matches/match.controller.js:153-163` — `acquireScoringPermit`

### PASSED

- Permit creation and active-count increment share a MongoDB transaction. Release state transition and count decrement also share a transaction; release checks the active state and requires a positive count before decrementing.
  - `services/match-service/src/modules/matches/match.service.js:194-215,316-374` — `runScoringPermitTransaction`, `acquireScoringPermit`, `releaseScoringPermit`
- Unique indexes cover `permitId` and `(matchId, requestId)`. Startup awaits index creation; no TTL index is defined.
  - `services/match-service/src/modules/matches/scoring-permit.model.js:5,26-30`
  - `services/match-service/src/config/database.js:8-11`
- Permit endpoints use internal-service authentication. Acquisition verifies the submitted scorer ID and permission version against the current Match record. No direct scorer-ID impersonation path was identified in the reviewed endpoints.
  - `services/match-service/src/modules/matches/match.routes.js:14-27`
  - `services/match-service/src/modules/matches/match.service.js:239-260`
- Matches without established scoring ownership fail closed for permit acquisition.
  - `services/match-service/src/modules/matches/match.service.js:239-260`

## Phase E Match Finalization Permit-Draining Review

Reviewed 2026-11-02. Static, read-only review of Phase E and directly related Phase C/D code. No runtime verification was performed.

### CRITICAL

None found.

### HIGH

None found.

### MEDIUM

- The completed-match fast path in `beginFinalization` may report completion without checking ACTIVE permits or unresolved operations. This is reachable for legacy matches completed before Phase E, whose earlier finalization path did not drain permits. With no pending operation created, recovery will not revisit those permits. Before returning `COMPLETED`, verify the active permit count and records and reconcile only from definitive journal outcomes; unresolved legacy state must remain fail-closed and recoverable.
  - `services/match-service/src/modules/matches/match.service.js:1646-1680` — `beginFinalization`
- The unique `(matchId, permitId)` index may be incompatible with legacy ScoringOperation records lacking `permitId`. Multiple missing values for the same match can conflict on the unique index, and startup awaits index creation, potentially preventing Scoring Service startup. Migrate or otherwise resolve legacy records before index creation, or use a partial unique index restricted to valid `permitId` values.
  - `services/scoring-service/src/modules/scoring-operations/scoring-operation.model.js:57-59`

### PASSED

- Normal permit reconciliation releases only after a definitive `COMMITTED` or `ABORTED` journal outcome; no age-based or forced release path was found.
- Result, awards, completed status, closed permit gate, and finalization history are persisted together in the Match Service transaction.
- Unknown transaction outcomes remain pending/recoverable rather than being treated as aborts or confirmed completion.
- Conditional worker claims and claim-ID fencing prevent competing workers from persisting duplicate results/history.
- Transfer/reclaim and finalization are coordinated through the permit gate and pending-operation checks; matching retries reuse the existing operation and conflicting requests are rejected.
