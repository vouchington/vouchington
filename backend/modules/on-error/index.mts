import Sentry from './sentry.mts'
import { isExpectedCrawlerOperationalError } from './expected-crawler-operational-error.mts'
import { getOptionalRequestClientInfo } from '@modules/request-client-info'
export { recordOffAllowlistEgress } from './egress-guardrail.mts'
export { recordOpenAiSpendCapBreach } from './openai-spend-cap-breach.mts'
export { recordSqsConsumerConfigMissing } from './sqs-consumer-config-missing.mts'
export { recordValkeySaturation } from './valkey-saturation.mts'
export { recordWorkerQueueTopologySkew } from './worker-queue-topology-skew.mts'

const messageIgnores = ['placeholder error ignore message']

const messageIgnoresRegex = new RegExp(messageIgnores.join('|'), 'i')

const errorCodesToIgnore: Record<string, boolean> = {
  ECONNRESET: true,
  EPIPE: true,
}

interface ExtendedError extends Error {
  code?: string
  status?: number
  statusCode?: number
  tags?: Record<string, string | number | boolean> | null
  extra?: Record<string, unknown> | null
}

// Log to console when Sentry is disabled (development, CI) but not in test mode
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

// Sentry SDK v11 instruments fetch and http natively and ignores OpenTelemetry's suppressTracing
// context key, so a request whose URL carries a credential must be suppressed in Sentry as well.
export const suppressSentryTracing = Sentry.suppressTracing

/**
 * Flush pending Sentry events. Call before process.exit() to avoid dropping errors
 * that were just captured (e.g. in an uncaughtException handler).
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  await Sentry.flush(timeoutMs)
}

export default function onError(err: Error) {
  if (!err) return
  if (!(err instanceof Error)) {
    throw new Error(`onError expects an Error instance, received: ${typeof err} with value: ${err}`)
  }
  if (messageIgnoresRegex.test(err.message)) return
  const extendedErr = err as ExtendedError
  if (extendedErr.code && errorCodesToIgnore[extendedErr.code]) return
  if (isExpectedCrawlerOperationalError(err)) return

  const status = extendedErr.status || extendedErr.statusCode || 500
  if (status < 500) return // ignore 4xxs

  // Check if error should be suppressed from logging (test errors, expected scenarios)
  if (extendedErr.tags && extendedErr.tags.suppressLogging === true) return

  const clientInfo = getOptionalRequestClientInfo()
  if (shouldLogToConsole()) {
    console.error(
      err,
      ...(clientInfo
        ? [
            {
              client: clientInfo.client,
              client_platform: clientInfo.platform,
              client_app_version: clientInfo.appVersion,
              ...(clientInfo.sdkVersion ? { client_sdk_version: clientInfo.sdkVersion } : {}),
              client_device_id: clientInfo.deviceId,
              client_ip_address: clientInfo.ipAddress,
              ...(clientInfo.requestId ? { request_id: clientInfo.requestId } : {}),
            },
          ]
        : []),
    )
  }

  const clientTags = clientInfo
    ? {
        client: clientInfo.client,
        client_platform: clientInfo.platform,
        client_app_version: clientInfo.appVersion,
        ...(clientInfo.sdkVersion ? { client_sdk_version: clientInfo.sdkVersion } : {}),
        ...(clientInfo.requestId ? { request_id: clientInfo.requestId } : {}),
      }
    : undefined
  const clientExtra = clientInfo
    ? { client_device_id: clientInfo.deviceId, client_ip_address: clientInfo.ipAddress }
    : undefined
  Sentry.captureException(err, {
    ...((clientTags || extendedErr.tags) && { tags: { ...clientTags, ...extendedErr.tags } }),
    ...((clientExtra || extendedErr.extra) && { extra: { ...clientExtra, ...extendedErr.extra } }),
  })
}
