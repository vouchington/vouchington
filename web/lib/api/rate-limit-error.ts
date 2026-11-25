import { type ApiError, isRateLimitError } from '@vouchington/api-client'

export function getRateLimitMessage(error: ApiError): string {
  const data = error.data as Record<string, unknown> | null | undefined
  const retryAfter = data?.retry_after
  if (typeof retryAfter === 'number' && retryAfter > 0) {
    const unit = retryAfter === 1 ? 'second' : 'seconds'
    return `Too many requests. Please wait ${retryAfter} ${unit} and try again.`
  }
  return 'Too many requests. Please try again later.'
}

/** The server already sent a code inside the minimum interval, so one is waiting in the inbox. */
export function isEmailCodeRecentlySentError(error: unknown): error is ApiError {
  return isRateLimitError(error) && error.code === 'email_code_recently_sent'
}
