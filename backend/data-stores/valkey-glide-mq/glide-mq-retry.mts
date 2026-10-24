import { randomInt } from 'node:crypto'

import { isSaturationError, retrySaturationError, retryValkeyOperation } from 'valkyries'
import onError, { recordValkeySaturation } from '@modules/on-error'

// Only "Reached maximum inflight requests" is safe to retry for non-idempotent queues (e.g.
// emails, push notifications). That error is rejected client-side before the command is
// written to the network — the Valkey server never saw it, so no duplicate is possible.
// Other transient errors (connection closed, timeout) are ambiguous: the command may have
// already been executed, so retrying could create duplicate jobs.
// See docs/requirements/platform/JOB-REPLAYABILITY.md for the non-replayable queue list.
export function retryTransientEnqueue<T>(fn: () => Promise<T>): Promise<T> {
  return retryValkeyOperation(fn, {
    attempts: 3,
    delayMs: randomInt(800, 1_200),
    shouldRetry: isSaturationError,
  })
}

/**
 * Retry a worker-internal Valkey command (XADD, XREADGROUP, XACK, etc.) on inflight saturation,
 * so a saturated client delays a job instead of failing it. Connection and timeout errors are
 * ambiguous and are not retried. Each retry is recorded, and an exhausted retry is tagged and
 * reported before it is rethrown.
 */
export async function retryOnInflightSaturation<T>(
  fn: () => Promise<T>,
  context: { command: string; client: string },
): Promise<T> {
  let attempt = 0

  try {
    return await retrySaturationError(() => {
      if (attempt > 0) {
        recordValkeySaturation({ client: context.client, command: context.command, attempt })
      }
      attempt++
      return fn()
    })
  } catch (err: unknown) {
    // Non-saturation errors are rethrown immediately by the retry — pass through.
    if (!isSaturationError(err)) throw err

    // Saturation exhaustion: all retry attempts failed. Decorate and report.
    const localErr = err instanceof Error ? err : new Error(String(err))
    const decorated = localErr as typeof localErr & {
      tags?: Record<string, string | number | boolean>
      extra?: Record<string, unknown>
    }
    decorated.tags = {
      ...decorated.tags,
      reason: 'valkey_inflight_saturation',
      client: context.client,
      command: context.command,
    }
    decorated.extra = { ...decorated.extra, attempts: attempt }
    onError(decorated)
    throw decorated
  }
}
