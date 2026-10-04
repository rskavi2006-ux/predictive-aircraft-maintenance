# ADR 0008: UI library: shadcn/ui + Tailwind CSS

- Status: Accepted
- Date: 2026-10-04

## Context
The UI needs tables, forms, dialogs, timelines and dashboards, built quickly and consistently.

## Decision
Use shadcn/ui components on Tailwind CSS, with Recharts for charts, React Hook Form + Zod for forms, and TanStack Query for server state.

## Alternatives considered
- MUI or Ant Design: heavier, more opinionated styling.
- Hand-written CSS: slower and inconsistent.

## Consequences
- Components are copied into the repo, so they are editable and have no runtime library lock-in.
- Tailwind setup is part of Chunk 1B.