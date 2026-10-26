// Sentry error monitoring for the Cloudflare Worker edge router.
// Uses withSentry() for per-request initialization and automatic flushing.
// Disabled unless the shared fail-closed deployed-environment gate allowlists
// ENVIRONMENT, so dev, CI, and test environments are always silent.
//
// Unexpected failures that return a response instead of throwing must call
// captureWorkerException() themselves. Origin fetch 502s and cache-purge RPC
// failures do. Expected edge responses (geo-blocks, rate limits, WebSocket
// rejections, cache-purge auth and validation failures) do not.

import { captureException, type CloudflareOptions } from '@sentry/cloudflare'
import { createVouchaSentryInitOptions } from '@ts-shared/utils/sentry-init-options'
import type { BotTier } from './bot-tier.mts'
import type { Env } from './types.mts'

// Called by withSentry() on each request to build initialization options.
// Disabled unless ENVIRONMENT is an allowlisted deployed environment
// (staging/production).
export function createSentryOptions(env: Env): CloudflareOptions {
  return createVouchaSentryInitOptions({
    dsn: env.SENTRY_DSN,
    environment: env.ENVIRONMENT,
    release: env.GIT_COMMIT ?? undefined,
    tracesSampleRate: 0.1,
  })
}

export interface WorkerExceptionTags {
  routeTarget?: string
  botTier?: BotTier | null
  countryCode?: string | null
  requestId?: string
}

// Capture an unexpected worker exception. Filters out expected non-5xx errors
// (e.g. an error object with .status < 500) to match the backend onError pattern.
// `extra` is diagnostic context and must omit credentials, headers, cookies, and bodies.
export function captureWorkerException(
  error: unknown,
  tags: WorkerExceptionTags = {},
  extra?: Readonly<Record<string, unknown>>,
): void {
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
  // Backend and web search this correlation id as request_id.
  if (tags.requestId) filteredTags.request_id = tags.requestId

  captureException(
    error,
    extra === undefined ? { tags: filteredTags } : { tags: filteredTags, extra },
  )
}
