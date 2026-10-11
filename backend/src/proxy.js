// proxy.js — Upstream LLM Call Logic (Gemini & Groq via BYOK)
import axios from "axios";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const GROQ_API_BASE = "https://api.groq.com/openai/v1/chat/completions";

export async function callGemini(messages, geminiKey) {
  const contents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));
  const response = await axios.post(
    `${GEMINI_API_BASE}?key=${geminiKey}`,
    { contents, generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } },
    { timeout: 30000 }
  );
  const candidate = response.data.candidates?.[0];
  if (!candidate) throw new Error("Gemini returned no candidates.");
  const text = candidate.content?.parts?.[0]?.text ?? "";
  const usage = response.data.usageMetadata ?? {};
  return { text, model: "gemini-1.5-flash", promptTokens: usage.promptTokenCount ?? 0, completionTokens: usage.candidatesTokenCount ?? 0 };
}

export async function callGroq(messages, groqKey) {
  const response = await axios.post(
    GROQ_API_BASE,
    { model: "llama3-8b-8192", messages, temperature: 0.7, max_tokens: 1024 },
    { headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" }, timeout: 30000 }
  );
  const choice = response.data.choices?.[0];
  if (!choice) throw new Error("Groq returned no choices.");
  const usage = response.data.usage ?? {};
  return { text: choice.message?.content ?? "", model: "llama3-8b-8192", promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 };
}
