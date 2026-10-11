// server.js — OmniGateway Express Server
// OpenAI-compatible reverse proxy with BYOK, semantic cache, circuit breaker, rate limiter.

import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";

import { registerKey, listKeys } from "./keyManager.js";
import { authMiddleware } from "./middleware/auth.js";
import { checkRateLimit } from "./rateLimiter.js";
import { getEmbedding } from "./embeddings.js";
import { lookupCache, storeCache, getCacheStats } from "./cache.js";
import { tick, selectProvider, recordSuccess, recordFailure, getState, simulateFailure, resetBreaker } from "./circuitBreaker.js";
import { callGemini, callGroq } from "./proxy.js";
import { incrementRequests, recordCacheHit, recordCacheMiss, recordLatency, getMetrics } from "./metrics.js";

const app = express();
const PORT = process.env.PORT || 4000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// In-memory request history (last 20 requests)
const requestHistory = [];
function addToHistory(entry) {
  requestHistory.unshift(entry);
  if (requestHistory.length > 20) requestHistory.pop();
}

// ---------------------------------------------------------------------------
// Public Routes (no auth required)
// ---------------------------------------------------------------------------

// Health check
app.get("/health", (_req, res) => {
  const cb = getState();
  res.json({
    status: "ok",
    circuitBreaker: cb.state,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Aggregate metrics
app.get("/metrics", (_req, res) => {
  const m = getMetrics();
  const cs = getCacheStats();
  res.json({ ...m, ...cs });
});

// Circuit breaker state
app.get("/circuit-breaker", (_req, res) => {
  res.json(getState());
});

// Simulate Gemini failure (for demo)
app.post("/circuit-breaker/simulate-fail", (_req, res) => {
  const state = simulateFailure();
  res.json({ message: "Failure recorded", ...state });
});

// Reset circuit breaker (for demo)
app.post("/circuit-breaker/reset", (_req, res) => {
  const state = resetBreaker();
  res.json({ message: "Circuit breaker reset to CLOSED", ...state });
});

// Recent request history
app.get("/requests/recent", (_req, res) => {
  res.json(requestHistory);
});

// ---------------------------------------------------------------------------
// BYOK Key Registration
// ---------------------------------------------------------------------------
app.post("/keys/register", (req, res) => {
  const { geminiKey, groqKey, name } = req.body;

  if (!geminiKey || !groqKey) {
    return res.status(400).json({ error: "Both geminiKey and groqKey are required." });
  }
  if (!geminiKey || geminiKey.trim().length < 20) {
    return res.status(400).json({ error: "Invalid Gemini key. Please enter a valid API key from Google AI Studio." });
  }
  if (!groqKey.startsWith("gsk_")) {
    return res.status(400).json({ error: "Invalid Groq key format. Should start with 'gsk_'." });
  }

  const gatewayToken = registerKey(geminiKey, groqKey, name || "default");
  res.json({
    gatewayToken,
    baseURL: `${req.protocol}://${req.get("host")}/v1`,
    message: "Your keys are AES-256 encrypted. Use only this gateway token in your code.",
    usage: {
      example: `Authorization: Bearer ${gatewayToken}`,
      openai_sdk: `new OpenAI({ baseURL: "http://localhost:${PORT}/v1", apiKey: "${gatewayToken}" })`,
    },
  });
});

// List registered tokens (metadata only — no raw keys ever returned)
app.get("/keys", (_req, res) => {
  res.json(listKeys());
});

// ---------------------------------------------------------------------------
// Core: OpenAI-Compatible Chat Completions Endpoint
// ---------------------------------------------------------------------------
app.post("/v1/chat/completions", authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const { messages, model: _model } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required and must not be empty." });
  }

  // Rate limit check
  const rl = checkRateLimit(req.gatewayToken);
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
    return res.status(429).json({
      error: `Rate limit exceeded. Retry in ${retryAfterSec}s.`,
      retryAfter: retryAfterSec,
    });
  }

  incrementRequests();

  const userPrompt = messages[messages.length - 1]?.content ?? "";
  let cacheHit = false;
  let similarity = null;
  let responseText = "";
  let providerUsed = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let modelUsed = "";

  try {
    // 1. Generate embedding for the incoming prompt (uses user's Gemini key)
    let queryEmbedding = null;
    try {
      queryEmbedding = await getEmbedding(userPrompt, req.userKeys.geminiKey);
    } catch (embErr) {
      console.warn("[server] Embedding failed (cache skipped):", embErr.message);
    }

    // 2. Semantic cache lookup
    if (queryEmbedding) {
      const cached = lookupCache(queryEmbedding);
      if (cached) {
        cacheHit = true;
        similarity = cached.similarity;
        responseText = cached.entry.response;
        modelUsed = cached.entry.model;
        completionTokens = cached.entry.tokens;
        recordCacheHit(cached.entry.tokens);
        console.log(`[server] Cache HIT (similarity=${(similarity * 100).toFixed(1)}%) — serving cached response.`);
      }
    }

    // 3. If cache miss: call upstream LLM
    if (!cacheHit) {
      recordCacheMiss();
      tick(); // advance circuit breaker cooldown if needed
      const provider = selectProvider();
      providerUsed = provider;
      console.log(`[server] Cache MISS — routing to ${provider}`);

      try {
        let result;
        if (provider === "gemini") {
          result = await callGemini(messages, req.userKeys.geminiKey);
          recordSuccess();
        } else {
          result = await callGroq(messages, req.userKeys.groqKey);
        }

        responseText = result.text;
        modelUsed = result.model;
        promptTokens = result.promptTokens;
        completionTokens = result.completionTokens;

        // Store in semantic cache
        if (queryEmbedding) {
          storeCache({
            promptEmbedding: queryEmbedding,
            originalPrompt: userPrompt,
            response: responseText,
            model: modelUsed,
            tokens: completionTokens,
          });
        }
      } catch (upstreamErr) {
        // If Gemini failed, record failure and fallback to Groq
        if (providerUsed === "gemini") {
          recordFailure();
          console.warn("[server] Gemini failed, falling back to Groq:", upstreamErr.message);
          try {
            const result = await callGroq(messages, req.userKeys.groqKey);
            responseText = result.text;
            modelUsed = result.model;
            promptTokens = result.promptTokens;
            completionTokens = result.completionTokens;
            providerUsed = "groq";
            if (queryEmbedding) {
              storeCache({ promptEmbedding: queryEmbedding, originalPrompt: userPrompt, response: responseText, model: modelUsed, tokens: completionTokens });
            }
          } catch (groqErr) {
            return res.status(502).json({ error: "Both Gemini and Groq failed.", details: groqErr.message });
          }
        } else {
          return res.status(502).json({ error: "Groq request failed.", details: upstreamErr.message });
        }
      }
    } else {
      providerUsed = "cache";
    }

    const latencyMs = Date.now() - startTime;
    recordLatency(latencyMs);

    // Track in history
    addToHistory({
      id: "omni_" + crypto.randomBytes(4).toString("hex"),
      prompt: userPrompt.slice(0, 80) + (userPrompt.length > 80 ? "..." : ""),
      cacheHit,
      latencyMs,
      provider: providerUsed,
      model: modelUsed,
      similarity: similarity ? parseFloat((similarity * 100).toFixed(1)) : null,
      timestamp: new Date().toISOString(),
    });

    // 4. Return OpenAI-compatible response
    return res.json({
      id: "omni_" + crypto.randomBytes(8).toString("hex"),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: modelUsed,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: responseText },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      _omni_meta: {
        cache: cacheHit ? "HIT" : "MISS",
        similarity: similarity ? parseFloat((similarity * 100).toFixed(1)) : null,
        latency_ms: latencyMs,
        provider: providerUsed,
        tokens_saved: cacheHit ? completionTokens : 0,
      },
    });
  } catch (err) {
    console.error("[server] Unhandled error:", err);
    return res.status(500).json({ error: "Internal gateway error.", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🚀 OmniGateway running on http://localhost:${PORT}`);
  console.log(`   POST /keys/register  — Register BYOK API keys`);
  console.log(`   POST /v1/chat/completions — OpenAI-compatible endpoint`);
  console.log(`   GET  /metrics        — Live telemetry`);
  console.log(`   GET  /health         — Health check\n`);
});
