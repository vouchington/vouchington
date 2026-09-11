import { MAX_INPUT_IMAGE_BYTES } from '../config.mts'
import { HttpOperationError } from '../errors.mts'
import { type FetchedImage, type TempImageFile, spoolImageToTempFile } from '../temp-file.mts'
import { fetchWithPinnedDns as defaultFetchWithPinnedDns } from './pinned-fetch.mts'

const VALID_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
])

// Some CDNs serve standard image formats under non-standard MIME aliases.
// Normalize these to canonical types before validating and before returning,
// so downstream (S3 cache metadata, response Content-Type) always sees canonical values.
const MIME_ALIASES = new Map([
  ['image/jpg', 'image/jpeg'],
  ['image/pjpeg', 'image/jpeg'],
  ['image/x-png', 'image/png'],
])

type FetchWithPinnedDns = typeof defaultFetchWithPinnedDns

export async function fetchImageFromUrl(
  url: string,
  timeoutMs: number = 30000,
  maxSizeBytes: number = MAX_INPUT_IMAGE_BYTES,
  dependencies: { fetchWithPinnedDns?: FetchWithPinnedDns } = {},
): Promise<FetchedImage> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new HttpOperationError('Invalid URL format', 400)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const fetchWithPinnedDns = dependencies.fetchWithPinnedDns ?? defaultFetchWithPinnedDns
    const response = await fetchWithPinnedDns(parsedUrl, controller.signal)

    if (!response.ok) {
      response.body?.cancel().catch(() => {})
      throw new HttpOperationError(
        `Failed to fetch image: HTTP ${response.status} ${response.statusText}`,
        response.status >= 400 && response.status < 500 ? response.status : 500,
      )
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const baseContentType = contentType.split(';')[0].trim().toLowerCase()
    const normalizedContentType = MIME_ALIASES.get(baseContentType) ?? baseContentType

    if (!VALID_IMAGE_TYPES.has(normalizedContentType)) {
      response.body?.cancel().catch(() => {})
      throw new HttpOperationError(`Invalid content type: ${contentType}. Expected an image.`, 415)
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength) {
      const size = Number.parseInt(contentLength, 10)
      if (size > maxSizeBytes) {
        response.body?.cancel().catch(() => {})
        throw new HttpOperationError(
          `Image too large: ${size} bytes exceeds maximum of ${maxSizeBytes} bytes`,
          413,
        )
      }
    }

    const file = await readBodyWithLimit(response.body, maxSizeBytes)
    clearTimeout(timeoutId)
    const etag = response.headers.get('etag') || ''

    return { file, etag, contentType: normalizedContentType }
  } catch (error: unknown) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpOperationError(`Request timeout after ${timeoutMs}ms`, 504)
    }

    if (error instanceof HttpOperationError) {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new HttpOperationError(`Failed to fetch image from URL: ${message}`, 500)
  }
}

async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxSizeBytes: number,
): Promise<TempImageFile> {
  if (!body) {
    throw new HttpOperationError('Response has no body', 500)
  }

  try {
    return await spoolImageToTempFile(
      body,
      maxSizeBytes,
      bytes =>
        new HttpOperationError(
          `Image too large: ${bytes} bytes exceeds maximum of ${maxSizeBytes} bytes`,
          413,
        ),
    )
  } catch (error: unknown) {
    body.cancel().catch(() => {})
    throw error
  }
}
