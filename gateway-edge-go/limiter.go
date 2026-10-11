package main

import (
	"context"
	"math"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimiter enforces token-bucket rate limits either via distributed Redis Lua
// or via high-speed in-memory sync.Mutex if Redis is unavailable.
type RateLimiter struct {
	rdb          *redis.Client
	mu           sync.Mutex
	localBuckets map[string]*localBucket
}

type localBucket struct {
	tokens     float64
	lastRefill time.Time
}

const tokenBucketLua = `
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
  local refill = (elapsed / refillRateMs) * capacity
  tokens = math.min(capacity, tokens + refill)
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
`

func NewRateLimiter(redisURL string) *RateLimiter {
	rl := &RateLimiter{
		localBuckets: make(map[string]*localBucket),
	}

	if redisURL != "" {
		opt, err := redis.ParseURL(redisURL)
		if err == nil {
			rl.rdb = redis.NewClient(opt)
		}
	}
	return rl
}

// Allow checks if the given API key is permitted to make a request (Capacity: 20 tokens / 60s).
func (rl *RateLimiter) Allow(ctx context.Context, apiKey string, capacity int, refillPeriod time.Duration) (bool, int) {
	// Fast Path: Distributed Redis via atomic Lua
	if rl.rdb != nil {
		nowMs := time.Now().UnixNano() / int64(time.Millisecond)
		refillMs := refillPeriod.Milliseconds()

		res, err := rl.rdb.Eval(ctx, tokenBucketLua, []string{"omni:rl:" + apiKey}, capacity, refillMs, nowMs).Result()
		if err == nil {
			if slice, ok := res.([]interface{}); ok && len(slice) >= 2 {
				allowed := slice[0].(int64) == 1
				val := int(slice[1].(int64))
				return allowed, val
			}
		}
	}

	// Fallback Path: High-speed In-Memory Token Bucket
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, exists := rl.localBuckets[apiKey]
	if !exists {
		b = &localBucket{
			tokens:     float64(capacity),
			lastRefill: now,
		}
		rl.localBuckets[apiKey] = b
	} else {
		elapsed := now.Sub(b.lastRefill).Seconds()
		refillRate := float64(capacity) / refillPeriod.Seconds()
		b.tokens = math.Min(float64(capacity), b.tokens+(elapsed*refillRate))
		b.lastRefill = now
	}

	if b.tokens < 1.0 {
		retryAfterMs := int(math.Ceil((1.0 - b.tokens) / (float64(capacity) / float64(refillPeriod.Milliseconds()))))
		return false, retryAfterMs
	}

	b.tokens -= 1.0
	return true, int(math.Floor(b.tokens))
}
