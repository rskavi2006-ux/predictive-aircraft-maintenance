# ADR 0001: Modular monolith

- Status: Accepted
- Date: 2026-10-04

## Context
AeroGuard has many domain areas (auth, fleet, telemetry, alerts, scheduling, work orders, compliance, audit). It is built by one developer while learning, and must run with a single `docker compose up`.

## Decision
One API app with internal modules (`auth, users, fleet, components, telemetry, health, alerts, tasks, scheduling, workorders, compliance, reports, audit`). Each module has routes, controller, service, schema and tests. A module never imports another module's Mongoose model; it calls that module's service.

## Alternatives considered
- Microservices: more moving parts, harder local setup, no benefit at this scale.
- Unstructured monolith: faster at first, but boundaries blur and later extraction is painful.

## Consequences
- Simple deployment and debugging.
- Module boundaries are enforced by convention and code review (a lint rule may be added later).
- Cross-module writes need an explicit transaction approach (see ADR 0002 notes).