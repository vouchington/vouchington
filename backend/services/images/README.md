# Images Service

This service handles client-side direct uploads to a dedicated staging S3 bucket using presigned
URLs. After the client uploads to staging, the API streams and hashes the bytes, promotes those
verified bytes to an immutable digest key in the final-images bucket, persists the hash and final
key, and hands off image-metadata extraction (sharp) to the worker via the
[`@queues/images`](../../queues/images/README.md) `extract-metadata` job. Sharp is
intentionally not loaded by the API container.

[`@vouchington/media`](https://github.com/vouchington/vouchington-platform/tree/main/packages/media)
provides request validation, streamed hashing, private temporary files, and S3 primitives. Vouchington
owns the complete workflow: PostgreSQL transitions and transactions, duplicate decisions, S3 bucket
selection, HTTP semantics, queueing, metadata finalization, PubSub, cleanup ordering, and moderation
policy.

## Architecture

### Storage Strategy

**S3 buckets and keys:**

- `S3_BUCKET_IMAGE_UPLOADS` holds browser-writable, UUIDv7-keyed staging uploads.
- `S3_BUCKET_IMAGES` holds final, private, SHA-256-keyed canonical objects plus conditionally created
  image-ID delivery aliases made from the same server-verified frozen bytes.
- The browser receives presigned PUTs only for staging. Image readers, including the resize Lambda,
  use only the final bucket.

`upload_staged_at` records when the staging source was created. The durable
`upload_source_deleted_at` timestamp is written only after that source is deleted, so cleanup can
safely retry interrupted deletions.

**Deduplication:**

- Hash is calculated server-side after upload completes
- Duplicates are detected and removed automatically
- Only one canonical digest object is stored for each unique image

### Promotion and metadata handoff

Completion freezes and hashes the staged source once, then conditionally writes the frozen bytes
to the SHA-256 key in `S3_BUCKET_IMAGES`. A pre-existing final key is re-read and hash-verified;
it is never blindly trusted. Before deleting staging, the API also conditionally creates and
verifies an image-ID delivery alias from that frozen file so the existing `/images/{imageId}` CDN
contract remains resolvable. The database persists only the canonical digest key, then deletes the
staging source and records deletion evidence.

The metadata job carries only `{ id }`. The worker reloads PostgreSQL from the primary, requires the
persisted key to match the row's SHA-256 digest, and reads metadata only from that canonical object.

### Database Schema

The `images` table includes:

```sql
-- Core columns
id UUID PRIMARY KEY DEFAULT uuidv7()
s3_key TEXT NOT NULL              -- SHA-256 hex key after promotion
sha_256 BYTEA                     -- Null until completion freezes and hashes the staged upload
upload_staged_at TIMESTAMPTZ      -- Provenance: browser source was the staging bucket
upload_source_deleted_at TIMESTAMPTZ -- Durable evidence that the staging source was deleted
created_by_id UUID NOT NULL        -- User who created the image
data JSONB NOT NULL                -- Sharp metadata (dimensions, format, etc.)

-- Upload lifecycle tracking
upload_started_at TIMESTAMPTZ      -- Processing has claimed the upload
upload_completed_at TIMESTAMPTZ    -- When upload was completed
upload_failed_at TIMESTAMPTZ       -- When processing failed terminally
upload_error TEXT                  -- Error message if failed

-- Soft delete
deleted_at TIMESTAMPTZ             -- When image was flagged/deleted
deleted_by_id UUID                 -- Who deleted it

-- AI moderation
openai_omni_moderation_results JSONB
openai_omni_moderation_flagged BOOLEAN
openai_omni_moderation_created_at TIMESTAMPTZ
```

`upload_status` is a public, derived value, not a PostgreSQL column. `deriveUploadStatus()` returns
`failed` when `upload_failed_at` is set, otherwise `complete` when `upload_completed_at` is set,
otherwise `processing` when `upload_started_at` is set, and `pending` when all three are null.

## Direct Upload Flow

### 1. Request Upload URL

**Endpoint:** `POST /api/v1/images/upload-url`

**Request:**

```json
{
  "content_type": "image/jpeg",
  "content_length": 1234567
}
```

**Response:**

```json
{
  "image_id": "01936f8e-8b2a-7890-a456-123456789012",
  "upload_url": "https://s3.amazonaws.com/...",
  "content_type": "image/jpeg",
  "expires_at": "2024-03-15T10:30:00Z"
}
```

**What happens:**

1. Validates format is supported (jpeg, png, webp, gif, tiff, avif, heif)
2. Validates size is under 50MB
3. Generates UUIDv7 for image ID
4. Creates a presigned S3 URL in the staging bucket (expires in 1 hour)
5. Creates a database record with `upload_started_at`, `upload_completed_at`, and
   `upload_failed_at` unset (derived `pending`); `upload_staged_at` records the staging source

**Service:** `createImageUploadUrl()` in `create-upload-url.mts`

### 2. Upload to S3

Client uploads directly to the presigned URL:

```bash
curl -X PUT "https://s3.amazonaws.com/..." \
  -H "Content-Type: image/jpeg" \
  --data-binary @image.jpg
```

### 3. Complete Upload

**Endpoint:** `POST /api/v1/images/:id/completions`

**Response:**

```json
{
  "image": {
    "id": "01936f8e-8b2a-7890-a456-123456789012",
    "upload_status": "processing"
  }
}
```

**What happens (synchronous in the API):**

1. Validates user owns the upload
2. Requires the derived status to be `pending`
3. Claims the upload by writing `upload_started_at`, making its derived status `processing`
4. Streams the image from staging once while hashing it into a private temporary file
5. Checks for duplicates by hash
6. If duplicate exists:
   - Deletes the staging object
   - Deletes new DB record
   - Returns existing image
7. If unique:
   - Conditionally promotes the frozen bytes to the SHA-256 key in the final bucket
   - Persists the hash and final key on the row (still derived `processing`)
   - Deletes the staging object after the final key is durable
   - Enqueues `images:extract-metadata` to finish the upload in the worker

**What happens (async in the worker):**

1. Reads the final-bucket digest key to an owned private temp file
2. Runs `sharp(...).metadata()` and validates the format
3. Writes `data` and `upload_completed_at` only when the row is active and nonterminal
4. Fires `enqueueOnImageCreated` so downstream listeners run only after metadata is populated

If completion or metadata processing fails, the active nonterminal row records
`upload_failed_at` and `upload_error`; `processing` remains a derived state while only
`upload_started_at` is set.

**Services:** `completeImageUpload()` in `complete-upload.mts` (API),
`processExtractImageMetadata()` in [`backend/workers/images/processors/extract-metadata.mts`](../../workers/images/processors/extract-metadata.mts) (worker).

## Deduplication

### How It Works

1. **Hash Calculation:** SHA-256 hash is calculated from image bytes
2. **Uniqueness Check:** Query `images` table by `sha_256`
3. **Duplicate Handling:**
   - If hash exists → return existing image, delete new upload
   - If hash was deleted → reject with "previously flagged"
   - If unique → keep new upload

### Why Hash After Upload?

For direct S3 uploads, the hash is calculated **after** upload because:

- Client cannot be trusted to provide accurate hash
- Calculating hash requires downloading the full image
- We need to validate format and metadata anyway

## Background Jobs

### Cleanup Abandoned Uploads

**Schedule:** Every hour
**Worker:** `@queues/images`
**Function:** `cleanupAbandonedUploads()` in [`services/images/cleanup-abandoned-uploads.mts`](cleanup-abandoned-uploads.mts)

**What it does:**

1. Retries staging-source deletion for rows older than one hour once a final digest is durable or
   the row is terminal. Deleted/failed rows retry all known storage; live rows delete only the
   browser-writable staging source. Deletion evidence is recorded only after success.
2. Re-enqueues metadata for `processing` rows older than one hour that already have both
   `sha_256` and the matching final digest `s3_key`. This recovers an enqueue failure after the
   API committed the final key.
3. After 24 hours, claims only incomplete nonterminal rows under a short database lock; durable
   digest rows are excluded from terminalization.
4. Soft-deletes the incomplete rows, deletes their known storage outside the lock, then records
   `upload_source_deleted_at`.
5. Processes up to 100 rows in each bounded recovery and cleanup sweep.

This handles cases where:

- Client never uploads after getting URL
- Client uploads but never calls `/completions`
- Server crashes during processing
- The API commits a promoted final key but its metadata enqueue is lost or fails
- A post-promotion or terminal storage delete fails transiently

## Error Handling

| Scenario            | Status | Response                                      |
| ------------------- | ------ | --------------------------------------------- |
| Unsupported format  | 400    | "Unsupported format: {format}"                |
| File too large      | 400    | "Image too large (max 50MB)"                  |
| Image not found     | 404    | "Image not found"                             |
| Wrong user          | 403    | "Not authorized to complete this upload"      |
| Already complete    | 200    | Returns existing image                        |
| Already processing  | 409    | "Upload is already being processed"           |
| Previously deleted  | 400    | "Image was previously flagged and deleted"    |
| Duplicate detected  | 200    | Returns existing image (new upload deleted)   |
| S3/processing error | 500    | Records `upload_failed_at` and `upload_error` |

## Security

### Upload Validation

- Format: Only allow JPEG, PNG, WebP, GIF, TIFF, AVIF, HEIF
- Size: Maximum 50MB
- Content-Type: Must match allowed formats
- Authorization: User must be logged in

### Presigned URLs

- Expire after 1 hour
- Scoped to specific S3 key (UUID)
- Require specific Content-Type and Content-Length
- Can be reused until expiry; the private staging bucket's two-day lifecycle independently removes
  objects recreated after application cleanup

### Serving Images

- Public image reads use a stable placement route. A placement binds one hosted surface to one image,
  carries a monotonic revision, and is retired rather than deleted when that attachment is removed.
  Copyright withholding changes only that placement, so a shared image remains available through
  unaffected placements. Trusted delivery must reject an unknown, retired, withheld, stale, or
  image-mismatched placement route before serving bytes. The application and resize Lambda establish
  this contract, but full denial also depends on the infrastructure-owned edge registry,
  authorization, invalidation, direct-origin controls, and legacy-route retirement described in the
  [copyright lifecycle](../../../docs/requirements/moderation/COPYRIGHT-NOTICES.md#placement-enforcement-boundary).
- Backend OpenAI image moderation builds an absolute URL for that route from `IMAGE_ORIGIN`, so
  moderation does not expose private S3 URLs.

### Ownership

- Only the user who requested the upload URL can complete it
- Check: `image.created_by_id === currentUser.id`

## Files

### Services ([`backend/services/images/`](.))

- `create-upload-url.mts` - Generate presigned S3 URLs
- `complete-upload.mts` - Hash + dedup, then enqueue worker metadata extraction
- `cleanup-abandoned-uploads.mts` - Remove stale uploads
- `get.mts` - Fetch images by ID or hash
- `s3.mts` - S3 operations (upload, delete, get)
- `constants.mts` - Supported image formats
- `placements.mts` - Authoritative placement lookup and revision-fenced copyright availability changes

### API Routes ([`backend/api/v1/images/`](../../api/v1/images/))

- `POST /api/v1/images/upload-url` - Request presigned URL
- `POST /api/v1/images/:id/completions` - Finalize upload

### Job System

[`@queues/images`](../../queues/images/) (API-safe surface):

- `config.mts` - Queue name
- `queues.mts` - glide-mq queue instance
- `enqueues.mts` - `enqueueCleanupAbandonedUploads` and `enqueueExtractImageMetadata`
- `setup.mts` - Schedule hourly cleanup

[`@workers/images`](../../workers/images/) (worker-only; owns `sharp`):

- `processors/extract-metadata.mts` - Sharp metadata extraction processor
- `workers/images.mts` - Worker dispatching `cleanup-abandoned-uploads` and `extract-metadata`

### Database

- `backend/data-stores/psql/migrations/0040-00-00-images.sql` - Baseline image lifecycle columns and constraints
- `backend/data-stores/psql/migrations/0624-00-00-image-upload-staging.sql` - Staging-source columns and completed-image hash constraint
- `backend/data-stores/psql/migrations/0625-00-00-image-upload-staged-source-cleanup-index.sql` - Partial index for staged-source cleanup

## Testing

### Manual E2E Test

1. **Get upload URL:**

```bash
curl -X POST http://localhost:3000/api/v1/images/upload-url \
  -H "Cookie: dt=...; st=..." \
  -H "Content-Type: application/json" \
  -d '{"content_type": "image/jpeg", "content_length": 123456}'
```

2. **Upload to S3:**

```bash
curl -X PUT "<upload_url_from_step_1>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @test.jpg
```

3. **Complete upload:**

```bash
curl -X POST http://localhost:3000/api/v1/images/<image_id>/completions \
  -H "Cookie: dt=...; st=..."
```

4. **Test deduplication:**
   - Repeat steps 1-3 with the same image
   - Second complete should return the first image's ID

### Automated Tests

- Service completion and race coverage: [`complete-upload.success.test.mts`](__tests__/complete-upload.success.test.mts),
  [`complete-upload.races.test.mts`](__tests__/complete-upload.races.test.mts), and
  [`complete-upload.cleanup.test.mts`](__tests__/complete-upload.cleanup.test.mts)
- Cleanup and recovery coverage: [`cleanup-abandoned-uploads.test.mts`](cleanup-abandoned-uploads.test.mts)
  and [`cleanup-abandoned-uploads.concurrency.test.mts`](cleanup-abandoned-uploads.concurrency.test.mts)
- API route coverage: [`backend/api/v1/images/__tests__/index.test.mts`](../../api/v1/images/__tests__/index.test.mts)
- Worker metadata coverage: [`extract-metadata.test.mts`](../../workers/images/processors/extract-metadata.test.mts),
  [`extract-metadata.publication.test.mts`](../../workers/images/processors/__tests__/extract-metadata.publication.test.mts),
  and [`extract-metadata.cleanup.test.mts`](../../workers/images/processors/__tests__/extract-metadata.cleanup.test.mts)

## Monitoring

### Metrics to Watch

- Upload completion rate: `completed / (completed + failed + abandoned)`
- Time to complete: Duration between upload URL creation and completion
- Duplicate detection rate: How often duplicates are found
- Abandoned upload count: Images cleaned up by background job

### Key Queries

**Pending uploads:**

```sql
SELECT COUNT(*)
FROM images
WHERE upload_started_at IS NULL
  AND upload_completed_at IS NULL
  AND upload_failed_at IS NULL
  AND deleted_at IS NULL;
```

**Failed uploads:**

```sql
SELECT id, upload_error, created_at
FROM images
WHERE upload_failed_at IS NOT NULL
ORDER BY created_at DESC;
```

**Deduplication stats:**

```sql
SELECT COUNT(*) as total_images, COUNT(DISTINCT sha_256) as unique_images
FROM images WHERE deleted_at IS NULL;
```

## Future Improvements

1. **Progress tracking:** Add `upload_progress` column for resumable uploads
2. **Image transformations:** Generate thumbnails, WebP variants on upload
3. **Client-side hash:** Allow trusted clients to skip hash recalculation
4. **Multipart uploads:** Support files larger than 50MB
5. **Batch upload:** Upload multiple images in one request

## Related

- [backend/api/v1/images/README.md](../../api/v1/images/README.md)
- [backend/queues/images/README.md](../../queues/images/README.md)
