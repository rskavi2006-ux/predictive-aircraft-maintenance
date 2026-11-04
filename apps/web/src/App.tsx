import { useState, useEffect, useCallback } from 'react';

interface HealthResponse {
  status: string;
  services: {
    api: string;
    mongo: string;
    redis: string;
  };
  timestamp?: string;
}

interface StatusState {
  loading: boolean;
  api: 'connected' | 'disconnected';
  mongo: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
  lastChecked: string | null;
  errorMessage: string | null;
}

export function App() {
  const [state, setState] = useState<StatusState>({
    loading: true,
    api: 'disconnected',
    mongo: 'disconnected',
    redis: 'disconnected',
    lastChecked: null,
    errorMessage: null,
  });

  const checkHealth = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetch('/api/v1/health');
      let data: HealthResponse | null = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (data && data.services) {
        // HTTP 200 or 503 both return JSON body with per-dependency statuses
        setState({
          loading: false,
          api: data.services.api === 'up' ? 'connected' : 'disconnected',
          mongo: data.services.mongo === 'connected' ? 'connected' : 'disconnected',
          redis: data.services.redis === 'connected' ? 'connected' : 'disconnected',
          lastChecked: new Date().toLocaleTimeString(),
          errorMessage: response.status === 503 ? 'One or more database dependencies are down' : null,
        });
      } else {
        // HTTP response without valid JSON body
        setState({
          loading: false,
          api: 'disconnected',
          mongo: 'disconnected',
          redis: 'disconnected',
          lastChecked: new Date().toLocaleTimeString(),
          errorMessage: `HTTP Error ${response.status}: Unable to parse health response`,
        });
      }
    } catch (err) {
      // Network error (API server offline)
      setState({
        loading: false,
        api: 'disconnected',
        mongo: 'disconnected',
        redis: 'disconnected',
        lastChecked: new Date().toLocaleTimeString(),
        errorMessage: 'API backend server unreachable',
      });
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const getStatusBadge = (status: 'connected' | 'disconnected') => {
    const isOk = status === 'connected';
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.9rem',
          borderRadius: '9999px',
          fontWeight: 600,
          fontSize: '0.875rem',
          backgroundColor: isOk ? '#dcfce7' : '#fee2e2',
          color: isOk ? '#166534' : '#991b1b',
          border: `1px solid ${isOk ? '#86efac' : '#fca5a5'}`,
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isOk ? '#22c55e' : '#ef4444',
          }}
        />
        {isOk ? 'Connected' : 'Disconnected'}
      </span>
    );
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '2rem 1rem',
      }}
    >
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <header style={{ marginBottom: '2.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#38bdf8', margin: 0 }}>
                AeroGuard System Monitor
              </h1>
              <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '0.95rem' }}>
                Predictive Maintenance & Compliance Platform Infrastructure Health
              </p>
            </div>
            <button
              onClick={checkHealth}
              disabled={state.loading}
              style={{
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                padding: '0.6rem 1.2rem',
                borderRadius: '0.5rem',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: state.loading ? 0.7 : 1,
              }}
            >
              {state.loading ? 'Checking...' : 'Refresh Status'}
            </button>
          </div>
        </header>

        {/* Diagnostic Banner */}
        {state.errorMessage && (
          <div
            style={{
              backgroundColor: '#450a0a',
              border: '1px solid #991b1b',
              color: '#fca5a5',
              padding: '1rem',
              borderRadius: '0.5rem',
              marginBottom: '2rem',
              fontSize: '0.9rem',
            }}
          >
            <strong>Warning:</strong> {state.errorMessage}
          </div>
        )}

        {/* Status Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          {/* API Status Card */}
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: '1.5rem',
              borderRadius: '0.75rem',
              border: '1px solid #334155',
            }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#94a3b8', marginTop: 0 }}>
              Backend API Server
            </h3>
            <div style={{ margin: '1rem 0' }}>{getStatusBadge(state.api)}</div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>HTTP /api/v1/health</span>
          </div>

          {/* Mongo Status Card */}
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: '1.5rem',
              borderRadius: '0.75rem',
              border: '1px solid #334155',
            }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#94a3b8', marginTop: 0 }}>
              MongoDB Database
            </h3>
            <div style={{ margin: '1rem 0' }}>{getStatusBadge(state.mongo)}</div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Time-Series Telemetry DB</span>
          </div>

          {/* Redis Status Card */}
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: '1.5rem',
              borderRadius: '0.75rem',
              border: '1px solid #334155',
            }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#94a3b8', marginTop: 0 }}>
              Redis Cache & Queue
            </h3>
            <div style={{ margin: '1rem 0' }}>{getStatusBadge(state.redis)}</div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>BullMQ & SSE Pub/Sub Broker</span>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ marginTop: '3rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
          {state.lastChecked && <p>Last checked at {state.lastChecked} (Auto-refreshes every 5s)</p>}
        </footer>
      </div>
    </div>
  );
}

export default App;
