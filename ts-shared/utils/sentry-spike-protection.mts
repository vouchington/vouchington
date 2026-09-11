/**
 * Client-side spike protection for Sentry `beforeSend`. Sentry project-level rate limiting is not
 * managed as code for this org, so nothing stops a single recurring error from consuming an
 * entire month's error quota by itself -- exactly what happened during the staging incident this
 * guards against (2711 events emitted by one recurring error over the incident window). Wraps a
 * `beforeSend`-shaped function so that once an identical error has been sent `limit` times within
 * `windowMs`, further occurrences of that same error are dropped (not sent to Sentry) until the
 * window elapses, at which point the counter resets and a few occurrences flow through again --
 * enough to keep the error visible without ever re-burning the full quota on it.
 *
 * Composes with `composeSentryBeforeSend` (./sentry-event-scrubbing.mts) rather than duplicating
 * its chaining logic -- wrap the OUTER composed pipeline so spike protection sees the final event
 * about to be sent:
 *
 *   beforeSend: withSpikeProtection(composeSentryBeforeSend(filterEvent))
 *
 * Deliberately scoped to the two backend/lambda Sentry init sites
 * (backend/modules/on-error/sentry.mts, lambdas/shared/sentry.mts) that emit the volume of
 * recurring server-side errors the incident involved, not all Sentry init sites in the repo.
 */

import { createSpikeWindowTracker, type SpikeWindowTracker } from '@vouchington/utils/observability'

export { createSpikeWindowTracker, type SpikeWindowTracker }

const DEFAULT_SPIKE_PROTECTION_LIMIT = 10
const DEFAULT_SPIKE_PROTECTION_WINDOW_MS = 5 * 60_000

export interface SpikeProtectableEvent {
  exception?: { values?: Array<{ type?: string; value?: string }> }
  message?: string
  fingerprint?: string[]
}

export interface WithSpikeProtectionOptions {
  limit?: number
  windowMs?: number
  now?: () => number
}

type BeforeSendResult<TEvent> = TEvent | null | PromiseLike<TEvent | null>
type BeforeSend<TEvent, THint> = (event: TEvent, hint: THint) => BeforeSendResult<TEvent>

export function withSpikeProtection<TEvent extends SpikeProtectableEvent, THint>(
  beforeSend: BeforeSend<TEvent, THint>,
  {
    limit = DEFAULT_SPIKE_PROTECTION_LIMIT,
    windowMs = DEFAULT_SPIKE_PROTECTION_WINDOW_MS,
    now = Date.now,
  }: WithSpikeProtectionOptions = {},
): BeforeSend<TEvent, THint> {
  const tracker = createSpikeWindowTracker(limit, windowMs)

  function admit(event: TEvent): TEvent | null {
    const fingerprint = fingerprintSpikeEvent(event)
    // No reliable identity to dedupe on -- never suppress, since bucketing unrelated errors
    // together under one counter would risk silently dropping genuinely distinct errors.
    if (fingerprint === null) return event

    return tracker.recordAndCheck(fingerprint, now()) ? event : null
  }

  return (event, hint) => {
    const result = beforeSend(event, hint)
    if (isPromiseLike<TEvent | null>(result)) {
      return result.then(nextEvent => (nextEvent === null ? null : admit(nextEvent)))
    }
    return result === null ? null : admit(result)
  }
}

function fingerprintSpikeEvent(event: SpikeProtectableEvent): string | null {
  if (event.fingerprint && event.fingerprint.length > 0) return event.fingerprint.join('\u0000')
  const exception = event.exception?.values?.[0]
  if (exception?.type || exception?.value) {
    return `${exception.type ?? ''}\u0000${exception.value ?? ''}`
  }
  if (event.message) return `message\u0000${event.message}`
  return null
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false
  return typeof (value as { then?: unknown }).then === 'function'
}
