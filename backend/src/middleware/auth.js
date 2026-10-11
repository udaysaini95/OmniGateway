// auth.js — Gateway Token Validation Middleware
// Extracts Bearer token from Authorization header and resolves it to user keys.
// Attaches decrypted keys to req.userKeys for downstream use.

import { resolveKeys } from "../keyManager.js";

export function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization header. Use: Bearer omni_<token>" });
  }

  const token = authHeader.slice(7).trim();
  if (!token.startsWith("omni_")) {
    return res.status(401).json({ error: "Invalid gateway token format. Token must start with 'omni_'" });
  }

  const keys = resolveKeys(token);
  if (!keys) {
    return res.status(401).json({ error: "Unknown gateway token. Register your keys at POST /keys/register" });
  }

  req.gatewayToken = token;
  req.userKeys = keys; // { geminiKey, groqKey } — decrypted, in-memory only
  next();
}
