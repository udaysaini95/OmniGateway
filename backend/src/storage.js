// storage.js — Embedded Persistent Key & Audit Store (Zero-Dependency JSON Store)
// Provides crash resistance & reboot persistence for AES-256 encrypted keys and state.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const STORAGE_FILE = path.join(DATA_DIR, "gateway_store.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class PersistentStore {
  constructor() {
    this.data = {
      keys: {},
      telemetry: {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        totalTokensSaved: 0,
      },
      auditLogs: [],
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, "utf8");
        this.data = JSON.parse(raw);
        console.log(`[storage] Loaded ${Object.keys(this.data.keys).length} persistent gateway token(s).`);
      }
    } catch (err) {
      console.warn("[storage] Could not read existing store file, starting clean:", err.message);
    }
  }

  save() {
    try {
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(this.data, null, 2), "utf8");
    } catch (err) {
      console.error("[storage] Failed to persist data:", err.message);
    }
  }

  setKey(gatewayToken, record) {
    this.data.keys[gatewayToken] = record;
    this.save();
  }

  getKey(gatewayToken) {
    return this.data.keys[gatewayToken] || null;
  }

  getAllKeys() {
    return Object.entries(this.data.keys).map(([token, record]) => ({
      gatewayToken: token.slice(0, 14) + "...",
      name: record.name,
      createdAt: record.createdAt,
      requestCount: record.requestCount || 0,
      geminiKeyCount: Array.isArray(record.geminiPool) ? record.geminiPool.length : 1,
      groqKeyCount: Array.isArray(record.groqPool) ? record.groqPool.length : 1,
    }));
  }

  addAudit(entry) {
    if (!this.data.auditLogs) this.data.auditLogs = [];
    this.data.auditLogs.unshift(entry);
    if (this.data.auditLogs.length > 50) this.data.auditLogs.pop();
    this.save();
  }

  getAuditLogs() {
    return this.data.auditLogs || [];
  }
}

export const persistentStore = new PersistentStore();
