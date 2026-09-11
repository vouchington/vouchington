import { randomInt } from 'node:crypto'

import { retryValkeyOperation } from 'valkyries'
import onError, { recordValkeySaturation } from '@modules/on-error'

// Only "Reached maximum inflight requests" is safe to retry for non-idempotent queues (e.g.
// emails, push notifications). That error is rejected client-side before the command is
// written to the network — the Valkey server never saw it, so no duplicate is possible.
// Other transient errors (connection closed, timeout) are ambiguous: the command may have
// already been executed, so retrying could create duplicate jobs.
// See docs/requirements/platform/JOB-REPLAYABILITY.md for the non-replayable queue list.
function isInflightSaturationError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Reached maximum inflight requests')
}

export function retryTransientEnqueue<T>(fn: () => Promise<T>): Promise<T> {
  return retryValkeyOperation(fn, {
    attempts: 3,
    delayMs: randomInt(800, 1_200),
    shouldRetry: isInflightSaturationError,
  })
}

/**
 * Wrap a Valkey command with retry logic specific to inflight-saturation errors.
 * Used by the glide-mq command-client Proxy so all worker-internal Valkey commands
 * (XADD, XREADGROUP, XACK, etc.) retry instead of failing jobs immediately.
 *
 * ~5s jittered delay — long enough to let other in-flight commands drain before retrying.
 * Saturation-only shouldRetry — connection/timeout errors are ambiguous and are not retried here.
 */
export async function retryOnInflightSaturation<T>(
  fn: () => Promise<T>,
  context: { command: string; client: string },
): Promise<T> {
  const attempts = (() => {
    const parsed = parseInt(process.env.VALKEY_INFLIGHT_RETRY_ATTEMPTS ?? '', 10)
    return parsed > 0 ? parsed : 3
  })()

  let attempt = 0

  try {
    return await retryValkeyOperation(
      () => {
        if (attempt > 0) {
          recordValkeySaturation({ client: context.client, command: context.command, attempt })
        }
        attempt++
        return fn()
      },
      {
        attempts,
        delayMs: randomInt(4_500, 5_500),
        shouldRetry: isInflightSaturationError,
      },
    )
  } catch (error: unknown) {
    // Non-saturation errors are rethrown immediately by retryValkeyOperation — pass through.
    if (!isInflightSaturationError(error)) throw error

    // Saturation exhaustion: all retry attempts failed. Decorate and report.
    const err = error instanceof Error ? error : new Error(String(error))
    const decorated = err as typeof err & {
      tags?: Record<string, string | number | boolean>
      extra?: Record<string, unknown>
    }
    decorated.tags = {
      ...decorated.tags,
      reason: 'valkey_inflight_saturation',
      client: context.client,
      command: context.command,
    }
    decorated.extra = { ...decorated.extra, attempts }
    onError(decorated)
    throw decorated
  }
}
