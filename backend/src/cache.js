// cache.js — Production Tier-2 Cache Engine
// Architecture:
// 1. L1 Exact Match Cache (O(1) SHA-256 Hash Table) -> Sub-millisecond return
// 2. L2 Semantic Vector Cache (Context-Aware Cosine Similarity) -> Threshold >= 0.95
// 3. Multi-Turn Context Isolation: History Hash prefix prevents cross-chat collisions

import crypto from "crypto";
import { cosineSimilarity } from "./embeddings.js";

const DEFAULT_SIMILARITY_THRESHOLD = 0.95; // Production strict threshold (prevents subtle intent drift)
const TTL_MS = 3600000; // 1 hour TTL

// L1 Exact Match Store (Key: sha256(normalizedHistory + prompt), Value: entry)
const l1Cache = new Map();

// L2 Semantic Vector Store (Entries with context fingerprint + vector)
const l2CacheEntries = [];

/**
 * Normalizes and hashes message history to create a stable thread context fingerprint.
 * If messages has only 1 message, contextHash is "single-turn".
 */
export function getContextFingerprint(messages) {
  if (!messages || messages.length <= 1) {
    return "root";
  }
  // Include all prior conversation turns up to the second-to-last
  const history = messages.slice(0, -1).map(m => `${m.role}:${m.content.trim()}`).join("||");
  return crypto.createHash("sha256").update(history).digest("hex").slice(0, 16);
}

/**
 * Normalizes text for exact match lookup (removes trailing whitespace, lowercase).
 */
function normalizeText(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Generate L1 exact match key
 */
function getL1Key(contextFingerprint, promptText) {
  const norm = normalizeText(promptText);
  return crypto.createHash("sha256").update(`${contextFingerprint}::${norm}`).digest("hex");
}

/**
 * Lookup cache across L1 and L2 layers.
 * 
 * @param {object} params
 * @param {Array} params.messages - Full OpenAI message array
 * @param {number[]|null} params.queryEmbedding - Vector embedding of current prompt
 * @param {number} [params.threshold] - Optional custom threshold override
 * @returns {{ hit: boolean, type: "L1_EXACT"|"L2_SEMANTIC", entry: object, similarity?: number } | null}
 */
export function lookupCache({ messages, queryEmbedding, threshold = DEFAULT_SIMILARITY_THRESHOLD }) {
  pruneExpired();

  const currentPrompt = messages[messages.length - 1]?.content ?? "";
  const contextFingerprint = getContextFingerprint(messages);
  const now = Date.now();

  // 1. L1 Exact Match Check (O(1))
  const l1Key = getL1Key(contextFingerprint, currentPrompt);
  const exactMatch = l1Cache.get(l1Key);
  if (exactMatch && (now - exactMatch.createdAt <= exactMatch.ttl)) {
    return {
      hit: true,
      type: "L1_EXACT",
      entry: exactMatch,
      similarity: 1.0,
    };
  }

  // 2. L2 Semantic Vector Check (Context-Aware)
  if (!queryEmbedding) return null;

  let bestMatch = null;
  let bestScore = -1;

  for (const entry of l2CacheEntries) {
    if (now - entry.createdAt > entry.ttl) continue;

    // Strict Context Isolation: Only match if conversation history prefix matches!
    if (entry.contextFingerprint !== contextFingerprint) continue;

    const score = cosineSimilarity(queryEmbedding, entry.promptEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestScore >= threshold && bestMatch) {
    return {
      hit: true,
      type: "L2_SEMANTIC",
      entry: bestMatch,
      similarity: bestScore,
    };
  }

  return null;
}

/**
 * Store response in both L1 (exact) and L2 (semantic vector) caches.
 */
export function storeCache({ messages, promptEmbedding, response, model, tokens }) {
  pruneExpired();

  const currentPrompt = messages[messages.length - 1]?.content ?? "";
  const contextFingerprint = getContextFingerprint(messages);
  const now = Date.now();

  const entry = {
    contextFingerprint,
    originalPrompt: currentPrompt,
    response,
    model,
    tokens,
    createdAt: now,
    ttl: TTL_MS,
  };

  // Store in L1
  const l1Key = getL1Key(contextFingerprint, currentPrompt);
  l1Cache.set(l1Key, entry);

  // Store in L2 if vector available
  if (promptEmbedding) {
    l2CacheEntries.push({
      ...entry,
      promptEmbedding,
    });
  }
}

/**
 * Auto-prune expired items to prevent memory leaks
 */
function pruneExpired() {
  const now = Date.now();

  // Prune L1
  for (const [key, item] of l1Cache.entries()) {
    if (now - item.createdAt > item.ttl) {
      l1Cache.delete(key);
    }
  }

  // Prune L2
  let i = l2CacheEntries.length;
  while (i--) {
    if (now - l2CacheEntries[i].createdAt > l2CacheEntries[i].ttl) {
      l2CacheEntries.splice(i, 1);
    }
  }
}

/**
 * Get unified telemetry stats for dashboard
 */
export function getCacheStats() {
  pruneExpired();
  return {
    l1Entries: l1Cache.size,
    l2Entries: l2CacheEntries.length,
    totalEntries: l1Cache.size + l2CacheEntries.length,
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ttlMs: TTL_MS,
  };
}

/**
 * Clear all cache entries
 */
export function clearCache() {
  l1Cache.clear();
  l2CacheEntries.length = 0;
}
