import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";

// Enums
export const recordingStatusEnum = pgEnum("recording_status", [
  "active",
  "completed",
  "failed",
]);

export const chunkStatusEnum = pgEnum("chunk_status", [
  "pending",
  "uploaded",
  "acknowledged",
  "failed",
]);

// Recordings table - represents a recording session
export const recordings = pgTable("recordings", {
  id: text("id").primaryKey(), // UUID from client
  clientId: text("client_id").notNull(), // Browser/device identifier
  status: recordingStatusEnum("status").default("active").notNull(),
  totalChunks: integer("total_chunks").default(0).notNull(),
  acknowledgedChunks: integer("acknowledged_chunks").default(0).notNull(),
  sampleRate: integer("sample_rate").default(16000).notNull(),
  chunkDuration: integer("chunk_duration").default(5).notNull(), // seconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Chunks table - individual audio chunks
export const chunks = pgTable("chunks", {
  id: text("id").primaryKey(), // UUID from client
  recordingId: text("recording_id")
    .references(() => recordings.id, { onDelete: "cascade" })
    .notNull(),
  chunkIndex: integer("chunk_index").notNull(), // 0-based index
  status: chunkStatusEnum("status").default("pending").notNull(),
  bucketPath: text("bucket_path"), // Path in storage bucket
  fileSize: integer("file_size"), // Size in bytes
  duration: integer("duration"), // Duration in milliseconds
  checksum: text("checksum"), // MD5 or SHA256 hash for verification
  uploadedAt: timestamp("uploaded_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  retryCount: integer("retry_count").default(0).notNull(),
  lastError: text("last_error"),
});

// Types
export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
