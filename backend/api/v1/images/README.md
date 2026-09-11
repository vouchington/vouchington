# Image Upload API - User Flow

This document describes how clients use the image upload API to upload images directly to S3.

## Overview

The image upload flow uses presigned S3 URLs to allow clients to upload images directly to a
dedicated staging bucket, bypassing the server. The API verifies and promotes those bytes to the
private final-images bucket before workers consume them. This provides:

- **Better performance**: Images upload directly to S3 without going through the server
- **Lower costs**: Reduces server bandwidth and compute
- **Automatic deduplication**: Duplicate images are detected and removed

## User Flow

### 1. Request Upload URL

**Endpoint:** `POST /api/v1/images/upload-url`

**Authentication:** Required (user must be logged in)

**Request Body:**

```json
{
  "content_type": "image/jpeg",
  "content_length": 1234567
}
```

**Parameters:**

- `content_type` (required) - MIME type of the image
  - Supported formats: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/tiff`, `image/avif`, `image/heif`
- `content_length` (required) - File size in bytes
  - Maximum: 50MB (52,428,800 bytes)

**Success Response (201 Created):**

```json
{
  "image_id": "01936f8e-8b2a-7890-a456-123456789012",
  "upload_url": "https://s3.amazonaws.com/bucket/path?...",
  "content_type": "image/jpeg",
  "expires_at": "2024-03-15T10:30:00Z"
}
```

**Error Responses:**

- `400 Bad Request` - Invalid content type or file too large
- `401 Unauthorized` - Authentication required
- `415 Unsupported Media Type` - Request is not JSON

**What Happens:**

1. Server validates the image format and size
2. Normalizes the content type (removes charset, trims, lowercases)
3. Generates a unique image ID (UUIDv7)
4. Creates a staging-bucket presigned S3 URL (valid for 1 hour)
5. Creates a database record with status `pending`
6. Returns the upload URL, image ID, and **normalized content type**

**Important:** Always use the returned `content_type` when uploading to S3. The presigned URL signature is bound to this exact value, so using a different Content-Type header (even if equivalent) will cause the upload to fail.

### 2. Upload Image to S3

**Method:** `PUT` to the presigned URL from step 1

**Headers:**

- `Content-Type` - Must match the content type from step 1
- `Content-Length` - Must match the content length from step 1

**Body:** Binary image data

**Example (cURL):**

```bash
curl -X PUT "https://s3.amazonaws.com/bucket/path?..." \
  -H "Content-Type: image/jpeg" \
  -H "Content-Length: 1234567" \
  --data-binary @image.jpg
```

**Example (JavaScript):**

```javascript
const file = document.querySelector('input[type="file"]').files[0]

const response = await fetch(uploadUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': file.type,
    'Content-Length': file.size.toString(),
  },
  body: file,
})

