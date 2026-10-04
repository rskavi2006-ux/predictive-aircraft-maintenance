# AeroGuard

Predictive aircraft maintenance platform: **Predict, Plan, Comply.**

AeroGuard predicts component failures, explains the prediction, helps plan the fix inside compliance deadlines, and generates audit-ready compliance reports. It assists engineers and planners; a human makes every final decision.

> **All telemetry is simulated.** There is no real airline data. Aircraft, components and degradation patterns are fictional.

## Status

Work in progress, built in small chunks. See [CHANGELOG.md](CHANGELOG.md).

## Tech stack

React + TypeScript (Vite), Node.js + Express + TypeScript, MongoDB (time-series), Redis, BullMQ, SSE, Docker, GitHub Actions.

## Repository layout

- `apps/api`: REST API (modular monolith)
- `apps/worker`: BullMQ workers
- `apps/web`: React app
- `apps/simulator`: telemetry generator
- `packages/shared`: Zod schemas, DTO types, enums
- `docs/`: architecture, data model, runbook, ADRs

## Getting started

Setup instructions are added in `docs/06-setup-and-runbook.md` as the platform comes together.

## Documentation

- [Architecture](docs/04-architecture.md)
- [Architecture decisions](docs/adr/README.md)

## License

MIT