// api.js — Axios service layer for OmniGateway backend
import axios from "axios";

const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const api = axios.create({ baseURL: BASE });

// Store gateway token in memory (set after registration)
let gatewayToken = localStorage.getItem("omni_token") || null;

export function setGatewayToken(token) {
  gatewayToken = token;
  localStorage.setItem("omni_token", token);
}

export function getStoredToken() {
  return gatewayToken;
}

export function clearToken() {
  gatewayToken = null;
  localStorage.removeItem("omni_token");
}

// ── BYOK Registration ──────────────────────────────────────────────────────
export async function registerKeys(geminiKey, groqKey, name) {
  const res = await api.post("/keys/register", { geminiKey, groqKey, name });
  return res.data;
}

// ── Chat Completions (the core proxy call) ─────────────────────────────────
export async function sendMessage(messages) {
  if (!gatewayToken) throw new Error("No gateway token. Register your API keys first.");
  const res = await api.post(
    "/v1/chat/completions",
    { model: "default", messages },
    { headers: { Authorization: `Bearer ${gatewayToken}` } }
  );
  return res.data;
}

// ── Telemetry ──────────────────────────────────────────────────────────────
export async function fetchMetrics() {
  const res = await api.get("/metrics");
  return res.data;
}

export async function fetchHealth() {
  const res = await api.get("/health");
  return res.data;
}

export async function fetchCircuitBreaker() {
  const res = await api.get("/circuit-breaker");
  return res.data;
}

export async function fetchRecentRequests() {
  const res = await api.get("/requests/recent");
  return res.data;
}

// ── Circuit Breaker Controls ───────────────────────────────────────────────
export async function simulateFail() {
  const res = await api.post("/circuit-breaker/simulate-fail");
  return res.data;
}

export async function resetCircuitBreaker() {
  const res = await api.post("/circuit-breaker/reset");
  return res.data;
}
