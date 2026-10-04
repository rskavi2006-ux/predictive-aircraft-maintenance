# ADR 0010: Reduced scope to reach a working core loop first

- Status: Accepted (temporary; each item is revisited later)
- Date: 2026-10-04

## Context
A working Predict, Plan, Comply loop was needed quickly. Some original decisions cost more setup time than they add to the first working version.

## Decision
- Authentication uses an 8-hour access token only. Refresh-token rotation comes later.
- Telemetry uses a normal collection with a unique index on (componentId, timestamp) instead of a time-series collection. This also solves the idempotency problem noted in ADR 0002. Time-series can be adopted later by migrating the collection.
- Prediction runs right after ingest, inside the API. Moving it to a BullMQ worker job is planned (ADR 0003 still applies).
- Latest health scores are stored in MongoDB (healthscores) instead of a Redis cache. A cache can be added in front later.
- The dashboard will poll instead of using SSE for now (ADR 0006 still applies).
- The UI uses plain CSS first; shadcn/ui + Tailwind (ADR 0008) is deferred.
- Docker Compose for the app, Dockerfiles and CI are deferred.
- Route handlers stay thin inside *.routes.ts with logic in services (instead of separate controller files), except the health module.

## Alternatives considered
Building everything in the original order: more complete, but the core loop would arrive much later.

## Consequences
- Faster path to a demonstrable loop.
- Every deferred item is tracked here and in the CHANGELOG so it is not forgotten.