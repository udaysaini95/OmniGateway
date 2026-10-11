// rateLimiter.js — Dual-Mode Token Bucket Rate Limiter
// 1. If Redis is active: executes atomic Lua scripts across distributed pods.
// 2. If Redis is absent: executes continuous refill token bucket in local memory.
// Algorithm matches Stripe, GitHub, and AWS API Gateway standards.

import { redisAdapter } from "./redisClient.js";

const localBuckets = new Map();

const CAPACITY = 20; // 20 requests
const REFILL_RATE_MS = 60000; // per 60 seconds

/**
 * Check and consume a rate limit token for the given gateway token.
 * Automatically delegates to Redis if connected, otherwise uses local memory.
 * 
 * @param {string} gatewayToken
 * @returns {Promise<{ allowed: boolean, tokens: number, retryAfterMs?: number }>}
 */
export async function checkRateLimit(gatewayToken) {
  // 1. Try Distributed Redis Atomic Evaluation
  const redisResult = await redisAdapter.checkRateLimit(gatewayToken, CAPACITY, REFILL_RATE_MS);
  if (redisResult !== null) {
    return redisResult;
  }

  // 2. Local In-Memory Fallback
  const now = Date.now();

  if (!localBuckets.has(gatewayToken)) {
    localBuckets.set(gatewayToken, {
      tokens: CAPACITY,
      lastRefill: now,
    });
  }

  const bucket = localBuckets.get(gatewayToken);

  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = (elapsed / REFILL_RATE_MS) * CAPACITY;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const tokensNeeded = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((tokensNeeded / CAPACITY) * REFILL_RATE_MS);
    return {
      allowed: false,
      tokens: 0,
      retryAfterMs,
    };
  }

  bucket.tokens -= 1;
  return {
    allowed: true,
    tokens: Math.floor(bucket.tokens),
    retryAfterMs: 0,
  };
}

/**
 * Get bucket state
 */
export function getBucketState(gatewayToken) {
  const bucket = localBuckets.get(gatewayToken);
  if (!bucket) return { tokens: CAPACITY, capacity: CAPACITY };
  return {
    tokens: Math.floor(bucket.tokens),
    capacity: CAPACITY,
  };
}
