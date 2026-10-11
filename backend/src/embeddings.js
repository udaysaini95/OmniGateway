// embeddings.js — Google text-embedding-004 Embeddings
// Generates 768-dimensional vectors for semantic cache lookups.
// Uses the user's own Gemini key (BYOK) — the server never holds keys.

import axios from "axios";

const EMBEDDING_MODELS = [
  "text-embedding-004",
  "gemini-embedding-2-preview",
  "embedding-001"
];

export async function getEmbedding(text, geminiKey) {
  let lastError = null;

  for (const modelId of EMBEDDING_MODELS) {
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
          timeout: 10000,
        }
      );

      if (response.data?.embedding?.values) {
        return response.data.embedding.values;
      }
    } catch (err) {
      lastError = err;
      if (err.response?.status === 404) {
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
