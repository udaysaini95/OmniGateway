// CircuitBreaker.jsx — Circuit Breaker Status & Simulation Controls
import { useState, useEffect } from "react";
import { Activity, AlertTriangle, RotateCcw, ZapOff } from "lucide-react";
import { fetchCircuitBreaker, simulateFail, resetCircuitBreaker } from "../services/api.js";

export default function CircuitBreaker({ onStateChange }) {
  const [breaker, setBreaker] = useState({
    state: "CLOSED",
    failureCount: 0,
    lastFailureTime: null,
    cooldownMs: 30000,
    failureThreshold: 3,
  });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function loadState() {
    try {
      const data = await fetchCircuitBreaker();
      setBreaker(data);
      onStateChange?.(data.state);
    } catch {
      // Backend may be offline
    }
  }

  useEffect(() => {
    loadState();
    const interval = setInterval(loadState, 2500);
    return () => clearInterval(interval);
  }, []);

  async function handleSimulateFail() {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await simulateFail();
      setBreaker(data);
      onStateChange?.(data.state);
      setFeedback("Simulated failure recorded. Threshold: 3 consecutive failures to OPEN.");
    } catch (err) {
      setFeedback("Failed to trigger simulation: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await resetCircuitBreaker();
      setBreaker(data);
      onStateChange?.(data.state);
      setFeedback("Circuit breaker reset to CLOSED (Healthy).");
    } catch (err) {
      setFeedback("Failed to reset: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  const stateClass =
    breaker.state === "CLOSED"
      ? "badge-closed"
      : breaker.state === "OPEN"
      ? "badge-open"
      : "badge-half-open";

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="title-icon"><Activity size={14} /></span>
          Circuit Breaker Monitor
        </h2>
        <span id="circuit-state-badge" className={`badge ${stateClass}`}>
          ● {breaker.state}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div className="metric-card" style={{ padding: "10px 14px" }}>
          <div className="metric-label">Failures</div>
          <div className="metric-value" style={{ fontSize: 20 }}>
            {breaker.failureCount} <span style={{ fontSize: 12, color: "var(--text-muted)" }}>/ {breaker.failureThreshold}</span>
          </div>
        </div>
        <div className="metric-card" style={{ padding: "10px 14px" }}>
          <div className="metric-label">Cooldown</div>
          <div className="metric-value" style={{ fontSize: 20 }}>
            {breaker.cooldownMs / 1000}s
          </div>
        </div>
      </div>

      <div className="info-box" style={{ marginBottom: 14, fontSize: 11 }}>
        {breaker.state === "CLOSED" && (
          <span>🟢 Gemini is healthy. Primary traffic routes to <strong>Google Gemini 1.5 Flash</strong>.</span>
        )}
        {breaker.state === "OPEN" && (
          <span>🔴 Breaker tripped! All requests auto-routed to <strong>Meta Llama-3 (via Groq)</strong>. Cooldown active.</span>
        )}
        {breaker.state === "HALF_OPEN" && (
          <span>🟡 Probing recovery. Next incoming request acts as probe to Gemini.</span>
        )}
      </div>

      {feedback && (
        <div className="info-box warning" style={{ marginBottom: 12, fontSize: 11 }}>
          {feedback}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          id="simulate-fail-btn"
          className="btn btn-danger btn-sm"
          style={{ flex: 1 }}
          onClick={handleSimulateFail}
          disabled={loading}
        >
          <ZapOff size={12} /> Simulate Gemini Fail
        </button>
        <button
          id="reset-breaker-btn"
          className="btn btn-secondary btn-sm"
          style={{ flex: 1 }}
          onClick={handleReset}
          disabled={loading}
        >
          <RotateCcw size={12} /> Reset Breaker
        </button>
      </div>
    </div>
  );
}
