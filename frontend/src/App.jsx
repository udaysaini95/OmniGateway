// App.jsx — OmniGateway Master Dashboard
import { useState } from "react";
import { ShieldCheck, Cpu, Terminal, ExternalLink } from "lucide-react";
import KeyRegistration from "./components/KeyRegistration.jsx";
import Playground from "./components/Playground.jsx";
import MetricsPanel from "./components/MetricsPanel.jsx";
import CircuitBreaker from "./components/CircuitBreaker.jsx";
import ProviderHealth from "./components/ProviderHealth.jsx";
import RequestFeed from "./components/RequestFeed.jsx";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("omni_token") || null);
  const [circuitState, setCircuitState] = useState("CLOSED");
  const [activeTab, setActiveTab] = useState("gateway");

  return (
    <div className="app-wrapper">
      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <div className="logo-icon">⚡</div>
          <div>
            <span className="logo-text">OmniGateway</span>
            <div className="logo-sub">AI Reverse Proxy &amp; Semantic Cache</div>
          </div>
        </div>

        <div className="header-right">
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            <span className="status-dot" />
            <span>Gateway Online</span>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            style={{ textDecoration: "none" }}
          >
            <Terminal size={12} /> Docs <ExternalLink size={10} />
          </a>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === "gateway" ? "active" : ""}`}
          onClick={() => setActiveTab("gateway")}
        >
          <Cpu size={14} /> Live Gateway Console
        </button>
        <button
          className={`nav-tab ${activeTab === "guide" ? "active" : ""}`}
          onClick={() => setActiveTab("guide")}
        >
          <Terminal size={14} /> Quickstart &amp; SDK Guide
        </button>
      </div>

      {/* Main Content */}
      <main className="main-content">
        {/* Hero Banner */}
        <section className="hero-banner">
          <h1 className="hero-title">High-Performance AI Reverse Proxy Engine</h1>
          <p className="hero-subtitle">
            Zero-downtime multi-provider routing with AES-256 encrypted BYOK secrets, sub-25ms semantic vector caching, and automated circuit breaker failover.
          </p>
          <div className="hero-pills">
            <span className="hero-pill">🔐 BYOK AES-256-CBC Encrypted</span>
            <span className="hero-pill">⚡ Semantic Vector Cache (&gt;0.92 Cosine)</span>
            <span className="hero-pill">🛡️ Circuit Breaker (Gemini → Groq Failover)</span>
            <span className="hero-pill">⏱️ Token Bucket Rate Limiting</span>
            <span className="hero-pill">🔄 100% OpenAI Drop-In Compatible</span>
          </div>
        </section>

        {activeTab === "gateway" ? (
          <>
            <div className="dashboard-grid">
              {/* Left Column (55%): BYOK Keys & Live Playground */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <KeyRegistration onTokenSet={setToken} />
                <Playground />
              </div>

              {/* Right Column (45%): Metrics & Resilience Controls */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <MetricsPanel />
                <CircuitBreaker onStateChange={setCircuitState} />
                <ProviderHealth circuitState={circuitState} />
              </div>
            </div>

            {/* Request Feed (Last 20 requests) */}
            <RequestFeed />
          </>
        ) : (
          <div className="card fade-in" style={{ padding: 28 }}>
            <div className="card-header">
              <h2 className="card-title">
                <span className="title-icon"><Terminal size={14} /></span>
                Drop-In Integration Guide
              </h2>
            </div>

            <div style={{ lineHeight: 1.8, fontSize: 13, color: "var(--text-secondary)" }}>
              <p style={{ marginBottom: 16 }}>
                OmniGateway implements standard <strong>OpenAI API specifications</strong> (<code style={{ color: "var(--accent-light)" }}>/v1/chat/completions</code>). You can drop it into any existing application by changing just two parameters:
              </p>

              <div className="section-label" style={{ marginTop: 20 }}>1. Official OpenAI SDK (Python / Node.js)</div>
              <pre className="token-display" style={{ color: "var(--text-primary)", background: "var(--bg-elevated)", padding: 16 }}>
{`// JavaScript / TypeScript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:4000/v1", // OmniGateway URL
  apiKey: "${token || 'omni_your_gateway_token'}" // Your encrypted Gateway Token
});

const response = await client.chat.completions.create({
  model: "default",
  messages: [{ role: "user", content: "Explain quantum computing in simple terms" }]
});`}
              </pre>

              <div className="section-label" style={{ marginTop: 20 }}>2. Python LangChain / LangGraph</div>
              <pre className="token-display" style={{ color: "var(--text-primary)", background: "var(--bg-elevated)", padding: 16 }}>
{`# Python LangChain Drop-In
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://localhost:4000/v1",
    api_key="${token || 'omni_your_gateway_token'}",
    model="default"
)

response = llm.invoke("What is a reverse proxy?")`}
              </pre>

              <div className="section-label" style={{ marginTop: 20 }}>3. Direct cURL Request</div>
              <pre className="token-display" style={{ color: "var(--text-primary)", background: "var(--bg-elevated)", padding: 16 }}>
{`curl -X POST http://localhost:4000/v1/chat/completions \\
  -H "Authorization: Bearer ${token || 'omni_your_gateway_token'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "Explain Docker"}]
  }'`}
              </pre>
            </div>
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "24px 0", fontSize: 12, color: "var(--text-muted)", borderTop: "1px solid var(--border)", marginTop: 40 }}>
        OmniGateway v1.0 • Built with Node.js, Express, React, and Google Generative AI • AES-256 BYOK Architecture
      </footer>
    </div>
  );
}
