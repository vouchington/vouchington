import { ApiError } from './error'

export function isRateLimitError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 429
}

export function getRateLimitMessage(error: ApiError): string {
  const data = error.data as Record<string, unknown> | null | undefined
  const retryAfter = data?.retry_after
  if (typeof retryAfter === 'number' && retryAfter > 0) {
    const unit = retryAfter === 1 ? 'second' : 'seconds'
    return `Too many requests. Please wait ${retryAfter} ${unit} and try again.`
  }
  return 'Too many requests. Please try again later.'
}
