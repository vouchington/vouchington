import * as Sentry from '@sentry/nextjs'
import { toast } from 'sonner'
import { ApiError, isExpectedApiError } from '@/lib/api/error'
import { getApiErrorMessage } from '@/lib/api/error-helpers'
import { getRateLimitMessage, isRateLimitError } from '@/lib/api/rate-limit-error'

export interface OnErrorOptions {
  fallback: string
  tags?: Record<string, string>
  extra?: Record<string, unknown>
  skipSentry?: boolean
}

export default function onError(err: unknown, options: OnErrorOptions): string {
  const { fallback, tags, extra, skipSentry } = options
  let message: string
  if (isRateLimitError(err)) {
    message = getRateLimitMessage(err)
  } else if (err instanceof ApiError) {
    message = getApiErrorMessage(err, fallback)
  } else {
    message = fallback
  }
  toast.error(message)
  if (!skipSentry && !isExpectedApiError(err)) {
    const captured = err instanceof Error ? err : new Error(fallback)
    const captureExtra = err instanceof Error ? extra : { ...extra, originalValue: err }
    Sentry.captureException(captured, {
      ...(tags && { tags }),
      ...(captureExtra && Object.keys(captureExtra).length > 0 && { extra: captureExtra }),
    })
  }
  return message
}
