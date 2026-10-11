package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

type ChatCompletionRequest struct {
	Model    string                   `json:"model"`
	Messages []map[string]interface{} `json:"messages"`
	Stream   bool                     `json:"stream"`
}

type EdgeGateway struct {
	cache    *L1Cache
	limiter  *RateLimiter
	streamer *StreamProxy
	nodeURL  string
}

func main() {
	port := os.Getenv("EDGE_PORT")
	if port == "" {
		port = "8080"
	}
	redisURL := os.Getenv("REDIS_URL")
	nodeURL := os.Getenv("NODE_BACKEND_URL")
	if nodeURL == "" {
		nodeURL = "http://localhost:4000"
	}

	gateway := &EdgeGateway{
		cache:    NewL1Cache(),
		limiter:  NewRateLimiter(redisURL),
		streamer: NewStreamProxy(),
		nodeURL:  nodeURL,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", gateway.handleHealth)
	mux.HandleFunc("/v1/chat/completions", gateway.handleChatCompletions)

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 120 * time.Second,
	}

	// Graceful shutdown handling
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("[Go Edge Gateway] Shutting down gracefully...")
		_ = server.Close()
	}()

	log.Printf("[Go Edge Gateway] High-performance edge engine listening on http://localhost:%s\n", port)
	log.Printf("[Go Edge Gateway] Forwarding cache misses and control requests to Node.js at %s\n", nodeURL)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}

func (g *EdgeGateway) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "healthy",
		"engine":      "go-edge-gateway-v1",
		"goroutines":  "active",
		"concurrency": "work-stealing-m-to-n",
	})
}

func (g *EdgeGateway) handleChatCompletions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// 1. Rate Limiting Check (Token-Bucket via Redis Lua or In-Memory)
	apiKey := r.Header.Get("Authorization")
	if apiKey == "" {
		apiKey = "anonymous"
	}

	allowed, tokensRemaining := g.limiter.Allow(r.Context(), apiKey, 20, 60*time.Second)
	if !allowed {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "5")
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "Rate limit exceeded. Token bucket depleted.",
			"code":  429,
		})
		return
	}
	w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", tokensRemaining))

	// 2. Read Request Body
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"Failed to read request body"}`, http.StatusBadRequest)
		return
	}

	var req ChatCompletionRequest
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		http.Error(w, `{"error":"Malformed JSON"}`, http.StatusBadRequest)
		return
	}

	// 3. Fast Path: L1 Exact Match Cache Check (with Multi-Turn Context Isolation)
	bypassCache := r.Header.Get("Cache-Control") == "no-cache" || r.Header.Get("x-omni-no-cache") == "true"
	var lastPrompt string
	if len(req.Messages) > 0 {
		if content, ok := req.Messages[len(req.Messages)-1]["content"].(string); ok {
			lastPrompt = content
		}
	}

	if !bypassCache && lastPrompt != "" {
		cacheKey := GenerateContextFingerprint(req.Messages, lastPrompt)
		if cachedResp, hit := g.cache.Get(cacheKey); hit {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Cache", "HIT")
			w.Header().Set("X-Cache-Tier", "L1-Exact-Go")
			w.Header().Set("X-Response-Time", "1ms")
			json.NewEncoder(w).Encode(cachedResp)
			return
		}
	}

	// 4. Cache Miss Path: Stream directly or Proxy to Upstream / Node.js Controller
	w.Header().Set("X-Cache", "MISS")
	targetURL := fmt.Sprintf("%s/v1/chat/completions", g.nodeURL)

	if req.Stream {
		// High-concurrency zero-copy SSE streaming
		if err := g.streamer.ForwardStream(r.Context(), w, targetURL, bodyBytes, r.Header); err != nil {
			log.Printf("[Go Edge Gateway] Streaming error: %v\v", err)
		}
		return
	}

	// Non-streaming pass-through
	proxyReq, _ := http.NewRequestWithContext(r.Context(), "POST", targetURL, io.NopCloser(io.Reader(nil)))
	// Handled through the streamer's resilient client
	resp, err := g.streamer.httpClient.Post(targetURL, "application/json", io.NopCloser(io.Reader(nil)))
	if err != nil {
		http.Error(w, `{"error":"Failed to reach backend cluster"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, v := range resp.Header {
		w.Header()[k] = v
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
