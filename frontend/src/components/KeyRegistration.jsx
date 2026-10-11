// KeyRegistration.jsx — BYOK Key Registration Form
import { useState } from "react";
import { Key, Eye, EyeOff, Copy, Check, Shield, AlertCircle } from "lucide-react";
import { registerKeys, setGatewayToken, getStoredToken } from "../services/api.js";

export default function KeyRegistration({ onTokenSet }) {
  const [geminiKey, setGeminiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [name, setName] = useState("");
  const [showGemini, setShowGemini] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(getStoredToken());
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  async function handleRegister(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await registerKeys(geminiKey.trim(), groqKey.trim(), name.trim() || "my-app");
      setToken(data.gatewayToken);
      setGatewayToken(data.gatewayToken);
      onTokenSet?.(data.gatewayToken);
      setGeminiKey("");
      setGroqKey("");
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="title-icon"><Shield size={14} /></span>
          BYOK Key Registration
        </h2>
        <span className="badge" style={{ background: "rgba(108,99,255,0.12)", color: "var(--accent-light)", border: "1px solid rgba(108,99,255,0.25)", fontSize: "10px" }}>
          AES-256 Encrypted
        </span>
      </div>

      {token ? (
        <div className="fade-in">
          <div className="info-box success-box" style={{ marginBottom: 14 }}>
            ✅ Gateway token active — your raw API keys are encrypted and never re-exposed.
          </div>
          <div className="section-label">Your Gateway Token</div>
          <div className="token-display">{token}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button id="copy-token-btn" className="btn btn-secondary btn-sm" onClick={copyToken}>
              {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Token</>}
            </button>
            <button id="new-token-btn" className="btn btn-secondary btn-sm" onClick={() => { setToken(null); setError(null); }}>
              Register New Keys
            </button>
          </div>
          <div className="info-box" style={{ marginTop: 12, fontSize: 11 }}>
            <strong>Usage:</strong> <code style={{ color: "var(--accent-light)" }}>Authorization: Bearer {token?.slice(0, 18)}...</code>
            <br />Change your SDK&apos;s <code style={{ color: "var(--accent-light)" }}>baseURL</code> to <code style={{ color: "var(--accent-light)" }}>http://localhost:4000/v1</code>
          </div>
        </div>
      ) : (
        <form onSubmit={handleRegister}>
          <div className="info-box" style={{ marginBottom: 14, fontSize: 11 }}>
            🔐 Enter your own Gemini &amp; Groq free-tier keys. They are <strong>AES-256-CBC encrypted</strong> before storage. Raw keys are never logged or re-returned.
          </div>

          <div className="form-group">
            <label className="form-label">App Name (optional)</label>
            <input
              id="app-name-input"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="my-hackathon-app"
              style={{ fontFamily: "Inter, sans-serif" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Gemini API Key</label>
            <div style={{ position: "relative" }}>
              <input
                id="gemini-key-input"
                className="form-input"
                type={showGemini ? "text" : "password"}
                value={geminiKey}
                onChange={e => setGeminiKey(e.target.value)}
                placeholder="Paste Gemini API key..."
                required
                style={{ paddingRight: 40 }}
              />
              <button type="button" onClick={() => setShowGemini(v => !v)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                {showGemini ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              Get free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>aistudio.google.com</a>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Groq API Key</label>
            <div style={{ position: "relative" }}>
              <input
                id="groq-key-input"
                className="form-input"
                type={showGroq ? "text" : "password"}
                value={groqKey}
                onChange={e => setGroqKey(e.target.value)}
                placeholder="gsk_..."
                required
                style={{ paddingRight: 40 }}
              />
              <button type="button" onClick={() => setShowGroq(v => !v)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                {showGroq ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              Get free key at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>console.groq.com</a>
            </div>
          </div>

          {error && (
            <div className="info-box warning" style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          <button id="register-keys-btn" className="btn btn-primary btn-full" type="submit" disabled={loading || !geminiKey || !groqKey}>
            {loading ? <><span className="spinner" /> Encrypting & Registering...</> : <><Key size={14} /> Register Keys & Get Gateway Token</>}
          </button>
        </form>
      )}
    </div>
  );
}
