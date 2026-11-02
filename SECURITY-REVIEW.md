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
