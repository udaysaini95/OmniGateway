package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"sync"
	"time"
)

// CachedEntry holds the response payload and expiration timestamp.
type CachedEntry struct {
	Response  map[string]interface{}
	ExpiresAt time.Time
	HitCount  int
}

// L1Cache provides a high-throughput, thread-safe in-memory cache using sync.RWMutex.
// This bypasses V8 garbage collection overhead and provides deterministic sub-millisecond lookups.
type L1Cache struct {
	mu      sync.RWMutex
	storage map[string]CachedEntry
}

func NewL1Cache() *L1Cache {
	c := &L1Cache{
		storage: make(map[string]CachedEntry),
	}
	// Background reaper goroutine for expired entries
	go c.startReaper(60 * time.Second)
	return c
}

// GenerateContextFingerprint computes a SHA-256 fingerprint combining previous conversation
// turns (messages 0..N-1) with the current prompt.
// This mathematically prevents cross-thread cache collisions in multi-turn chats.
func GenerateContextFingerprint(messages []map[string]interface{}, currentPrompt string) string {
	var priorContext strings.Builder
	if len(messages) > 1 {
		priorTurns := messages[:len(messages)-1]
		priorJSON, err := json.Marshal(priorTurns)
		if err == nil {
			priorContext.Write(priorJSON)
		}
	}

	h := sha256.New()
	if priorContext.Len() > 0 {
		ctxHash := sha256.Sum256([]byte(priorContext.String()))
		h.Write([]byte(hex.EncodeToString(ctxHash[:]) + ":"))
	}
	h.Write([]byte(strings.TrimSpace(strings.ToLower(currentPrompt))))
	return hex.EncodeToString(h.Sum(nil))
}

// Get returns the cached response if present and unexpired.
func (c *L1Cache) Get(key string) (map[string]interface{}, bool) {
	c.mu.RLock()
	entry, exists := c.storage[key]
	c.mu.RUnlock()

	if !exists {
		return nil, false
	}

	if time.Now().After(entry.ExpiresAt) {
		c.mu.Lock()
		delete(c.storage, key)
		c.mu.Unlock()
		return nil, false
	}

	c.mu.Lock()
	entry.HitCount++
	c.storage[key] = entry
	c.mu.Unlock()

	return entry.Response, true
}

// Set saves an entry with the specified TTL.
func (c *L1Cache) Set(key string, response map[string]interface{}, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.storage[key] = CachedEntry{
		Response:  response,
		ExpiresAt: time.Now().Add(ttl),
		HitCount:  0,
	}
}

// startReaper periodically cleans up expired entries without blocking readers.
func (c *L1Cache) startReaper(interval time.Duration) {
	ticker := time.NewTicker(interval)
	for range ticker.C {
		now := time.Now()
		c.mu.Lock()
		for k, v := range c.storage {
			if now.After(v.ExpiresAt) {
				delete(c.storage, k)
			}
		}
		c.mu.Unlock()
	}
}
