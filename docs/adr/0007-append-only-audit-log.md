# ADR 0007: Append-only audit log

- Status: Accepted
- Date: 2026-10-04

## Context
Maintenance decisions and sign-offs must be traceable for audits.

## Decision
An `audit` module stores records with actorId, actorRole, action, entityType, entityId, before, after, timestamp and requestId. There is no update or delete code path in the application. Reads are limited to AUDITOR and ADMIN.

## Alternatives considered
- Logging only to files: hard to query and filter.
- Mutable history table: allows silent edits.

## Consequences
- Immutability is enforced at the application level; database-level protection (restricted DB user permissions) is a possible hardening step.
- Every state change in other modules must call the audit service.