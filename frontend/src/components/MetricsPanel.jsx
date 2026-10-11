// MetricsPanel.jsx — Live Telemetry Dashboard
import { useState, useEffect } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { fetchMetrics } from "../services/api.js";

function CountUp({ value, duration = 600 }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    setDisplay(value);
  }, [value]);
  return <span>{typeof value === "number" ? value.toLocaleString() : value}</span>;
}

export default function MetricsPanel() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await fetchMetrics();
      setMetrics(data);
    } catch {/* backend not running yet */} finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  const hitRate = metrics?.hitRate ?? 0;
  const totalRequests = metrics?.totalRequests ?? 0;
  const cacheHits = metrics?.cacheHits ?? 0;
  const tokensSaved = metrics?.totalTokensSaved ?? 0;
  const avgLatency = metrics?.avgLatencyMs ?? 0;
  const costSaved = metrics?.estimatedCostSavedUsd ?? 0;
  const cacheEntries = metrics?.totalEntries ?? 0;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="title-icon"><BarChart3 size={14} /></span>
          Live Metrics
        </h2>
        <button id="refresh-metrics-btn" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={11} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {metrics === null && !loading ? (
        <div className="info-box warning">⚠️ Backend not reachable. Start the backend server first.</div>
      ) : (
        <>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Total Requests</div>
              <div className="metric-value accent"><CountUp value={totalRequests} /></div>
              <div className="metric-sub">all time</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Cache Hits</div>
              <div className="metric-value success"><CountUp value={cacheHits} /></div>
              <div className="metric-sub">of {totalRequests} requests</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Tokens Saved</div>
              <div className="metric-value accent"><CountUp value={tokensSaved} /></div>
              <div className="metric-sub">${costSaved.toFixed(4)} USD saved</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Avg Latency</div>
              <div className="metric-value" style={{ color: avgLatency < 100 ? "var(--success)" : avgLatency < 1000 ? "var(--warning)" : "var(--error)" }}>
                <CountUp value={avgLatency} />
                <span style={{ fontSize: 14, marginLeft: 2 }}>ms</span>
              </div>
              <div className="metric-sub">vs ~2,300ms upstream</div>
            </div>
          </div>

          {/* Cache Hit Rate Progress */}
          <div className="progress-bar-wrap">
            <div className="progress-label">
              <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>Cache Hit Rate</span>
              <span style={{ color: hitRate > 50 ? "var(--success)" : "var(--text-primary)", fontWeight: 700 }}>{hitRate}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill success" style={{ width: `${hitRate}%` }} />
            </div>
          </div>

          <div className="metric-card" style={{ marginTop: 8 }}>
            <div className="metric-label">Cache Entries</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <div className="metric-value" style={{ fontSize: 20 }}><CountUp value={cacheEntries} /></div>
              <div className="metric-sub" style={{ marginTop: 0 }}>stored embeddings (1hr TTL)</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
