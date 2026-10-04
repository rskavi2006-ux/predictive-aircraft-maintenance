# 06. Setup and Runbook

## Prerequisites

- Node.js 22 or newer (see `.nvmrc`)
- Git
- Docker Desktop (needed from Chunk 1C for MongoDB and Redis)

## Local setup (PowerShell)

```powershell
git clone <repo-url>
cd aeroguard
Copy-Item .env.example .env
npm install
npm run build
```

## Run the API

```powershell
npm run dev:api
```

Health check (shows status and body even on 503):

```powershell
curl.exe -i http://localhost:4000/api/v1/health
```

- `200`: MongoDB and Redis both reachable.
- `503`: at least one dependency is down. The body lists each dependency with `status`, `latencyMs` and `error`.

## Quality checks

```powershell
npm test
npm run typecheck
npm run lint
```

## Common problems

- `Invalid environment: ...` on startup: a variable in `.env` is missing or invalid; the message lists each one.
- Health returns 503 locally: MongoDB or Redis is not running yet (expected until Chunk 1C).
- A pasted PowerShell block shows `>>`: press Ctrl+C and paste the whole block again.