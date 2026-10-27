import type * as Sentry from '@sentry/nextjs'
import { ApiError } from '@vouchington/api-client'

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>
type BeforeSend = NonNullable<SentryInitOptions['beforeSend']>
type SentryEvent = Parameters<BeforeSend>[0]
type SentryHint = Parameters<BeforeSend>[1]

// The edge assigns this id with crypto.randomUUID(). Other text in a response body is not a
// correlation key and must not reach Sentry.
const GATEWAY_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function gatewayRequestId(error: unknown): string | undefined {
  if (!(error instanceof ApiError) || error.requestId === undefined) return undefined
  return GATEWAY_REQUEST_ID.test(error.requestId) ? error.requestId : undefined
}

function tagApiErrorRequestId(event: SentryEvent, hint: SentryHint): SentryEvent {
  const requestId = gatewayRequestId(hint.originalException)
  if (!requestId) return event
  return { ...event, tags: { ...event.tags, request_id: requestId } }
}

/** Copy a gateway request id onto the event before the shared scrubber and 4xx filter run. */
export function withApiErrorRequestId(options: SentryInitOptions): SentryInitOptions {
  const beforeSend = options.beforeSend
  return {
    ...options,
    beforeSend(event, hint) {
      const tagged = tagApiErrorRequestId(event, hint)
      return beforeSend ? beforeSend(tagged, hint) : tagged
    },
  }
}
