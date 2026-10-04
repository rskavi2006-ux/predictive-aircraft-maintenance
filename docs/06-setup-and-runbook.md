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
## Databases and worker (local)

```powershell
docker run -d --name aeroguard-mongo -p 27017:27017 mongo:7
docker run -d --name aeroguard-redis -p 6379:6379 redis:7
npm run dev:api      # terminal 1
npm run dev:worker   # terminal 2
npm run ping -w @aeroguard/worker   # enqueue a test job
```

The worker writes a heartbeat to Redis every 5 seconds (15 second TTL). The API health endpoint reports it as the `worker` dependency, so health returns 503 while the worker is not running.
(Chunk 1C replaces the `docker run` commands with docker compose.)
