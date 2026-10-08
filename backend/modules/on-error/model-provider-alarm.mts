import Sentry from './sentry.mts'

// Log to console when Sentry is disabled (development, CI) but not in test mode.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

const throttleMs = 60 * 60 * 1000
const lastReportedAt = new Map<string, number>()

/**
 * A model provider needs an operator, and a retry will not fix it:
 * - `client-unavailable`: neither of the provider's credentials is set.
 * - `credit-balance-too-low`: Anthropic's included credits ran out. Recovery is switching the
 *   affected services to `openai` in `ai-model-routing`; there is no automatic fallback.
 * - `provider-rejected`: the provider permanently rejected the request (a rejected key, a
 *   permission problem, a malformed request).
 */
export type ModelProviderAlarmContext = {
  kind: 'client-unavailable' | 'credit-balance-too-low' | 'provider-rejected'
  /** The service (ledger agent slug) whose call failed. */
  service: string
  provider: 'anthropic' | 'openai'
  status?: number | undefined
}

/**
 * Record that a model provider needs an operator. One fixed message and a per-kind, per-provider
 * fingerprint group every failing service into one Sentry issue; the service and status stay in
 * `extra`. Reporting is throttled to once per hour per kind and provider, since every job of every
 * service fails the same way until the operator acts. Never carries a key, a prompt or a provider
 * message.
 */
export function recordModelProviderAlarm(context: ModelProviderAlarmContext): void {
  if (shouldLogToConsole()) {
    console.warn('[model-providers] provider alarm', context)
  }
  const { kind, provider, service, status } = context
  if (!shouldCapture(`${kind}:${provider}`)) return
  Sentry.captureMessage('model_provider_alarm', {
    level: 'error',
    fingerprint: ['model_provider_alarm', kind, provider],
    tags: { reason: 'model_provider_alarm', alarm_kind: kind, provider },
    extra: { service, status },
  })
}

function shouldCapture(key: string): boolean {
  if (process.env.NODE_ENV === 'test') return true
  const now = Date.now()
  const last = lastReportedAt.get(key)
  if (last !== undefined && now - last < throttleMs) return false
  lastReportedAt.set(key, now)
  return true
}