if (!response.ok) {
  throw new Error('Upload failed')
}
```

**Success Response:** `200 OK` (from the staging S3 bucket)

**Important:**

- The presigned URL expires after 1 hour
- Upload must match the exact content type and length from step 1
- This request goes directly to the staging bucket, not to your server. The upload URL does not
  grant access to the final-images bucket.

### 3. Complete Upload

**Endpoint:** `POST /api/v1/images/:id/completions`

**Authentication:** Required (must be the same user who requested the upload URL)

**Path Parameters:**

- `id` - The `image_id` returned from step 1

**Request Body:** None

**Success Response (200 OK):**

```json
{
  "image": {
    "id": "01936f8e-8b2a-7890-a456-123456789012",
    "upload_status": "processing"
  }
}
```

**Error Responses:**

- `401 Unauthorized` - Authentication required
- `403 Forbidden` - User does not own this upload
- `404 Not Found` - Image not found
- `409 Conflict` - Upload is already being processed
- `400 Bad Request` - Image was previously flagged/deleted

**What Happens:**

1. Server validates user owns the upload
2. Uses `@vouchington/media` to stream and hash the staging S3 body once into a private temporary file
3. Applies Filaments' deleted/failed/active duplicate policy and transaction ordering locally
4. Returns only the client-facing image ID and upload status; the presigned PUT contract and product-owned signing policy remain unchanged
5. If duplicate exists:
   - Deletes the new staging object
   - Deletes new database record
   - Returns existing image with same hash
6. If unique:
   - Promotes the verified bytes to a SHA-256-keyed object in the final bucket, then persists the hash and final key while leaving status as `processing`
   - Enqueues `images:extract-metadata` worker job (sharp metadata + flips status to `complete`, then runs OpenAI moderation)

Clients should treat `upload_status: 'processing'` as non-terminal and poll `GET /api/v1/images/:id/upload-state` to learn when the upload is `ready` or has been `blocked` by moderation.

### 4. Poll Upload State

**Endpoint:** `GET /api/v1/images/:id/upload-state`

**Authentication:** Required (must be the image owner; otherwise returns 404 to avoid leaking IDs).

**Path Parameters:**

- `id` - The `image_id` returned from step 1

**Success Response (200 OK):**

```json
{
  "upload_state": {
    "id": "01936f8e-8b2a-7890-a456-123456789012",
    "upload_status": "complete",
    "upload_error": null,
    "ready": true,
    "blocked": false
  }
}
```

**Fields:**

- `upload_status` - Raw row state: `'pending' | 'processing' | 'complete' | 'failed'`
- `ready` - `true` once metadata extraction **and** OpenAI moderation have both completed without flagging the image (`upload_status === 'complete' && !blocked && openai_omni_moderation_created_at IS NOT NULL && openai_omni_moderation_flagged IS NOT TRUE`). Two brief windows exist: (1) after `upload_status` flips to `complete` (metadata done) but before the moderation worker runs, and (2) after moderation sets `flagged=true` but before `deleteImageById` sets `deleted_at`. Both windows correctly return `ready: false`. Clients must poll until `ready === true` or `blocked === true`.
- `blocked` - `true` when moderation has excluded the image: either soft-deleted (`deleted_at IS NOT NULL`) or flagged (`openai_omni_moderation_flagged = true`). Checking both closes the race window where `applyImageOpenAIModerationResults` writes `flagged=true` before `deleteImageById` runs — if the delete step fails or is interrupted, clients still receive a terminal `blocked` state rather than timing out
- `upload_error` - Set when `upload_status === 'failed'`

**Error Responses:**

- `401 Unauthorized` - Authentication required
- `404 Not Found` - Image does not exist OR the caller does not own it
- `422 Unprocessable Entity` - `id` is not a valid UUID

**Polling Guidance:**

- Poll every ~2 seconds after the completions call returns `processing`.
- Stop polling once `ready === true`, `blocked === true`, or `upload_status === 'failed'`.
- Apply a reasonable timeout (e.g. 60s) and an error budget (e.g. 3 consecutive 5xx) on the client.

## Complete Example

### JavaScript/TypeScript

```typescript
async function uploadImage(file: File): Promise<{ id: string }> {
  // Step 1: Request upload URL
  const urlResponse = await fetch('/api/v1/images/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      content_type: file.type,
      content_length: file.size,
    }),
  })

  if (!urlResponse.ok) {
    throw new Error('Failed to get upload URL')
  }

  // Response shape: { upload: { image_id, upload_url, content_type, expires_at } }
  const {
    upload: { image_id, upload_url, content_type },
  } = await urlResponse.json()

  // Step 2: Upload to S3
  const uploadResponse = await fetch(upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': content_type,
      'Content-Length': file.size.toString(),
    },
    body: file,
  })

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload to S3')
  }

  // Step 3: Notify the API — always poll upload-state afterwards to confirm moderation
  // finished, even on a dedupe-complete hit (the returned image may still be processing).
  const completeResponse = await fetch(`/api/v1/images/${image_id}/completions`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!completeResponse.ok) {
    throw new Error('Failed to complete upload')
  }

  const { image } = await completeResponse.json()

  // Step 4: Poll until the image is ready or moderation blocks it
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    const stateResponse = await fetch(`/api/v1/images/${image.id}/upload-state`, {
      credentials: 'include',
    })
    if (!stateResponse.ok) continue
    const { upload_state } = await stateResponse.json()
    if (upload_state.blocked) throw new Error('Image blocked by content moderation')
    if (upload_state.ready) return { id: upload_state.id }
    if (upload_state.upload_status === 'failed')
      throw new Error(upload_state.upload_error ?? 'Processing failed')
  }

  throw new Error('Image processing timed out')
}
```

### React Hook Example

```typescript
import { useState } from 'react'

