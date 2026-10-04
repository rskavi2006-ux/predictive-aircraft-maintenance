# ADR 0005: Human approval before scheduling

- Status: Accepted
- Date: 2026-10-04

## Context
Predictions are probabilistic and v1 uses simulated data. Maintenance decisions affect safety and cost.

## Decision
Only a licensed ENGINEER can approve, reject or defer an alert, with a mandatory note. Only an approved alert creates a task. The PLANNER decides when work happens and confirms schedules; nothing is scheduled until confirmed. Whoever decides what to fix is not the person who decides when.

## Alternatives considered
- Automatic task creation above a threshold: faster, but removes accountability.
- One role doing both: removes separation of duties.

## Consequences
- Every decision is attributable and audit-logged.
- Regulatory context for these roles: TODO: verify.