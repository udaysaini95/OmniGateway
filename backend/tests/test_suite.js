import { registerKey, resolveKeys } from "../src/keyManager.js";
import { checkRateLimit } from "../src/rateLimiter.js";
import { lookupCache, storeCache, clearCache, getContextFingerprint } from "../src/cache.js";
import { tick, selectProvider, recordFailure, recordSuccess, resetBreaker, getState } from "../src/circuitBreaker.js";

async function runTests() {
  console.log("==========================================");
  console.log("🧪 RUNNING OMNIGATEWAY ARCHITECTURAL TESTS");
  console.log("==========================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Encryption & Multi-Key Registration
  console.log("--- 1. BYOK Encryption & Multi-Key Pooling ---");
  const testGeminiKeys = ["AIzaSyTestKey1", "AIzaSyTestKey2"];
  const testGroqKeys = ["gsk_TestKeyA", "gsk_TestKeyB"];
  const token = registerKey(testGeminiKeys, testGroqKeys, "test-suite");

  assert(token.startsWith("omni_"), "Gateway token is issued with omni_ prefix");

  const resolved1 = resolveKeys(token);
  const resolved2 = resolveKeys(token);

  assert(resolved1.geminiKey === "AIzaSyTestKey1", "Round-Robin Key 1 resolved correctly");
  assert(resolved2.geminiKey === "AIzaSyTestKey2", "Round-Robin rotates to Key 2 on second call");
  assert(resolved1.geminiPool.length === 2, "Full key pool accessible for in-flight retries");

  // 2. Token Bucket Rate Limiting
  console.log("\n--- 2. Token-Bucket Rate Limiter ---");
  const testToken = "omni_rate_limit_test";
  let allowedCount = 0;
  for (let i = 0; i < 25; i++) {
    const rl = checkRateLimit(testToken);
    if (rl.allowed) allowedCount++;
  }
  assert(allowedCount === 20, `Capacity enforcement: exactly 20 calls allowed, got ${allowedCount}`);

  // 3. Multi-Turn Context Isolation (No Cross-Chat Collisions)
  console.log("\n--- 3. Two-Tier Cache & Multi-Turn Isolation ---");
  clearCache();

  const chatA = [
    { role: "user", content: "Who is the CEO of Apple?" },
    { role: "assistant", content: "Tim Cook" },
    { role: "user", content: "Where did he study?" }
  ];

  const chatB = [
    { role: "user", content: "Who is the CEO of Tesla?" },
    { role: "assistant", content: "Elon Musk" },
    { role: "user", content: "Where did he study?" }
  ];

  const fpA = getContextFingerprint(chatA);
  const fpB = getContextFingerprint(chatB);

  assert(fpA !== fpB, "Distinct conversation threads produce distinct context fingerprints");

  // Store response for Chat A
  storeCache({
    messages: chatA,
    promptEmbedding: [0.1, 0.2, 0.3],
    response: "Tim Cook studied at Auburn and Duke.",
    model: "test-model",
    tokens: 25,
  });

  // Query Chat A (Exact match L1)
  const lookupA = lookupCache({ messages: chatA, queryEmbedding: null });
  assert(lookupA !== null && lookupA.entry.response.includes("Tim Cook"), "Chat A gets exact L1 cache hit");

  // Query Chat B (Same prompt 'Where did he study?' but different conversation context)
  const lookupB = lookupCache({ messages: chatB, queryEmbedding: [0.1, 0.2, 0.3] });
  assert(lookupB === null, "CRITICAL: Chat B DOES NOT falsely hit Chat A's answer (Zero cross-chat collision!)");

  // 4. Circuit Breaker Fault-Tolerance Machine
  console.log("\n--- 4. Netflix Hystrix Circuit Breaker Transitions ---");
  resetBreaker();
  assert(selectProvider() === "gemini", "Breaker starts in CLOSED state routing to Gemini");

  recordFailure();
  recordFailure();
  assert(getState().state === "CLOSED", "Breaker remains CLOSED at 2 failures");

  recordFailure(); // 3rd failure trips
  assert(getState().state === "OPEN", "Breaker trips to OPEN after 3 consecutive failures");
  assert(selectProvider() === "groq", "Breaker in OPEN state auto-reroutes all traffic to Groq");

  resetBreaker();
  assert(getState().state === "CLOSED", "Reset brings breaker cleanly back to CLOSED");

  console.log("\n==========================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================");

  if (failed > 0) process.exit(1);
}

runTests();