function useImageUpload() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setUploading(true)
    setError(null)

    try {
      // Step 1: Get upload URL
      const urlRes = await fetch('/api/v1/images/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          content_type: file.type,
          content_length: file.size,
        }),
      })

      if (!urlRes.ok) throw new Error('Failed to get upload URL')
      // Response shape: { upload: { image_id, upload_url, content_type, expires_at } }
      const {
        upload: { image_id, upload_url, content_type },
      } = await urlRes.json()

      // Step 2: Upload to S3
      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': content_type,
          'Content-Length': file.size.toString(),
        },
        body: file,
      })

      if (!uploadRes.ok) throw new Error('Upload to S3 failed')

      // Step 3: Notify the API
      const completeRes = await fetch(`/api/v1/images/${image_id}/completions`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!completeRes.ok) throw new Error('Failed to complete upload')
      const { image } = await completeRes.json()

      // Step 4: Poll until ready or blocked (always poll — dedupe-complete may still be pre-moderation)
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        const stateRes = await fetch(`/api/v1/images/${image.id}/upload-state`, {
          credentials: 'include',
        })
        if (!stateRes.ok) continue
        const { upload_state } = await stateRes.json()
        if (upload_state.blocked) throw new Error('Image blocked by content moderation')
        if (upload_state.ready) return { id: upload_state.id }
      }
      throw new Error('Image processing timed out')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setError(message)
      throw err
    } finally {
      setUploading(false)
    }
  }

  return { upload, uploading, error }
}
```

## Error Handling

### Client-Side Validation

Before calling the API, validate:

```typescript
function validateImage(file: File): string | null {
  const supportedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/tiff',
    'image/avif',
    'image/heif',
  ]

  if (!supportedTypes.includes(file.type)) {
    return `Unsupported format: ${file.type}`
  }

  const maxSize = 50 * 1024 * 1024 // 50MB
  if (file.size > maxSize) {
    return 'Image too large (max 50MB)'
  }

  return null // Valid
}
```

### Retry Strategy

For production use, implement retries for transient failures:

```typescript
async function uploadWithRetry(file: File, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadImage(file)
    } catch (error) {
      if (attempt === maxRetries) throw error

      // Exponential backoff
      const delay = Math.min(1000 * 2 ** attempt, 10000)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}
```

## Important Notes

### Security

- Upload URLs expire after 1 hour
- Only the user who requested the URL can complete the upload
- URLs are single-use (cannot be reused)

### Deduplication

- Images are deduplicated by content hash (SHA-256)
- If you upload the same image twice, the second complete call returns the first image
- The duplicate S3 object is automatically deleted

### Cleanup

- Abandoned uploads (not completed within 24 hours) are automatically cleaned up
- Both the S3 object and database record are deleted

### Limitations

- Maximum file size: 50MB
- Presigned URL expires: 1 hour
- Supported formats: JPEG, PNG, WebP, GIF, TIFF, AVIF, HEIF

## Performance

| Endpoint                            | Round Trips | Caching | Notes                                                 |
| ----------------------------------- | ----------- | ------- | ----------------------------------------------------- |
| POST /api/v1/images/upload-url      | 2           | None    | Auth + S3 presign                                     |
| POST /api/v1/images/:id/completions | 4+          | None    | Auth, S3 download, hash, dedup, enqueue               |
| GET /api/v1/images/:id/upload-state | 1           | None    | Auth + single SELECT; designed to be polled every ~2s |

## Related

- **Service Implementation**: [../../services/images/README.md](../../../services/images/README.md)
- **API Routes**: [./index.mts](./index.mts)
- [backend/queues/images/README.md](../../../queues/images/README.md)
