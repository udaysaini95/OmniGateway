// redisClient.js — Production Dual-Mode Redis Adapter
// 1. If REDIS_URL is configured: connects to Redis cluster/standalone with reconnection resilience.
// 2. If REDIS_URL is absent or unreachable: gracefully falls back to local in-memory engine.
// This allows zero-ops local development while supporting enterprise horizontal scaling.

import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || null;

class RedisAdapter {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    if (!REDIS_URL) {
      console.log("[redis] REDIS_URL not configured. Operating in Standalone In-Memory mode.");
      return;
    }

    try {
      this.client = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        retryStrategy: (times) => {
          if (times > 3) {
            console.warn("[redis] Max retries reached. Falling back to in-memory mode.");
            return null; // Stop reconnecting
          }
          return Math.min(times * 1000, 3000);
        },
      });

      this.client.on("connect", () => {
        this.isConnected = true;
        console.log("⚡ [redis] Connected to distributed Redis cluster!");
      });

      this.client.on("error", (err) => {
        this.isConnected = false;
        console.warn(`[redis] Connection issue (${err.message}). Using local in-memory fallback.`);
      });
    } catch (err) {
      this.isConnected = false;
      console.warn("[redis] Initialization failed:", err.message);
    }
  }

  // -------------------------------------------------------------------------
  // Distributed L1 Cache (Key-Value with TTL)
  // -------------------------------------------------------------------------
  async getCache(key) {
    if (!this.isConnected || !this.client) return null;
    try {
      const data = await this.client.get(`omni:cache:${key}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async setCache(key, value, ttlSeconds = 3600) {
    if (!this.isConnected || !this.client) return false;
    try {
      await this.client.set(`omni:cache:${key}`, JSON.stringify(value), "EX", ttlSeconds);
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Atomic Distributed Token Bucket Rate Limiting (Redis Lua Script)
  // Ensures thread-safe, race-condition-free quota enforcement across multiple pods.
  // -------------------------------------------------------------------------
  async checkRateLimit(apiKey, capacity = 20, refillRateMs = 60000) {
    if (!this.isConnected || !this.client) {
      return null; // Fall back to local memory rate limiter
    }

    // Lua script executing continuous refill token bucket atomically
    const luaScript = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refillRateMs = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])

      local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
      local tokens = tonumber(data[1])
      local lastRefill = tonumber(data[2])

      if not tokens then
        tokens = capacity
        lastRefill = now
      else
        local elapsed = now - lastRefill
        local tokensToAdd = (elapsed / refillRateMs) * capacity
        tokens = math.min(capacity, tokens + tokensToAdd)
        lastRefill = now
      end

      if tokens < 1 then
        local retryAfter = math.ceil(((1 - tokens) / capacity) * refillRateMs)
        redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
        redis.call('EXPIRE', key, math.ceil(refillRateMs / 1000) * 2)
        return {0, retryAfter}
      else
        tokens = tokens - 1
        redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
        redis.call('EXPIRE', key, math.ceil(refillRateMs / 1000) * 2)
        return {1, math.floor(tokens)}
      end
    `;

    try {
      const now = Date.now();
      const res = await this.client.eval(luaScript, 1, `omni:rl:${apiKey}`, capacity, refillRateMs, now);
      const allowed = res[0] === 1;
      return {
        allowed,
        tokens: res[1],
        retryAfterMs: allowed ? 0 : res[1],
      };
    } catch (err) {
      console.warn("[redis] Atomic rate limit eval failed, falling back to local:", err.message);
      return null;
    }
  }

  getStatus() {
    return {
      configured: !!REDIS_URL,
      connected: this.isConnected,
      mode: this.isConnected ? "DISTRIBUTED_REDIS" : "LOCAL_STANDALONE",
    };
  }
}

export const redisAdapter = new RedisAdapter();
