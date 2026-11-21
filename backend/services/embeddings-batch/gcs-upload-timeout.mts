const BASE_UPLOAD_TIMEOUT_MS = 120_000
const BYTES_PER_SECOND = 1024 * 1024
const MAX_UPLOAD_TIMEOUT_MS = 30 * 60_000

export function gcsUploadTimeoutMs(byteSize: number): number {
  if (!Number.isSafeInteger(byteSize) || byteSize < 0)
    throw new RangeError('GCS upload size must be a non-negative safe integer')

  const transferTimeoutMs = Math.ceil(byteSize / BYTES_PER_SECOND) * 1000
  return Math.min(BASE_UPLOAD_TIMEOUT_MS + transferTimeoutMs, MAX_UPLOAD_TIMEOUT_MS)
}
