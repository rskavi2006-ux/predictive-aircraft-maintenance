# ADR 0006: Server-Sent Events for live updates

- Status: Accepted
- Date: 2026-10-04

## Context
The dashboard needs live health updates. Traffic is server-to-browser only.

## Decision
Use SSE via `GET /api/v1/stream`, fed by Redis pub/sub events.

## Alternatives considered
- WebSockets: bidirectional, but more complex than needed.
- Polling: simple, but wasteful and less live.

## Consequences
- Browser `EventSource` cannot send an Authorization header, so stream authentication needs a short-lived stream token, a cookie, or fetch-based streaming (TODO: decide in Chunk 4B).
- Reconnection is handled by the browser.