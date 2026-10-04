// Redis key the worker refreshes every 5s (15s TTL). The API health check reads it.
export const HEARTBEAT_KEY = 'aeroguard:worker:heartbeat';
export const SYSTEM_QUEUE = 'system';