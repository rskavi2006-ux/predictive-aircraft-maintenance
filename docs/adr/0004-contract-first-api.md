# ADR 0004: Contract-first REST API

- Status: Accepted
- Date: 2026-10-04

## Context
The web app, simulator and tests all consume the API. Shared types and a documented contract reduce drift.

## Decision
REST under `/api/v1` with an OpenAPI spec (`docs/api/openapi.yaml`) and Swagger UI. Zod schemas and DTO types live in `packages/shared` and are used by api, worker and web.

## Alternatives considered
- Code-first docs generated after the fact: contract can drift from behaviour.
- GraphQL: more flexibility than needed, extra learning cost.

## Consequences
- Each endpoint is specified before or with its implementation.
- Changes to shared schemas require rebuilding `packages/shared`.