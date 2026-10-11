package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// StreamProxy handles zero-copy Server-Sent Events (SSE) token forwarding.
// Using goroutines and http.Flusher, tokens are flushed to the client socket immediately
// without queuing inside Node.js event-loop queues.
type StreamProxy struct {
	httpClient *http.Client
}

func NewStreamProxy() *StreamProxy {
	return &StreamProxy{
		httpClient: &http.Client{
			Timeout: 120 * time.Second, // Long timeout for streaming completions
			Transport: &http.Transport{
				MaxIdleConns:        1000,
				MaxIdleConnsPerHost: 200,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

// ForwardStream pipes an upstream SSE stream directly to the downstream HTTP response.
func (p *StreamProxy) ForwardStream(ctx context.Context, w http.ResponseWriter, upstreamURL string, payload []byte, headers http.Header) error {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return fmt.Errorf("response writer does not support streaming flushes")
	}

	req, err := http.NewRequestWithContext(ctx, "POST", upstreamURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("failed to create upstream request: %w", err)
	}

	// Copy headers
	for k, v := range headers {
		req.Header[k] = v
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("upstream request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		w.WriteHeader(resp.StatusCode)
		w.Write(body)
		return nil
	}

	// Set SSE Response Headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	// High-performance line scanner streaming tokens directly
	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadBytes('\n')
		if len(line) > 0 {
			w.Write(line)
			flusher.Flush() // Push chunk immediately to downstream client
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}
	}

	return nil
}
