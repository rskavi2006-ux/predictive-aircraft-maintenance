# 05. Data Model

Collections, fields and index justifications are added as each module is built.

## Collections

## Indexes and why
## Core collections (built so far)

| Collection | Key fields | Indexes and why |
|---|---|---|
| users | name, email, passwordHash, role, licenseCategory, isActive | email unique (login lookup, no duplicates) |
| aircraft | registration, type, msn, flight hours and cycles, status, baseStation, averageDailyUtilisation | registration unique (business key); status (fleet filters) |
| components | aircraftId, partNumber, serialNumber, name, ataChapter, kind, limits | {aircraftId, ataChapter} (aircraft detail page); {partNumber, serialNumber} unique (a physical part exists once) |
| auditlogs | actorId, actorRole, action, entityType, entityId, before, after, requestId, timestamp | {entityType, entityId, timestamp -1} (history of one entity); {timestamp -1} (latest first); append-only |
| readings | componentId, aircraftId, timestamp, egt, vibration, oilPressure, oilTemp | {componentId, timestamp} unique (idempotent ingest and range queries) |
| healthscores | componentId, aircraftId, healthScore, failureProbability, rulDays, confidence, contributingFactors, asOf | componentId unique (one latest score per component); {aircraftId, healthScore} (fleet view, worst first) |

All telemetry is simulated. Sensor limits in the predictor are fictional (TODO: verify before any real use).
