// embeddings.js — Google text-embedding-004 Embeddings
// Generates 768-dimensional vectors for semantic cache lookups.
// Uses the user's own Gemini key (BYOK) — the server never holds keys.

import axios from "axios";

const EMBEDDING_MODELS = [
  "gemini-embedding-001",
  "gemini-embedding-2",
  "text-embedding-004",
  "embedding-001"
];

let discoveredEmbeddingModel = null;

export async function getEmbedding(text, geminiKey) {
  const modelsToTry = discoveredEmbeddingModel
    ? [discoveredEmbeddingModel, ...EMBEDDING_MODELS.filter((m) => m !== discoveredEmbeddingModel)]
    : EMBEDDING_MODELS;

  let lastError = null;

  for (const modelId of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:embedContent?key=${geminiKey}`;
      const response = await axios.post(
        url,
        {
          model: `models/${modelId}`,
          content: {
            parts: [{ text }],
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        }
      );

      if (response.data?.embedding?.values) {
        discoveredEmbeddingModel = modelId;
        return response.data.embedding.values;
      }
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      if (status === 404 || status === 400) {
        console.warn(`[embeddings] Model ${modelId} not available (${err.response?.data?.error?.message || err.message}), trying next...`);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("All embedding candidate models failed.");
}

/**
 * Cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal).
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number}
 */
export function cosineSimilarity(vecA, vecB) {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] ** 2;
    magB += vecB[i] ** 2;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
