import {
  composeBeforeSend,
  type ObservableEvent,
  scrubEvent,
  scrubRequestCredentialFields as scrubRequestCredentials,
  scrubSpanAttributes as scrubSpans,
  scrubSpanCredentialAttributes as scrubSpanCredentials,
} from '@vouchington/utils/observability'
import { redactObservabilityUrl } from './observability-scrubbing.mts'

const CREDENTIAL_HEADER_NAMES: readonly string[] = Object.freeze([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'cf-access-jwt-assertion',
  'x-cf-worker-secret',
  'x-bedrock-batch-shared-key',
  'x-voucha-cache-purge-secret',
  'x-app-attest-assertion',
  'x-app-attest-nonce',
  'x-app-attest-challenge-id',
  'stripe-signature',
  'signature',
  'copyright-guest-capability',
  'idempotency-key',
  'cookie',
])

const SENTRY_SCRUB_OPTIONS = {
  credentialHeaders: CREDENTIAL_HEADER_NAMES,
  redactUrl: redactObservabilityUrl,
  dropRequestBody: true,
} as const

export function scrubSpanCredentialAttributes<T extends Record<string, unknown>>(data: T): T {
  return scrubSpanCredentials(data, CREDENTIAL_HEADER_NAMES)
}
export function scrubSpanAttributes<T extends Record<string, unknown>>(data: T): T {
  return scrubSpans(data, SENTRY_SCRUB_OPTIONS)
}
export function scrubRequestCredentialFields<T extends object>(
  request: T | undefined,
): T | undefined {
  return scrubRequestCredentials(request, CREDENTIAL_HEADER_NAMES)
}
export interface SentryEventLike {
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>
  request?: object
}
export function scrubSentryEvent<T extends SentryEventLike>(event: T): T {
  return scrubEvent(event as T & ObservableEvent, SENTRY_SCRUB_OPTIONS)
}
type BeforeSend<T, H> = (event: T, hint: H) => T | null | PromiseLike<T | null>
export function composeSentryBeforeSend<T extends SentryEventLike, H>(
  beforeSend?: BeforeSend<T, H>,
  finalScrubber: (event: T) => T = scrubSentryEvent,
): BeforeSend<T, H> {
  const composed = composeBeforeSend<T & ObservableEvent, H>(
    beforeSend as BeforeSend<T & ObservableEvent, H> | undefined,
    event => finalScrubber(event) as T & ObservableEvent,
  )
  return (event, hint) => composed(event as T & ObservableEvent, hint)
}
