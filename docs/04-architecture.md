# 04. Architecture

AeroGuard is a modular monolith (see ADR 0001). All telemetry comes from a simulator with fictional aircraft.

## 1. System context

```mermaid
flowchart LR
  Eng["Engineer"] --> AG["AeroGuard"]
  Plan["Planner"] --> AG
  Aud["Auditor"] --> AG
  Adm["Admin"] --> AG
  Sim["Telemetry simulator"] --> AG
```

## 2. Containers

```mermaid
flowchart LR
  Web["web: React + TS"] -->|REST + SSE| API["api: Express + TS"]
  Sim["simulator"] -->|POST telemetry batch| API
  API --> Mongo[("MongoDB")]
  API --> Redis[("Redis")]
  API -->|enqueue jobs| Redis
  Worker["worker: BullMQ"] -->|consume jobs| Redis
  Worker --> Mongo
  Worker -->|publish events| Redis
  Redis -->|pub/sub| API
  Shared["packages/shared: Zod schemas, DTOs, enums"] -.-> API
  Shared -.-> Worker
  Shared -.-> Web
```

## 3. Core loop: Predict, Plan, Comply

```mermaid
sequenceDiagram
  participant S as Simulator
  participant A as API
  participant Q as BullMQ
  participant W as Worker
  participant E as Engineer
  participant P as Planner
  S->>A: POST /telemetry/batch
  A->>Q: enqueue prediction job
  Q->>W: run prediction
  W->>A: health score, event via Redis pub/sub
  A-->>E: alert with explanation (SSE)
  E->>A: approve or reject or defer (note required)
  A->>A: approved alert creates PENDING task
  P->>A: POST /scheduling/preview
  A-->>P: bundled plan and downtime saved
  P->>A: POST /scheduling/confirm
  A->>A: work order created, tasks SCHEDULED
  E->>A: complete work order and sign off (CRS)
  A->>A: compliance record and audit log entry
```

Every state change writes an append-only audit log entry (ADR 0007).

## 4. How `packages/shared` is built and consumed

- `packages/shared` is an npm workspace (`@aeroguard/shared`) written in TypeScript and compiled to `dist/` with `tsc`.
- `api`, `worker` and `simulator` list it as a dependency (`"*"`), and npm links it into `node_modules` through workspaces.
- The root `npm run build` builds `shared` first, then the other apps, so they always import compiled output.
- `web` consumes it the same way once it is added in Chunk 1B (Vite resolves the workspace package).
- Docker builds use the repo root as build context so `packages/shared` is available (project rule 11).

## 5. Module boundaries

API modules: auth, users, fleet, components, telemetry, health, alerts, tasks, scheduling, workorders, compliance, reports, audit. Each has routes, controller, service, schema and tests. A module calls another module's service, never its model. Layering: route, validation middleware, controller, service, model.