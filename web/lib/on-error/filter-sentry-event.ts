import type { ErrorEvent, EventHint } from '@sentry/nextjs'
import { isExpectedApiError } from '@/lib/api/error'

export function filterSentryEvent(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  if (isExpectedApiError(hint?.originalException)) return null
  return event
}
