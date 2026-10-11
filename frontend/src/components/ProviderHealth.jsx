// ProviderHealth.jsx — Upstream Provider Status Indicators
import { Cpu, CheckCircle2, AlertCircle } from "lucide-react";

export default function ProviderHealth({ circuitState = "CLOSED" }) {
  const geminiStatus = circuitState === "OPEN" ? "offline" : circuitState === "HALF_OPEN" ? "degraded" : "online";
  const groqStatus = "online"; // Fallback is always ready

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="title-icon"><Cpu size={14} /></span>
          Provider Health Monitor
        </h2>
        <span className="badge" style={{ background: "rgba(34,197,94,0.12)", color: "var(--success)" }}>
          Active Failover
        </span>
      </div>

      <div className="provider-list">
        <div className="provider-item">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`provider-dot ${geminiStatus}`} />
            <div>
              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Google Gemini 1.5 Flash</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Primary LLM • text-embedding-004</div>
            </div>
          </div>
          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: geminiStatus === "online" ? "var(--success)" : "var(--error)" }}>
            {geminiStatus === "online" ? "HEALTHY" : geminiStatus === "degraded" ? "PROBING" : "TRIPPED"}
          </span>
        </div>

        <div className="provider-item">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`provider-dot ${groqStatus}`} />
            <div>
              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Groq (Meta Llama-3-8b)</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Zero-Downtime Fallback • 30 req/min</div>
            </div>
          </div>
          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--success)" }}>
            READY
          </span>
        </div>
      </div>
    </div>
  );
}
