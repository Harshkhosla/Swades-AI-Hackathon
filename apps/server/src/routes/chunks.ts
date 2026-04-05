import { Hono } from "hono";
import { z } from "zod";
import { db, chunks, recordings } from "@my-better-t-app/db";
import { eq, and, sql } from "drizzle-orm";
import { storage, getChunkStorageKey } from "../lib/storage";

const app = new Hono();

// Upload a chunk
app.post("/upload", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const chunkId = formData.get("chunkId") as string | null;
    const recordingId = formData.get("recordingId") as string | null;
    const chunkIndex = formData.get("chunkIndex") as string | null;
    const duration = formData.get("duration") as string | null;

    if (!file || !chunkId || !recordingId || chunkIndex === null) {
      return c.json(
        { success: false, error: "Missing required fields" },
        400
      );
    }

    const index = parseInt(chunkIndex, 10);
    const durationMs = duration ? parseInt(duration, 10) : undefined;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate storage key
    const storageKey = getChunkStorageKey(recordingId, index);

    // Upload to storage bucket
    const uploadResult = await storage.upload(storageKey, buffer);

    if (!uploadResult.success) {
      return c.json(
        { success: false, error: uploadResult.error || "Upload failed" },
        500
      );
    }

    // Insert or update chunk record in DB
    const [chunk] = await db
      .insert(chunks)
      .values({
        id: chunkId,
        recordingId,
        chunkIndex: index,
        status: "uploaded",
        bucketPath: uploadResult.path,
        fileSize: uploadResult.size,
        duration: durationMs,
        checksum: uploadResult.checksum,
        uploadedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: chunks.id,
        set: {
          status: "uploaded",
          bucketPath: uploadResult.path,
          fileSize: uploadResult.size,
          checksum: uploadResult.checksum,
          uploadedAt: new Date(),
          retryCount: sql`${chunks.retryCount} + 1`,
        },
      })
      .returning();

    if (!chunk) {
      return c.json({ success: false, error: "Failed to save chunk" }, 500);
    }

    return c.json({
      success: true,
      chunk: {
        id: chunk.id,
        status: chunk.status,
        bucketPath: chunk.bucketPath,
        checksum: chunk.checksum,
      },
    });
  } catch (error) {
    console.error("Failed to upload chunk:", error);
    return c.json(
      { success: false, error: "Failed to upload chunk" },
      500
    );
  }
});

// Acknowledge a chunk (confirm it's safely stored)
const ackChunkSchema = z.object({
  chunkId: z.string().uuid(),
  checksum: z.string().optional(), // Client can verify checksum
});

