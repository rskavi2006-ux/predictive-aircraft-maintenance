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

## Alerts and tasks

| Collection | Key fields | Indexes and why |
|---|---|---|
| alerts | aircraftId, componentId, cause, healthScore, failureProbability, rulDays, confidence, contributingFactors, priority, status, active, decidedBy, decidedAt, decisionNote, taskId | {componentId, cause} unique where active=true (de-duplication: one open or deferred alert per component and cause, safe under races); {status, priorityRank, createdAt} (alert queue, most urgent first); {aircraftId, status} |
| tasks | aircraftId, componentId, sourceAlertId, sourceType, title, ataChapter, requiredLicense, estimatedDurationHours, dueLimit, estimatedDueDate, priority, status | {status, estimatedDueDate} (scheduler reads pending tasks earliest due first); {aircraftId, status} (bundling per aircraft); {componentId, status} (is there an open task for this component) |

Alert de-duplication: while an alert for the same component and cause is OPEN, new readings refresh its evidence and priority instead of creating another. DEFERRED alerts stay active. No new alert is raised while a task for the component is still open. Licence mapping and task durations are placeholders (TODO: verify).

## Maintenance windows and work orders

| Collection | Key fields | Indexes and why |
|---|---|---|
| maintenancewindows | aircraftId, registration, type (LINE/BASE/AOG), station, start, end, capacityHours, bookedHours, licences, status | {aircraftId, start} (windows of one aircraft in time order); {status, start} (scheduler reads upcoming planned windows) |
| workorders | number, aircraftId, windowId, taskIds, status, findings, signedOffBy, signedOffAt | number unique; {aircraftId, status}; {windowId}; {status, createdAt -1} (work order list) |

Scheduling rules: a window must start before the task due date, the crew licences must include the task licence, and the tasks must fit in the free hours (capacity minus booked). Downtime saved = (tasks in a window - 1) x setup overhead (assumption: 4 hours per window). Confirm recomputes the plan on the server, reserves capacity atomically, marks the tasks SCHEDULED and creates the work order. Without a replica set there are no multi-document transactions, so a failed step rolls the reservation back by hand.
