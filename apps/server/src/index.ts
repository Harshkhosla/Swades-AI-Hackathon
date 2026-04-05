import { env } from "@my-better-t-app/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { compress } from "hono/compress";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import recordingsRoutes from "./routes/recordings";
import chunksRoutes from "./routes/chunks";
import { rateLimiter } from "./middleware/rate-limit";
import { cache } from "./lib/cache";

const app = new Hono();

// ============================================
// Middleware Stack
// ============================================

// Request timing headers (useful for debugging)
app.use(timing());

// Security headers
app.use(secureHeaders());

// Compression for JSON responses
app.use(compress());

// Request logging
app.use(logger());

// CORS configuration
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    maxAge: 86400,
  }),
);

// Rate limiting (applies to all API routes)
app.use("/api/*", rateLimiter());

// ============================================
// Health & Status Endpoints
// ============================================

// Health check
app.get("/", (c) => {
  return c.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// Detailed health check for monitoring
app.get("/health", async (c) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      cache: cache.isAvailable() ? "connected" : "unavailable",
      storage: env.STORAGE_ENDPOINT ? "s3" : "local",
    },
    config: {
      rateLimit: {
        requests: env.RATE_LIMIT_REQUESTS,
        window: env.RATE_LIMIT_WINDOW,
      },
    },
  };

  return c.json(health);
});

// ============================================
// API Routes
// ============================================

app.route("/api/recordings", recordingsRoutes);
app.route("/api/chunks", chunksRoutes);

// ============================================
// Error Handling
// ============================================

app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json(
    {
      success: false,
      error: env.NODE_ENV === "production" 
        ? "Internal server error" 
        : err.message,
    },
    500
  );
});

app.notFound((c) => {
  return c.json({ success: false, error: "Not found" }, 404);
});

export default app;
