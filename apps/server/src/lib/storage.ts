import { env } from "@my-better-t-app/env/server";
import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

export interface StorageResult {
  success: boolean;
  path?: string;
  checksum?: string;
  size?: number;
  error?: string;
}

export interface StorageProvider {
  upload(key: string, data: Buffer): Promise<StorageResult>;
  download(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  getChecksum(key: string): Promise<string | null>;
}

/**
 * Local file storage implementation
 * Can be swapped for S3/MinIO in production
 */
class LocalStorage implements StorageProvider {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  private getFullPath(key: string): string {
    return join(this.basePath, key);
  }

  private computeChecksum(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex");
  }

  async upload(key: string, data: Buffer): Promise<StorageResult> {
    try {
      const fullPath = this.getFullPath(key);
      const dir = dirname(fullPath);

      // Ensure directory exists
      await mkdir(dir, { recursive: true });

      // Write file
      await writeFile(fullPath, data);

      // Compute checksum
      const checksum = this.computeChecksum(data);

      return {
        success: true,
        path: key,
        checksum,
        size: data.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  }

  async download(key: string): Promise<Buffer | null> {
    try {
      const fullPath = this.getFullPath(key);
      return await readFile(fullPath);
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const fullPath = this.getFullPath(key);
      await stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const fullPath = this.getFullPath(key);
      await unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getChecksum(key: string): Promise<string | null> {
    const data = await this.download(key);
    if (!data) return null;
    return this.computeChecksum(data);
  }
}

// Export singleton storage instance
export const storage: StorageProvider = new LocalStorage(env.STORAGE_LOCAL_PATH);

/**
 * Generate a storage key for a chunk
 */
export function getChunkStorageKey(
  recordingId: string,
  chunkIndex: number
): string {
  return `recordings/${recordingId}/chunks/${chunkIndex.toString().padStart(6, "0")}.wav`;
}
