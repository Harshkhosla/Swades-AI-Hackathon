import dotenv from "dotenv";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

// Get this file's directory
const __dirname = typeof import.meta.dirname !== 'undefined' 
  ? import.meta.dirname 
  : dirname(fileURLToPath(import.meta.url));

// Load .env from multiple possible locations - both relative to cwd and to this package
const envPaths = [
  // Relative to cwd (when running from project root)
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "apps/server/.env"),
  // Relative to this file (packages/env/src/server.ts -> up to project root)
  resolve(__dirname, "../../../.env"),
  resolve(__dirname, "../../../apps/server/.env"),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // Storage bucket config (S3-compatible - works with MinIO, AWS S3, etc.)
    STORAGE_BUCKET_NAME: z.string().default("recordings"),
    STORAGE_ENDPOINT: z.string().optional(), // e.g., "http://localhost:9000" for MinIO
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    STORAGE_REGION: z.string().default("us-east-1"),
    // Local file storage fallback path
    STORAGE_LOCAL_PATH: z.string().default("./uploads"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
