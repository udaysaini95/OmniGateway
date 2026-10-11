// circuitBreaker.js — Three-State Fault-Tolerance State Machine
// States: CLOSED (healthy) → OPEN (failing) → HALF_OPEN (recovering)
// Implements the same pattern as Netflix Hystrix.

const state = {
  status: "CLOSED", // CLOSED | OPEN | HALF_OPEN
  failureCount: 0,
  lastFailureTime: null,
  lastSuccessTime: null,
  cooldownMs: 30000, // 30 seconds before HALF_OPEN probe
  failureThreshold: 3, // consecutive failures before tripping
};

/**
 * Returns the provider to use for this request based on circuit state.
 * @returns {"gemini"|"groq"}
 */
export function selectProvider() {
  if (state.status === "CLOSED" || state.status === "HALF_OPEN") {
    return "gemini";
  }
  return "groq";
}

/**
 * Call this when a request to Gemini succeeds.
 * Resets failure count; if HALF_OPEN → returns to CLOSED.
 */
export function recordSuccess() {
  state.lastSuccessTime = Date.now();
  if (state.status === "HALF_OPEN") {
    console.log("[circuitBreaker] Probe succeeded — returning to CLOSED.");
    state.status = "CLOSED";
    state.failureCount = 0;
  } else if (state.status === "CLOSED") {
    state.failureCount = 0;
  }
}

/**
 * Call this when a request to Gemini fails (429, 500, timeout, etc.)
 * After failureThreshold consecutive failures → trips to OPEN.
 * If HALF_OPEN probe fails → returns to OPEN.
 */
export function recordFailure() {
  state.failureCount++;
  state.lastFailureTime = Date.now();

  if (state.status === "HALF_OPEN") {
    console.log("[circuitBreaker] Probe failed — returning to OPEN.");
    state.status = "OPEN";
    return;
  }

  if (
    state.status === "CLOSED" &&
    state.failureCount >= state.failureThreshold
  ) {
    console.log(
      `[circuitBreaker] ${state.failureThreshold} consecutive failures — tripping to OPEN.`
    );
    state.status = "OPEN";
  }
}

/**
 * Tick the circuit breaker: if OPEN and cooldown has elapsed,
 * transition to HALF_OPEN to allow one probe request.
 * Call this before selectProvider() on every request.
 */
export function tick() {
  if (
    state.status === "OPEN" &&
    state.lastFailureTime &&
    Date.now() - state.lastFailureTime >= state.cooldownMs
  ) {
    console.log(
      "[circuitBreaker] Cooldown elapsed — transitioning to HALF_OPEN."
    );
    state.status = "HALF_OPEN";
  }
}

/**
 * Get current circuit breaker state for the dashboard.
 */
export function getState() {
  return {
    state: state.status,
    failureCount: state.failureCount,
    lastFailureTime: state.lastFailureTime,
    lastSuccessTime: state.lastSuccessTime,
    cooldownMs: state.cooldownMs,
    failureThreshold: state.failureThreshold,
  };
}

/**
 * Manually increment failure count (for demo simulation).
 */
export function simulateFailure() {
  recordFailure();
  return getState();
}

/**
 * Reset breaker to healthy CLOSED state (for demo reset).
 */
export function resetBreaker() {
  state.status = "CLOSED";
  state.failureCount = 0;
  state.lastFailureTime = null;
  state.lastSuccessTime = Date.now();
  console.log("[circuitBreaker] Manually reset to CLOSED.");
  return getState();
}
