# OmniGateway — AI Reverse Proxy & Semantic Cache Engine

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.x-purple.svg)](https://vitejs.dev/)
[![Security](https://img.shields.io/badge/Security-AES--256--CBC-orange.svg)](#byok-secrets-management)

OmniGateway is a **developer-facing, full-stack AI infrastructure reverse proxy** positioned between client applications and multiple LLM providers (Google Gemini & Meta Llama-3 via Groq).

It features **BYOK (Bring Your Own Key) secrets management with AES-256-CBC encryption**, **sub-25ms semantic vector caching**, an automated **Netflix Hystrix-style Circuit Breaker** for zero-downtime failover, **Token-Bucket rate limiting**, and a real-time **telemetry dashboard**.

---

## 🏗️ Architecture

```
Client App (LangChain / OpenAI SDK / cURL)
                     |
                     |  POST /v1/chat/completions
                     |  Authorization: Bearer omni_xxxx
                     v
+-------------------------------------------------------+
|                 OmniGateway Server                     |
|                 (Node.js / Express)                   |
|                                                       |
|  1. Auth Middleware  --> AES-256 decrypt BYOK keys    |
|  2. Token Bucket     --> 20 req/min continuous refill |
|  3. Semantic Cache   --> Cosine similarity >= 0.92    |
|  4. Circuit Breaker  --> CLOSED | OPEN | HALF_OPEN    |
|  5. Upstream Proxy   --> Gemini 1.5 Flash / Groq LLM  |
+---------------------------+---------------------------+
                            |
           +----------------+----------------+
           | (Primary)                       | (Fallback)
           v                                 v
   +---------------+                 +------------------+
   | Google Gemini |                 | Groq (Llama-3)   |
   | 1.5 Flash     |                 | Meta Llama-3-8b  |
   +---------------+                 +------------------+
           |                                 |
           +----------------+----------------+
                            |
                            v
+-------------------------------------------------------+
|  In-Memory High-Speed Store                           |
|  - AES-256 Encrypted Key Registry (`keyStore`)        |
|  - 768-dim Vector Cache (text-embedding-004 + TTL)    |
|  - Per-Token Rate Limit Buckets                       |
|  - Telemetry & Request Audit Log                      |
+-------------------------------------------------------+
                            |
                            v
+-------------------------------------------------------+
|  Real-Time Telemetry Dashboard (React + Vite)         |
|  - BYOK Key Registration & Token Generator            |
|  - Live Interactive Playground (Cache Hit/Miss Badges)|
|  - Real-Time Latency, Hit Ratio & Cost Savings Panel  |
|  - Circuit Breaker State & One-Click Outage Simulator |
+-------------------------------------------------------+
```

---

## ⚡ Core Features

### 1. BYOK (Bring Your Own Key) Secrets Management
* **Zero Trust Key Storage**: Users register their own Google Gemini and Groq API keys. Keys are immediately encrypted at rest using **AES-256-CBC** with a unique 16-byte initialization vector (`iv:ciphertext`).
* **Opaque Gateway Tokens**: Users receive an opaque token (`omni_xxxx`) to use in their code. Raw API keys are **never stored in plain text, never logged, and never re-exposed**.

### 2. Semantic Vector Caching (<25ms Latency)
* When a prompt arrives, OmniGateway generates a 768-dimensional embedding using Google `text-embedding-004`.
* It calculates **cosine similarity** against all cached vectors in memory.
* If similarity exceeds the threshold **0.92**, OmniGateway returns the cached completion in **<25ms** with zero token consumption and zero upstream API costs.

### 3. Circuit Breaker Pattern (Fault Tolerance)
* **States**: `CLOSED` (healthy), `OPEN` (failing), and `HALF_OPEN` (recovering).
* **Automatic Failover**: After **3 consecutive upstream failures** (HTTP 429 rate limit or 500 error) from Gemini, the breaker trips to `OPEN`.
* **Zero Downtime**: While `OPEN`, all requests are instantaneously rerouted to **Groq (Meta Llama-3-8b)** without client errors.
* **Probing**: After a **30-second cooldown**, the breaker transitions to `HALF_OPEN` to probe Gemini health.

### 4. Token-Bucket Rate Limiter
* Enforces fair quotas per gateway token with a **capacity of 20 tokens** refilling at **20 tokens / 60 seconds**.
* Smooths out burst spikes and rejects excessive traffic with `HTTP 429 { "retryAfter": X }`.

### 5. OpenAI API Drop-In Compatibility
* Compatible with any SDK that accepts custom `baseURL` (e.g., OpenAI SDK, LangChain, LangGraph, AutoGen, LlamaIndex).

---

## 🚀 Quickstart Guide

### Prerequisites
* **Node.js**: v18.x or v20.x
* **Free API Keys**:
  * [Google AI Studio](https://aistudio.google.com/app/apikey) (Gemini API Key)
  * [Groq Console](https://console.groq.com/keys) (Groq API Key)

---

### Step 1: Backend Setup
```bash
cd backend
npm install

# Copy environment template
cp .env.example .env
```

Ensure your `backend/.env` has a 32-character encryption secret:
```env
ENCRYPTION_SECRET=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
PORT=4000
FRONTEND_URL=http://localhost:5173
```

Start the backend:
```bash
npm run dev
# Server runs on http://localhost:4000
```

---

### Step 2: Frontend Setup
```bash
cd ../frontend
npm install

# Start Vite dev server
npm run dev
# Dashboard runs on http://localhost:5173
```

---

## 🛠️ Usage & Integration

### 1. Register BYOK Keys
In the Dashboard UI, or via cURL:
```bash
curl -X POST http://localhost:4000/keys/register \
  -H "Content-Type: application/json" \
  -d '{
    "geminiKey": "AIzaSy...",
    "groqKey": "gsk_...",
    "name": "my-production-app"
  }'
```
Response:
```json
{
  "gatewayToken": "omni_93a1f82c4b57e...",
  "baseURL": "http://localhost:4000/v1"
}
```

### 2. Use with Official OpenAI SDK
```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:4000/v1",
  apiKey: "omni_93a1f82c4b57e..." // Your Gateway Token
});

const completion = await client.chat.completions.create({
  model: "default",
  messages: [{ role: "user", content: "Explain Docker in two sentences" }]
});

console.log(completion.choices[0].message.content);
console.log(completion._omni_meta); // { cache: "MISS", latency_ms: 1840, provider: "gemini" }
```

### 3. Use with Python LangChain
```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://localhost:4000/v1",
    api_key="omni_93a1f82c4b57e...",
    model="default"
)

response = llm.invoke("Explain Docker in two sentences")
print(response.content)
```

---

## 📡 API Reference

| Method | Endpoint | Description | Auth Required |
|:---|:---|:---|:---|
| `POST` | `/keys/register` | Encrypt & register user BYOK keys, returns gateway token | No |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat proxy with cache & failover | `Bearer omni_xxx` |
| `GET` | `/metrics` | Telemetry: hit rates, tokens saved, avg latency | No |
| `GET` | `/health` | Gateway health check & uptime | No |
| `GET` | `/circuit-breaker` | Circuit breaker status & failure counters | No |
| `POST` | `/circuit-breaker/simulate-fail` | Simulate Gemini outage (demo trip) | No |
| `POST` | `/circuit-breaker/reset` | Reset circuit breaker to CLOSED | No |
| `GET` | `/requests/recent` | Recent 20 requests telemetry feed | No |

---

## 🎯 Resume Highlights

- **Engineered a production-grade AI Reverse Proxy** (OpenAI API-compatible) implementing a BYOK (Bring Your Own Key) architecture where user LLM credentials are **AES-256-CBC encrypted at rest** — raw keys are never stored or logged, mirroring secrets management patterns used in AWS KMS and HashiCorp Vault.
- **Implemented a semantic vector caching engine** using Google `text-embedding-004` cosine similarity (threshold 0.92), serving semantically equivalent prompts in **sub-25ms vs. 2,000–3,000ms upstream** — eliminating redundant token costs.
- **Designed an automated Circuit Breaker state machine** (`CLOSED` / `OPEN` / `HALF_OPEN`) triggering transparent failover from Google Gemini to open-source Meta Llama-3 (via Groq) on consecutive 429/500 failures, achieving near-zero client downtime.
- **Implemented a Token-Bucket rate limiter** per gateway token with continuous refill mechanics to prevent burst spikes and quota exhaustion.
- **Built a real-time React + Vite telemetry dashboard** with live cache hit ratios, latency metrics, token savings counters, and interactive circuit breaker simulation controls.

---

## 💼 Interview Cheat Sheet

* **What is a Reverse Proxy?**
  * A server intercepting client requests to apply caching, security, rate limiting, and routing before upstream services.
* **Why BYOK with AES-256?**
  * Avoids centralized server token liabilities and rate-limit cross-talk. Keys are encrypted with a random 16-byte IV per record and only decrypted transiently in memory per request.
* **Why Semantic Cache over Exact Match?**
  * Exact hash matching misses phrasing differences (e.g., *"What is Docker?"* vs *"Explain Docker to me"*). 768-dimensional cosine similarity catches semantic equivalence (>0.92).
* **Why Token Bucket over Fixed Window?**
  * Fixed windows allow boundary spikes (e.g. 2x quota across window edge). Token bucket smooths bursts continuously.
* **Why Circuit Breaker Pattern?**
  * Prevents cascading delays and thread pool exhaustion during upstream API outages (Netflix Hystrix pattern).
