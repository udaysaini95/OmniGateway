// cache.js — Semantic Vector Cache
import { cosineSimilarity } from "./embeddings.js";

const SIMILARITY_THRESHOLD = 0.92;
const TTL_MS = 3600000; // 1 hour
const cacheEntries = [];

export function lookupCache(queryEmbedding) {
  let bestMatch = null;
  let bestScore = -1;
  const now = Date.now();
  for (const entry of cacheEntries) {
    if (now - entry.createdAt > entry.ttl) continue;
    const score = cosineSimilarity(queryEmbedding, entry.promptEmbedding);
    if (score > bestScore) { bestScore = score; bestMatch = entry; }
  }
  if (bestScore >= SIMILARITY_THRESHOLD && bestMatch) {
    return { entry: bestMatch, similarity: bestScore };
  }
  return null;
}

export function storeCache({ promptEmbedding, originalPrompt, response, model, tokens }) {
  pruneExpired();
  cacheEntries.push({ promptEmbedding, originalPrompt, response, model, tokens, createdAt: Date.now(), ttl: TTL_MS });
}

function pruneExpired() {
  const now = Date.now();
  let i = cacheEntries.length;
  while (i--) {
    if (now - cacheEntries[i].createdAt > cacheEntries[i].ttl) cacheEntries.splice(i, 1);
  }
}

export function getCacheStats() {
  pruneExpired();
  return { totalEntries: cacheEntries.length, threshold: SIMILARITY_THRESHOLD, ttlMs: TTL_MS };
}

export function clearCache() { cacheEntries.length = 0; }
