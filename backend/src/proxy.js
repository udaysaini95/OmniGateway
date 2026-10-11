// proxy.js — Upstream LLM Call Logic (Gemini & Groq via BYOK)
import axios from "axios";

// Active default models in order of preference
const GEMINI_CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro-latest"
];

const GROQ_CANDIDATE_MODELS = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
  "qwen/qwen3.8-27b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant"
];

// In-memory cache for discovered models per key
const activeGeminiModelCache = new Map();
const activeGroqModelCache = new Map();

/**
 * Fetch available models for the user's Gemini key
 */
async function getAvailableGeminiModel(geminiKey) {
  if (activeGeminiModelCache.has(geminiKey)) {
    return activeGeminiModelCache.get(geminiKey);
  }
  try {
    const listRes = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
      { timeout: 8000 }
    );
    const models = (listRes.data?.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""));

    // Find best match among candidates or take first available flash/content model
    const matched =
      GEMINI_CANDIDATE_MODELS.find((c) => models.includes(c)) ||
      models.find((m) => m.includes("flash")) ||
      models[0];

    if (matched) {
      console.log(`[proxy] Dynamically discovered Gemini model: ${matched}`);
      activeGeminiModelCache.set(geminiKey, matched);
      return matched;
    }
  } catch (err) {
    console.warn("[proxy] Gemini listModels query failed, falling back to candidates:", err.message);
  }
  return GEMINI_CANDIDATE_MODELS[0];
}

/**
 * Fetch available models for the user's Groq key
 */
async function getAvailableGroqModel(groqKey) {
  if (activeGroqModelCache.has(groqKey)) {
    return activeGroqModelCache.get(groqKey);
  }
  try {
    const listRes = await axios.get("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${groqKey}` },
      timeout: 8000,
    });
    const models = (listRes.data?.data || []).map((m) => m.id);

    // Find best match from candidates or take first available model
    const matched =
      GROQ_CANDIDATE_MODELS.find((c) => models.includes(c)) ||
      models.find((m) => m.includes("gpt-oss") || m.includes("qwen") || m.includes("llama")) ||
      models[0];

    if (matched) {
      console.log(`[proxy] Dynamically discovered Groq model: ${matched}`);
      activeGroqModelCache.set(groqKey, matched);
      return matched;
    }
  } catch (err) {
    console.warn("[proxy] Groq listModels query failed, falling back to candidates:", err.message);
  }
  return GROQ_CANDIDATE_MODELS[0];
}

export async function callGemini(messages, geminiKey) {
  const contents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  const targetModel = await getAvailableGeminiModel(geminiKey);
  const modelsToTry = [targetModel, ...GEMINI_CANDIDATE_MODELS.filter((m) => m !== targetModel)];

  let lastError = null;
  for (const modelId of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiKey}`;
      const response = await axios.post(
        url,
        { contents, generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } },
        { timeout: 30000 }
      );
      const candidate = response.data.candidates?.[0];
      if (!candidate) continue;

      const text = candidate.content?.parts?.[0]?.text ?? "";
      const usage = response.data.usageMetadata ?? {};
      activeGeminiModelCache.set(geminiKey, modelId);
      return {
        text,
        model: modelId,
        promptTokens: usage.promptTokenCount ?? 0,
        completionTokens: usage.candidatesTokenCount ?? 0,
      };
    } catch (err) {
      lastError = err;
      if (err.response?.status === 404) {
        console.warn(`[proxy] Gemini model ${modelId} returned 404, attempting next model...`);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("All Gemini models failed.");
}

export async function callGroq(messages, groqKey) {
  const targetModel = await getAvailableGroqModel(groqKey);
  const modelsToTry = [targetModel, ...GROQ_CANDIDATE_MODELS.filter((m) => m !== targetModel)];

  let lastError = null;
  for (const modelId of modelsToTry) {
    try {
      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        { model: modelId, messages, temperature: 0.7, max_tokens: 1024 },
        { headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" }, timeout: 30000 }
      );
      const choice = response.data.choices?.[0];
      if (!choice) continue;

      const usage = response.data.usage ?? {};
      activeGroqModelCache.set(groqKey, modelId);
      return {
        text: choice.message?.content ?? "",
        model: modelId,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
      };
    } catch (err) {
      lastError = err;
      if (err.response?.status === 400 || err.response?.status === 404) {
        console.warn(`[proxy] Groq model ${modelId} failed: ${err.response?.data?.error?.message || err.message}`);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("All Groq models failed.");
}
