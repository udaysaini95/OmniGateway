// embeddings.js — Google text-embedding-004 Embeddings
// Generates 768-dimensional vectors for semantic cache lookups.
// Uses the user's own Gemini key (BYOK) — the server never holds keys.

import axios from "axios";

const EMBEDDING_API =
  "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent";

/**
 * Generate a 768-dimensional embedding vector for the given text
 * using Google's text-embedding-004 model (free tier).
 *
 * @param {string} text       - The prompt text to embed
 * @param {string} geminiKey  - User's decrypted Gemini API key (BYOK)
 * @returns {Promise<number[]>} - Array of 768 floats
 */
export async function getEmbedding(text, geminiKey) {
  const response = await axios.post(
    `${EMBEDDING_API}?key=${geminiKey}`,
    {
      model: "models/text-embedding-004",
      content: {
        parts: [{ text }],
      },
    },
    {
      timeout: 10000,
    }
  );

  return response.data.embedding.values;
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
