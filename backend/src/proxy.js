// proxy.js — Upstream LLM Call Logic (Gemini & Groq via BYOK)
import axios from "axios";

// Candidate models for Gemini in order of preference
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash"
];

// Active Groq models in order of preference
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama-3.2-11b-vision-preview",
  "llama-3.2-3b-preview"
];

export async function callGemini(messages, geminiKey) {
  const contents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  let lastError = null;

  for (const modelId of GEMINI_MODELS) {
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
      return {
        text,
        model: modelId,
        promptTokens: usage.promptTokenCount ?? 0,
        completionTokens: usage.candidatesTokenCount ?? 0,
      };
    } catch (err) {
      lastError = err;
      // If error is 404 (model not found/deprecated), try next model in fallback list
      if (err.response?.status === 404) {
        console.warn(`[proxy] Gemini model ${modelId} not found, trying next model...`);
        continue;
      }
      // For auth or rate limit errors, rethrow immediately
      throw err;
    }
  }

  throw lastError || new Error("All Gemini candidate models failed.");
}

export async function callGroq(messages, groqKey) {
  let lastError = null;

  for (const modelId of GROQ_MODELS) {
    try {
      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        { model: modelId, messages, temperature: 0.7, max_tokens: 1024 },
        { headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" }, timeout: 30000 }
      );
      const choice = response.data.choices?.[0];
      if (!choice) continue;

      const usage = response.data.usage ?? {};
      return {
        text: choice.message?.content ?? "",
        model: modelId,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
      };
    } catch (err) {
      lastError = err;
      // If model is decommissioned or not found, try next active Groq model
      if (err.response?.status === 400 || err.response?.status === 404) {
        console.warn(`[proxy] Groq model ${modelId} failed (${err.response?.data?.error?.message || err.message}), trying next model...`);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("All Groq candidate models failed.");
}
