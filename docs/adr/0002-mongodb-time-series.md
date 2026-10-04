# ADR 0002: MongoDB with a time-series collection for telemetry

- Status: Accepted
- Date: 2026-10-04

## Context
Telemetry is high-volume, append-mostly and queried by component and time range. Other data (users, alerts, tasks) is document-shaped with relations by id.

## Decision
Use MongoDB for everything. Telemetry goes in a time-series collection (timeField `timestamp`, metaField `{aircraftId, componentId}`).

## Alternatives considered
- PostgreSQL + TimescaleDB: strong for time series, but adds a second paradigm to a MERN-based project.
- Separate time-series database: extra infrastructure.

## Consequences
- Time-series collections do not support unique indexes, so idempotent ingest by `(componentId, timestamp)` needs a separate dedupe strategy (TODO: decide in Chunk 4A).
- Multi-document transactions (e.g. completing a work order) need a replica set, even single-node in docker-compose (TODO: decide in Chunk 1C).