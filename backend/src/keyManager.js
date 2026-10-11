// keyManager.js — BYOK: AES-256-CBC Encryption & Key Registry
// User API keys are encrypted before in-memory storage.
// Raw keys are NEVER stored, logged, or re-returned after registration.

import crypto from "crypto";
import "dotenv/config";

const SECRET = process.env.ENCRYPTION_SECRET;

if (!SECRET || SECRET.length < 32) {
  console.error(
    "[keyManager] FATAL: ENCRYPTION_SECRET must be at least 32 characters. " +
      "Generate with: openssl rand -hex 16"
  );
  process.exit(1);
}

// In-memory keyStore. V2: replace with MongoDB.
// Key: gatewayToken (e.g. "omni_abc123")
// Value: { name, gemini (encrypted), groq (encrypted), createdAt, requestCount }
const keyStore = new Map();

/**
 * Encrypt a plaintext string with AES-256-CBC.
 * Returns "ivHex:cipherHex"
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
 * Register a new user's Gemini + Groq keys.
 * Encrypts both before storing; returns a new opaque gateway token.
 * @param {string} geminiKey - User's raw Gemini API key
 * @param {string} groqKey   - User's raw Groq API key
 * @param {string} name      - Optional label for the key set
 * @returns {string} gatewayToken e.g. "omni_a3f9c12e4b87..."
 */
export function registerKey(geminiKey, groqKey, name = "default") {
  const gatewayToken = "omni_" + crypto.randomBytes(12).toString("hex");
  keyStore.set(gatewayToken, {
    name,
    gemini: encrypt(geminiKey),
    groq: encrypt(groqKey),
    createdAt: Date.now(),
    requestCount: 0,
  });
  console.log(
    `[keyManager] Registered new gateway token for "${name}": ${gatewayToken.slice(0, 12)}...`
  );
  return gatewayToken;
}

/**
 * Resolve a gateway token to decrypted API keys.
 * Returns null if token is unknown.
 * @param {string} gatewayToken
 * @returns {{ geminiKey: string, groqKey: string } | null}
 */
export function resolveKeys(gatewayToken) {
  const entry = keyStore.get(gatewayToken);
  if (!entry) return null;
  entry.requestCount++;
  return {
    geminiKey: decrypt(entry.gemini),
    groqKey: decrypt(entry.groq),
  };
}

/**
 * Get info about a registered token (no raw keys exposed).
 */
export function getKeyInfo(gatewayToken) {
  const entry = keyStore.get(gatewayToken);
  if (!entry) return null;
  return {
    name: entry.name,
    createdAt: entry.createdAt,
    requestCount: entry.requestCount,
  };
}

/**
 * List all registered tokens (no raw keys — metadata only).
 */
export function listKeys() {
  const result = [];
  for (const [token, entry] of keyStore.entries()) {
    result.push({
      gatewayToken: token.slice(0, 14) + "...",
      name: entry.name,
      createdAt: entry.createdAt,
      requestCount: entry.requestCount,
    });
  }
  return result;
}
