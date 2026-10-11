// keyManager.js — BYOK: AES-256-CBC Encryption & Multi-Key Multiplexing Pool
// Supports multi-key round-robin rotation per provider to maximize free-tier throughput.
// Persists encrypted records across server restarts via persistentStore.

import crypto from "crypto";
import "dotenv/config";
import { persistentStore } from "./storage.js";

const SECRET = process.env.ENCRYPTION_SECRET;

if (!SECRET || SECRET.length < 32) {
  console.error(
    "[keyManager] FATAL: ENCRYPTION_SECRET must be at least 32 characters. " +
      "Generate with: openssl rand -hex 16"
  );
  process.exit(1);
}

// In-memory key pointer indices for round-robin rotation
const rotationIndices = new Map();

/**
 * Encrypt a plaintext string with AES-256-CBC.
 */
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(SECRET.slice(0, 32)),
    iv
  );
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

/**
 * Decrypt an "ivHex:cipherHex" string back to plaintext.
 */
function decrypt(encryptedText) {
  const [ivHex, encHex] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(SECRET.slice(0, 32)),
    iv
  );
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]).toString();
}

/**
 * Normalize an input into an array of trimmed keys
 */
function parseKeyArray(input) {
  if (Array.isArray(input)) return input.map(k => String(k).trim()).filter(Boolean);
  if (typeof input === "string") {
    return input.split(/[\n,]/).map(k => k.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Register a new user's Gemini + Groq keys (supports single key or multi-key arrays).
 * Encrypts all keys before storing.
 */
export function registerKey(geminiKeysInput, groqKeysInput, name = "default") {
  const geminiKeys = parseKeyArray(geminiKeysInput);
  const groqKeys = parseKeyArray(groqKeysInput);

  if (geminiKeys.length === 0 || groqKeys.length === 0) {
    throw new Error("At least one Gemini key and one Groq key are required.");
  }

  const gatewayToken = "omni_" + crypto.randomBytes(12).toString("hex");

  const record = {
    name,
    geminiPool: geminiKeys.map(k => encrypt(k)),
    groqPool: groqKeys.map(k => encrypt(k)),
    createdAt: Date.now(),
    requestCount: 0,
  };

  persistentStore.setKey(gatewayToken, record);
  rotationIndices.set(gatewayToken, { gemini: 0, groq: 0 });

  console.log(
    `[keyManager] Registered token ${gatewayToken.slice(0, 14)}... with ${geminiKeys.length} Gemini & ${groqKeys.length} Groq key(s).`
  );

  return gatewayToken;
}

/**
 * Resolve a gateway token to decrypted API keys with Round-Robin Rotation.
 * Multiplexes across user's key pool to distribute RPM quota.
 */
export function resolveKeys(gatewayToken) {
  const record = persistentStore.getKey(gatewayToken);
  if (!record) return null;

  record.requestCount = (record.requestCount || 0) + 1;
  persistentStore.setKey(gatewayToken, record);

  let idxState = rotationIndices.get(gatewayToken);
  if (!idxState) {
    idxState = { gemini: 0, groq: 0 };
    rotationIndices.set(gatewayToken, idxState);
  }

  // Handle single key backward compatibility or pool
  const geminiPool = record.geminiPool || (record.gemini ? [record.gemini] : []);
  const groqPool = record.groqPool || (record.groq ? [record.groq] : []);

  const geminiEncrypted = geminiPool[idxState.gemini % geminiPool.length];
  const groqEncrypted = groqPool[idxState.groq % groqPool.length];

  // Rotate indices for next request
  idxState.gemini = (idxState.gemini + 1) % geminiPool.length;
  idxState.groq = (idxState.groq + 1) % groqPool.length;

  return {
    geminiKey: decrypt(geminiEncrypted),
    groqKey: decrypt(groqEncrypted),
    // Also provide complete backup pools for in-flight 429 retries
    geminiPool: geminiPool.map(k => decrypt(k)),
    groqPool: groqPool.map(k => decrypt(k)),
  };
}

/**
 * List all registered tokens (metadata only)
 */
export function listKeys() {
  return persistentStore.getAllKeys();
}
