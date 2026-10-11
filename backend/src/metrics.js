// metrics.js — In-Memory Telemetry Counters
// Tracks request stats, cache performance, and latency.

const metrics = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  totalTokensSaved: 0,
  totalLatencyMs: 0,
  requestsWithLatency: 0,
  startTime: Date.now(),
};

export function incrementRequests() {
  metrics.totalRequests++;
}

export function recordCacheHit(tokensSaved = 0) {
  metrics.cacheHits++;
  metrics.totalTokensSaved += tokensSaved;
}

export function recordCacheMiss() {
  metrics.cacheMisses++;
}

export function recordLatency(ms) {
  metrics.totalLatencyMs += ms;
  metrics.requestsWithLatency++;
}

export function getMetrics() {
  const hitRate =
    metrics.totalRequests > 0
      ? ((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(1)
      : "0.0";

  const avgLatencyMs =
    metrics.requestsWithLatency > 0
      ? Math.round(metrics.totalLatencyMs / metrics.requestsWithLatency)
      : 0;

  const costSaved = (metrics.totalTokensSaved * 0.000002).toFixed(6);

  return {
    totalRequests: metrics.totalRequests,
    cacheHits: metrics.cacheHits,
    cacheMisses: metrics.cacheMisses,
    hitRate: parseFloat(hitRate),
    totalTokensSaved: metrics.totalTokensSaved,
    avgLatencyMs,
    estimatedCostSavedUsd: parseFloat(costSaved),
    uptimeSeconds: Math.floor((Date.now() - metrics.startTime) / 1000),
  };
}

export function resetMetrics() {
  metrics.totalRequests = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.totalTokensSaved = 0;
  metrics.totalLatencyMs = 0;
  metrics.requestsWithLatency = 0;
  metrics.startTime = Date.now();
}
