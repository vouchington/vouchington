import { captureException } from '@sentry/nextjs'
import { captureError } from '@vouchington/sentry/browser'
import { toast } from 'sonner'
import { ApiError, isExpectedApiError, getApiErrorMessage } from '@vouchington/api-client'
import { getRateLimitMessage, isRateLimitError } from '@/lib/api/rate-limit-error'

export interface OnErrorOptions {
  fallback: string
  /** Replaces server prose for known API error codes while preserving expected-error handling. */
  displayMessageByCode?: Readonly<Record<string, string>>
  tags?: Record<string, string>
  extra?: Record<string, unknown>
  skipSentry?: boolean
}

export default function onError(err: unknown, options: OnErrorOptions): string {
  const { fallback, displayMessageByCode, tags, extra, skipSentry } = options
  let message: string
  if (isRateLimitError(err)) {
    message = getRateLimitMessage(err)
  } else if (err instanceof ApiError) {
    message =
      (err.code === undefined ? undefined : displayMessageByCode?.[err.code]) ??
      getApiErrorMessage(err, fallback)
  } else {
    message = fallback
  }
  toast.error(message)
  if (!skipSentry) {
    captureError({ captureException }, err, {
      fallbackMessage: fallback,
      tags,
      extra,
      isExpected: isExpectedApiError,
    })
  }
  return message
}
