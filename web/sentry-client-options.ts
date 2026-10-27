import type * as Sentry from '@sentry/nextjs'
import { createVouchaSentryInitOptions } from '@ts-shared/utils/sentry-init-options'
import { isExpectedApiError } from '@vouchington/api-client'
import { withApiErrorRequestId } from './sentry-api-error-request-id'
import {
  getBrowserRuntimePublicConfig,
  getBrowserRuntimePublicConfigIfAvailable,
  RUNTIME_PUBLIC_CONFIG_READY_EVENT,
  type RuntimePublicConfig,
} from '@/lib/runtime-public-config'

export type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>

interface SentryClientInitDeps {
  getRuntimePublicConfig?: () => RuntimePublicConfig | undefined
}

interface RuntimePublicConfigEventTarget {
  addEventListener(type: string, listener: () => void, options: { once: true }): void
}

export function createSentryClientInitOptions(deps: SentryClientInitDeps = {}): SentryInitOptions {
  const runtimeConfig = (deps.getRuntimePublicConfig ?? getBrowserRuntimePublicConfig)() ?? {}

  return withApiErrorRequestId({
    ...createVouchaSentryInitOptions({
      dsn: runtimeConfig.sentryDsn,
      environment: runtimeConfig.environment,
      release: process.env.NEXT_PUBLIC_GIT_COMMIT,
      tracesSampleRate: 1,
      // Route Sentry events through the CF Worker tunnel to bypass ad-blockers.
      // The CF Worker intercepts POST /monitoring and forwards to Sentry directly.
      tunnel: '/monitoring',
      // Drop expected 4xx ApiError events: client errors are normal and not actionable.
      filter: { isExpected: isExpectedApiError },
    }),

    // Configure which URLs receive trace headers for distributed tracing.
    // Production API calls use relative URLs (same-origin through the CF Worker),
    // so Sentry attaches trace headers to them automatically — no production URLs needed here.
    tracePropagationTargets: ['localhost', /^http:\/\/localhost:2999/],

    // Enable debug mode in development
    debug: false,

    // Suppress common browser noise that is not actionable.
    ignoreErrors: [
      // Layout observers can fire during rapid resize; browser quirk, not a bug.
      /ResizeObserver loop/,
      // Next.js internal navigation signals (not real errors).
      'NEXT_NOT_FOUND',
      'NEXT_REDIRECT',
      // 401/403/404 ApiErrors serialized across the server-client boundary.
      /^NEXT_HTTP_ERROR_FALLBACK;(?:401|403|404)$/,
      // Other 4xx ApiErrors (400, 429, etc.) serialized across the boundary.
      // Matches both the legacy format and the status-bearing format EXPECTED_CLIENT_ERROR;{status}.
      /^EXPECTED_CLIENT_ERROR(?:;\d+)?$/,
      // Stale tabs loading old chunk URLs after a deployment.
      /Loading chunk [\d]+ failed/,
      /ChunkLoadError/,
      // Generic network errors from flaky connections or user offline.
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource',
      // User-initiated request cancellations.
      'AbortError',
    ],
  })
}

/** Initializes once the server-rendered runtime config bootstrap has executed. */
export function initializeSentryClient(
  init: (options: SentryInitOptions) => void,
  deps: SentryClientInitDeps = {},
  runtimeTarget: RuntimePublicConfigEventTarget | undefined = typeof window === 'undefined'
    ? undefined
    : window,
): void {
  if (runtimeTarget === undefined) return

  const getRuntimeConfig = deps.getRuntimePublicConfig ?? getBrowserRuntimePublicConfigIfAvailable

  const initialize = () =>
    init(
      createSentryClientInitOptions({
        ...deps,
        getRuntimePublicConfig: getRuntimeConfig,
      }),
    )
  if (getRuntimeConfig() !== undefined) {
    initialize()
    return
  }
  runtimeTarget.addEventListener(RUNTIME_PUBLIC_CONFIG_READY_EVENT, initialize, { once: true })
}
