// RequestFeed.jsx — Live Request Feed Table (Last 20 Requests)
import { useState, useEffect } from "react";
import { History, RefreshCw } from "lucide-react";
import { fetchRecentRequests } from "../services/api.js";

export default function RequestFeed() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  async function loadRequests() {
    setLoading(true);
    try {
      const data = await fetchRecentRequests();
      setRequests(data);
    } catch {
      // Backend may be starting
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
    const interval = setInterval(loadRequests, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="card-header">
        <h2 className="card-title">
          <span className="title-icon"><History size={14} /></span>
          Recent Request Feed
        </h2>
        <button
          id="refresh-feed-btn"
          className="btn btn-secondary btn-sm"
          onClick={loadRequests}
          disabled={loading}
        >
          <RefreshCw size={11} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📡</div>
          <div>No requests yet. Send a prompt in the playground to see live request telemetry.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="feed-table">
            <thead>
              <tr>
                <th>Prompt</th>
                <th>Cache</th>
                <th>Latency</th>
                <th>Provider</th>
                <th>Model</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {req.prompt}
                  </td>
                  <td>
                    <span className={`badge ${req.cacheHit ? "badge-hit" : "badge-miss"}`}>
                      {req.cacheHit ? "HIT" : "MISS"}
                      {req.similarity ? ` (${req.similarity}%)` : ""}
                    </span>
                  </td>
                  <td className="mono" style={{ color: req.latencyMs < 100 ? "var(--success)" : "var(--text-secondary)" }}>
                    {req.latencyMs}ms
                  </td>
                  <td>
                    <span style={{ textTransform: "capitalize", color: req.provider === "gemini" ? "var(--accent-light)" : req.provider === "groq" ? "var(--warning)" : "var(--success)" }}>
                      {req.provider}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {req.model || "—"}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {new Date(req.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
