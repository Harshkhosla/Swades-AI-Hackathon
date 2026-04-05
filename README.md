# Reliable Recording Chunking Pipeline

An assignment for building a reliable chunking setup that ensures recording data stays accurate in all cases — no data loss, no silent failures.

## How It Works

```
Client (Browser)
    │
    ├── 1. Record & chunk data on the client side
    ├── 2. Store chunks in OPFS (Origin Private File System)
    ├── 3. Upload chunks to a storage bucket
    ├── 4. On success → acknowledge (ack) to the database
    │
    └── Recovery: if DB has ack but chunk is missing from bucket
        └── Re-send from OPFS → bucket
```

**Main objective:** In all cases, the recording data stays accurate. OPFS acts as the durable client-side buffer — chunks are only cleared after the bucket and DB are both confirmed in sync.

### Flow Details

1. **Client-side chunking** — Recording data is split into chunks in the browser
2. **OPFS storage** — Each chunk is persisted to the Origin Private File System before any network call, so nothing is lost if the tab closes or the network drops
3. **Bucket upload** — Chunks are uploaded to a storage bucket (can be a local bucket for testing, e.g. MinIO or a local S3-compatible store)
4. **DB acknowledgment** — Once the bucket confirms receipt, an ack record is written to the database
5. **Reconciliation** — If the DB shows an ack but the chunk is missing from the bucket (e.g. bucket purge, replication lag), the client re-uploads from OPFS to restore consistency

## Tech Stack

- **Next.js** — Frontend (App Router)
- **Hono** — Backend API server
- **Bun** — Runtime
- **Drizzle ORM + PostgreSQL** — Database
- **TailwindCSS + shadcn/ui** — UI
- **Turborepo** — Monorepo build system

## Getting Started

```bash
npm install
```

### Database Setup

1. Start Docker Desktop (required for PostgreSQL)
2. Start the database container:

```bash
npm run db:start
```

3. Push the schema to the database:

```bash
npm run db:push
```

### Environment Variables

The `.env` files are already configured for local development:

**apps/server/.env:**
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/recordings_db"
CORS_ORIGIN="http://localhost:3001"
NODE_ENV="development"
STORAGE_LOCAL_PATH="./uploads"
```

**apps/web/.env:**
```env
NEXT_PUBLIC_SERVER_URL="http://localhost:3000"
```

### Run Development

```bash
npm run dev
```

- Web app: [http://localhost:3001](http://localhost:3001)
- API server: [http://localhost:3000](http://localhost:3000)

## API Endpoints

### Recordings

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/recordings` | Create a new recording session |
| GET | `/api/recordings/:id` | Get recording details |
| POST | `/api/recordings/:id/complete` | Mark recording as complete |

### Chunks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chunks/upload` | Upload a chunk (multipart/form-data) |
| POST | `/api/chunks/ack` | Acknowledge a chunk is safely stored |
| GET | `/api/chunks/recording/:recordingId` | Get all chunks for a recording |
| GET | `/api/chunks/needs-reupload/:recordingId` | Get chunks needing re-upload |
| POST | `/api/chunks/reconcile` | Verify and repair chunk storage |
| GET | `/api/chunks/:chunkId/status` | Get chunk status |

## Client-Side Pipeline

The recording pipeline uses OPFS (Origin Private File System) for durability:

```
Recording Start → Create Recording Session (DB)
       ↓
Audio Chunk Ready → Save to OPFS → Upload to Server → Acknowledge
       ↓
Recording Stop → Complete Recording → Clean up OPFS (after all acks)
```

### OPFS Storage

Chunks are stored in OPFS at:
```
/recordings/{recordingId}/chunks/chunk_000001.wav
/recordings/{recordingId}/metadata.json
```

### Recovery Flow

On page load or manual trigger:
1. Call `/api/chunks/reconcile` to check for missing chunks
2. If chunks are missing from storage but exist in OPFS, re-upload them
3. Clean up OPFS only after successful acknowledgment

## Load Testing

Target: **300,000 requests** to validate the chunking pipeline under heavy load.

### Setup

Use a load testing tool like [k6](https://k6.io), [autocannon](https://github.com/mcollina/autocannon), or [artillery](https://artillery.io) to simulate concurrent chunk uploads.

Example with **k6**:

```js
import http from "k6/http";
import { check } from "k6";
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  scenarios: {
    chunk_uploads: {
      executor: "constant-arrival-rate",
      rate: 5000,           // 5,000 req/s
      timeUnit: "1s",
      duration: "1m",       // → 300K requests in 60s
      preAllocatedVUs: 500,
      maxVUs: 1000,
    },
  },
};

// Create a test recording first, then use its ID
const RECORDING_ID = "test-recording-id"; // Replace with actual recording ID

export default function () {
  const chunkId = uuidv4();
  const chunkIndex = __ITER;
  
  // Create dummy WAV data (1KB)
  const dummyData = "x".repeat(1024);
  
  const formData = {
    file: http.file(dummyData, `chunk_${chunkIndex}.wav`, "audio/wav"),
    chunkId: chunkId,
    recordingId: RECORDING_ID,
    chunkIndex: chunkIndex.toString(),
    duration: "5000",
  };

  const res = http.post("http://localhost:3000/api/chunks/upload", formData);

  check(res, {
    "upload status 200": (r) => r.status === 200,
  });

  // Acknowledge the chunk
  if (res.status === 200) {
    const ackRes = http.post(
      "http://localhost:3000/api/chunks/ack",
      JSON.stringify({ chunkId }),
      { headers: { "Content-Type": "application/json" } }
    );
    
    check(ackRes, {
      "ack status 200": (r) => r.status === 200,
    });
  }
}
```

Run:

```bash
k6 run load-test.js
```

### What to Validate

- **No data loss** — every ack in the DB has a matching chunk in the bucket
- **OPFS recovery** — chunks survive client disconnects and can be re-uploaded
- **Throughput** — server handles sustained 5K req/s without dropping chunks
- **Consistency** — reconciliation catches and repairs any bucket/DB mismatches after the run

## Project Structure

```
recoding-assignment/
├── apps/
│   ├── web/         # Frontend (Next.js) — chunking, OPFS, upload logic
│   └── server/      # Backend API (Hono) — bucket upload, DB ack
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── db/          # Drizzle ORM schema & queries
│   ├── env/         # Type-safe environment config
│   └── config/      # Shared TypeScript config
```

## Available Scripts

- `npm run dev` — Start all apps in development mode
- `npm run build` — Build all apps
- `npm run dev:web` — Start only the web app
- `npm run dev:server` — Start only the server
- `npm run check-types` — TypeScript type checking
- `npm run db:push` — Push schema changes to database
- `npm run db:generate` — Generate database client/types
- `npm run db:migrate` — Run database migrations
- `npm run db:studio` — Open database studio UI
