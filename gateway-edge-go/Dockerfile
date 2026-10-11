# Multi-stage Docker build for ultra-lightweight Go Edge Gateway binary (~15MB image)
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod ./
RUN go mod download || true

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/edge-gateway .

# Final scratch/alpine runtime container
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /root/
COPY --from=builder /app/edge-gateway .

EXPOSE 8080
ENTRYPOINT ["./edge-gateway"]
