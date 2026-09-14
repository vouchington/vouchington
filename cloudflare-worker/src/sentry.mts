// Sentry error monitoring for the Cloudflare Worker edge router.
// Uses withSentry() for per-request initialization and automatic flushing.
// Disabled unless the shared fail-closed deployed-environment gate allowlists
// ENVIRONMENT, so dev, CI, and test environments are always silent.
//
// Only captures origin fetch errors (502s) — expected edge responses
// (geo-blocks, rate limits, WebSocket rejections) are returned via edgeErrorResponse()
// and never throw, so they never reach captureWorkerException().

import { captureException, type CloudflareOptions } from '@sentry/cloudflare'
import { resolveSentryDsnEnablement } from '@ts-shared/utils/sentry-deployment-gate'
import {
  composeSentryBeforeSend,
  scrubSentryEvent,
  scrubSpanAttributes,
} from '@ts-shared/utils/sentry-event-scrubbing'
import type { BotTier } from './bot-tier.mts'
import type { Env } from './types.mts'

type SentrySpan = Parameters<NonNullable<CloudflareOptions['beforeSendSpan']>>[0]
type SentryTransactionEvent = Parameters<NonNullable<CloudflareOptions['beforeSendTransaction']>>[0]
type SentryTransactionHint = Parameters<NonNullable<CloudflareOptions['beforeSendTransaction']>>[1]

// Called by withSentry() on each request to build initialization options.
// Disabled unless ENVIRONMENT is an allowlisted deployed environment
// (staging/production). The Worker has no local OTel path, so otelEnabled is
// always false here.
export function createSentryOptions(env: Env): CloudflareOptions {
  const { enabled, environment, sentryDsn } = resolveSentryDsnEnablement({
    dsn: env.SENTRY_DSN,
    environment: env.ENVIRONMENT,
    otelEnabled: false,
  })
  return {
    dsn: sentryDsn?.dsn,
    environment: environment ?? 'development',
    release: env.GIT_COMMIT ?? undefined,
    enabled,
    tracesSampleRate: 0.1,
    beforeSend: composeSentryBeforeSend(),
    // Scrub request URLs and credentials from errors, transactions, and spans.
    beforeSendSpan: scrubSentrySpan,
    beforeSendTransaction: scrubSentryTransaction,
  }
}

export function scrubSentrySpan(span: SentrySpan): SentrySpan {
  const data = scrubSpanAttributes(span.data)
  return data === span.data ? span : { ...span, data }
}

export function scrubSentryTransaction(
  event: SentryTransactionEvent,
  _hint: SentryTransactionHint,
): SentryTransactionEvent {
  return scrubSentryEvent(event)
}

export interface WorkerExceptionTags {
  routeTarget?: string
  botTier?: BotTier | null
  countryCode?: string | null
  requestId?: string
}

// Capture an unexpected worker exception. Filters out expected non-5xx errors
// (e.g. an error object with .status < 500) to match the backend onError pattern.
export function captureWorkerException(error: unknown, tags: WorkerExceptionTags = {}): void {
  if (error !== null && typeof error === 'object') {
    const extendedErr = error as Record<string, unknown>
    const status =
      typeof extendedErr.status === 'number'
        ? extendedErr.status
        : typeof extendedErr.statusCode === 'number'
          ? extendedErr.statusCode
          : null
    if (status !== null && status < 500) return
  }

  const filteredTags: Record<string, string> = {}
  if (tags.routeTarget) filteredTags.routeTarget = tags.routeTarget
  if (tags.botTier) filteredTags.botTier = tags.botTier
  if (tags.countryCode) filteredTags.countryCode = tags.countryCode
  if (tags.requestId) filteredTags.requestId = tags.requestId

  captureException(error, { tags: filteredTags })
}