app.post("/ack", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = ackChunkSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ success: false, error: "Invalid request body" }, 400);
    }

    const { chunkId, checksum } = parsed.data;

    // Get the chunk
    const [chunk] = await db
      .select()
      .from(chunks)
      .where(eq(chunks.id, chunkId))
      .limit(1);

    if (!chunk) {
      return c.json({ success: false, error: "Chunk not found" }, 404);
    }

    // Verify chunk exists in storage
    if (!chunk.bucketPath) {
      return c.json(
        { success: false, error: "Chunk not uploaded to storage" },
        400
      );
    }

    const existsInBucket = await storage.exists(chunk.bucketPath);
    if (!existsInBucket) {
      // Mark as failed - needs re-upload
      await db
        .update(chunks)
        .set({ status: "failed", lastError: "Chunk missing from storage" })
        .where(eq(chunks.id, chunkId));

      return c.json(
        {
          success: false,
          error: "Chunk missing from storage",
          needsReupload: true,
        },
        400
      );
    }

    // Optional: verify checksum
    if (checksum && chunk.checksum !== checksum) {
      return c.json(
        {
          success: false,
          error: "Checksum mismatch",
          needsReupload: true,
        },
        400
      );
    }

    // Mark as acknowledged
    const [updated] = await db
      .update(chunks)
      .set({
        status: "acknowledged",
        acknowledgedAt: new Date(),
      })
      .where(eq(chunks.id, chunkId))
      .returning();

    if (!updated) {
      return c.json({ success: false, error: "Failed to update chunk" }, 500);
    }

    // Update recording's acknowledged count
    await db
      .update(recordings)
      .set({
        acknowledgedChunks: sql`${recordings.acknowledgedChunks} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(recordings.id, chunk.recordingId));

    return c.json({
      success: true,
      chunk: {
        id: updated.id,
        status: updated.status,
        acknowledgedAt: updated.acknowledgedAt,
      },
    });
  } catch (error) {
    console.error("Failed to acknowledge chunk:", error);
    return c.json(
      { success: false, error: "Failed to acknowledge chunk" },
      500
    );
  }
});

// Get chunks for a recording
app.get("/recording/:recordingId", async (c) => {
  const recordingId = c.req.param("recordingId");

  try {
    const chunkList = await db
      .select()
      .from(chunks)
      .where(eq(chunks.recordingId, recordingId))
      .orderBy(chunks.chunkIndex);

    return c.json({ success: true, chunks: chunkList });
  } catch (error) {
    console.error("Failed to get chunks:", error);
    return c.json({ success: false, error: "Failed to get chunks" }, 500);
  }
});

// Get chunks that need re-upload (acknowledged in DB but missing from bucket)
app.get("/needs-reupload/:recordingId", async (c) => {
  const recordingId = c.req.param("recordingId");

  try {
    const chunkList = await db
      .select()
      .from(chunks)
      .where(
        and(
          eq(chunks.recordingId, recordingId),
          eq(chunks.status, "acknowledged")
        )
      )
      .orderBy(chunks.chunkIndex);

    // Check which ones are actually missing from storage
    const needsReupload: string[] = [];

    for (const chunk of chunkList) {
      if (chunk.bucketPath) {
        const exists = await storage.exists(chunk.bucketPath);
        if (!exists) {
          needsReupload.push(chunk.id);
        }
      }
    }

    return c.json({ success: true, needsReupload });
  } catch (error) {
    console.error("Failed to check chunks:", error);
    return c.json({ success: false, error: "Failed to check chunks" }, 500);
  }
});

// Reconciliation endpoint - verify all acknowledged chunks exist in storage
const reconcileSchema = z.object({
  recordingId: z.string().uuid(),
});

app.post("/reconcile", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = reconcileSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ success: false, error: "Invalid request body" }, 400);
    }

    const { recordingId } = parsed.data;

    const chunkList = await db
      .select()
      .from(chunks)
      .where(eq(chunks.recordingId, recordingId))
      .orderBy(chunks.chunkIndex);

    const results = {
      total: chunkList.length,
      verified: 0,
      missing: [] as Array<{ id: string; chunkIndex: number }>,
      failed: [] as Array<{ id: string; chunkIndex: number; error: string }>,
    };

    for (const chunk of chunkList) {
      if (!chunk.bucketPath) {
        results.missing.push({ id: chunk.id, chunkIndex: chunk.chunkIndex });
        continue;
      }

      const exists = await storage.exists(chunk.bucketPath);
      if (!exists) {
        results.missing.push({ id: chunk.id, chunkIndex: chunk.chunkIndex });

        // Mark chunk as needing re-upload
        await db
          .update(chunks)
          .set({
            status: "pending",
            lastError: "Missing from storage during reconciliation",
          })
          .where(eq(chunks.id, chunk.id));
      } else {
        results.verified++;
      }
    }

    return c.json({
      success: true,
      reconciliation: results,
      needsAction: results.missing.length > 0,
    });
  } catch (error) {
    console.error("Failed to reconcile:", error);
    return c.json({ success: false, error: "Reconciliation failed" }, 500);
  }
});

// Get chunk status
app.get("/:chunkId/status", async (c) => {
  const chunkId = c.req.param("chunkId");

  try {
    const [chunk] = await db
      .select()
      .from(chunks)
      .where(eq(chunks.id, chunkId))
      .limit(1);

    if (!chunk) {
      return c.json({ success: false, error: "Chunk not found" }, 404);
    }

    // Verify storage if needed
    let existsInStorage = false;
    if (chunk.bucketPath) {
      existsInStorage = await storage.exists(chunk.bucketPath);
    }

    return c.json({
      success: true,
      chunk: {
        id: chunk.id,
        status: chunk.status,
        existsInStorage,
        checksum: chunk.checksum,
      },
    });
  } catch (error) {
    console.error("Failed to get chunk status:", error);
    return c.json({ success: false, error: "Failed to get chunk status" }, 500);
  }
});

export default app;
