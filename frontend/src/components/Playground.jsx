// Playground.jsx — Live Prompt Tester
import { useState, useRef } from "react";
import { Send, Zap, AlertCircle } from "lucide-react";
import { sendMessage, getStoredToken } from "../services/api.js";

function MetaBadge({ label, value, accent = false }) {
  return (
    <div className={`meta-chip ${accent ? "chip-accent" : ""}`}>
      {label}: <span className="chip-value">{value}</span>
    </div>
  );
}

export default function Playground() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [response, setResponse] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const textareaRef = useRef(null);

  const hasToken = !!getStoredToken();

  async function handleSend() {
    if (!prompt.trim() || loading) return;
    setError(null);
    setLoading(true);
    setResponse(null);
    setMeta(null);

    const userMsg = { role: "user", content: prompt.trim() };
    const newMessages = [...messages, userMsg];

    try {
      const data = await sendMessage(newMessages);
      const assistantText = data.choices?.[0]?.message?.content ?? "";
      setMessages([...newMessages, { role: "assistant", content: assistantText }]);
      setResponse(assistantText);
      setMeta(data._omni_meta);
      setPrompt("");
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  function clearConversation() {
    setMessages([]);
    setResponse(null);
    setMeta(null);
    setError(null);
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="title-icon"><Zap size={14} /></span>
          Live Playground
        </h2>
        {messages.length > 0 && (
          <button id="clear-conversation-btn" className="btn btn-secondary btn-sm" onClick={clearConversation}>
            Clear
          </button>
        )}
      </div>

      {!hasToken && (
        <div className="info-box warning" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={14} />
          Register your API keys first to use the playground.
        </div>
      )}

      {/* Response Area */}
      <div className="response-area" style={{ marginBottom: 12, maxHeight: 360, overflowY: "auto" }}>
        {response ? (
          <div className="fade-in" style={{ whiteSpace: "pre-wrap" }}>{response}</div>
        ) : loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)" }}>
            <span className="spinner" style={{ borderColor: "rgba(108,99,255,0.3)", borderTopColor: "var(--accent)" }} />
            Routing through OmniGateway...
          </div>
        ) : (
          <span className="response-placeholder">
            Send a prompt to see the gateway in action. Try the same prompt twice to see a cache HIT!
          </span>
        )}
      </div>

      {/* Meta badges */}
      {meta && (
        <div className="meta-row fade-in">
          <span className={`badge ${meta.cache === "HIT" ? "badge-hit" : "badge-miss"}`}>
            {meta.cache === "HIT" ? "⚡ Cache HIT" : "🔄 Cache MISS"}
          </span>
          <MetaBadge label="Latency" value={`${meta.latency_ms?.toLocaleString()}ms`} />
          <MetaBadge label="Provider" value={meta.provider === "cache" ? "Cache" : meta.provider === "gemini" ? "Gemini ✨" : "Groq (Fallback)"} />
          {meta.cache === "HIT" && meta.tokens_saved > 0 && (
            <MetaBadge label="Tokens Saved" value={meta.tokens_saved} accent />
          )}
          {meta.cache === "HIT" && meta.similarity && (
            <MetaBadge label="Similarity" value={`${meta.similarity}%`} accent />
          )}
        </div>
      )}

      {error && (
        <div className="info-box warning" style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      <div className="divider" />

      {/* Input area */}
      <div className="form-group" style={{ marginBottom: 10 }}>
        <textarea
          id="prompt-textarea"
          ref={textareaRef}
          className="form-textarea"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything... (Ctrl+Enter to send)"
          rows={3}
          disabled={loading || !hasToken}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button id="send-btn" className="btn btn-primary" style={{ flex: 1 }} onClick={handleSend}
          disabled={loading || !prompt.trim() || !hasToken}>
          {loading ? <><span className="spinner" />Sending...</> : <><Send size={14} />Send to Gateway</>}
        </button>
      </div>

      {/* Tip */}
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 6 }}>
        <span>💡</span>
        <span>Try <em>&ldquo;Explain Docker&rdquo;</em> then <em>&ldquo;What is Docker?&rdquo;</em> — the second hits the cache!</span>
      </div>
    </div>
  );
}
