import { ApiError } from '../error'

export function getImageUploadRetryAfterMs(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.status !== 429) return null
  const data = err.data
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const retryAfter = (data as { retry_after?: unknown }).retry_after
  return typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter * 1000 : null
}
