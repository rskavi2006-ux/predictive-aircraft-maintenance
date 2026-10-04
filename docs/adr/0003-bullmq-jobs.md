# ADR 0003: BullMQ for background jobs

- Status: Accepted
- Date: 2026-10-04

## Context
Prediction runs, daily compliance checks and PDF report generation should not block API requests and need retries.

## Decision
Use BullMQ on Redis, with workers in `apps/worker`. BullMQ Redis connections set `maxRetriesPerRequest: null`.

## Alternatives considered
- In-process timers or `setImmediate`: no retries, lost on restart.
- Cron only: cannot handle event-driven jobs such as "predict after ingest".

## Consequences
- Redis becomes a required dependency (also used for cache and pub/sub).
- Jobs must be idempotent because they can be retried.