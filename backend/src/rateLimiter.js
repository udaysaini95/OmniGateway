// rateLimiter.js — Token Bucket Rate Limiter (per Gateway Token)
// Each gateway token gets its own bucket with 20 tokens, refilling at 20/min.
// This is the same algorithm used by Stripe, GitHub, and AWS API Gateway.

const rateLimitBuckets = new Map();

const CAPACITY = 20; // max tokens per bucket
const REFILL_RATE_MS = 60000; // full refill every 60 seconds

/**
 * Check and consume a rate limit token for the given gateway token.
 * @param {string} gatewayToken
 * @returns {{ allowed: boolean, tokens: number, retryAfterMs?: number }}
 */
export function checkRateLimit(gatewayToken) {
  const now = Date.now();

  if (!rateLimitBuckets.has(gatewayToken)) {
    rateLimitBuckets.set(gatewayToken, {
      tokens: CAPACITY,
      lastRefill: now,
    });
  }

  const bucket = rateLimitBuckets.get(gatewayToken);

  // Continuous refill: calculate tokens added since last refill
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = (elapsed / REFILL_RATE_MS) * CAPACITY;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    // Calculate retry delay
    const tokensNeeded = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil(
      (tokensNeeded / CAPACITY) * REFILL_RATE_MS
    );
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
  };
}

/**
 * Get the current bucket state for a token (for debugging/dashboard).
 */
export function getBucketState(gatewayToken) {
  const bucket = rateLimitBuckets.get(gatewayToken);
  if (!bucket) return { tokens: CAPACITY, capacity: CAPACITY };
  return {
    tokens: Math.floor(bucket.tokens),
    capacity: CAPACITY,
  };
}
