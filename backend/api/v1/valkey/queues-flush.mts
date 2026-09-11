import {
  closeAndUnregisterGlideMQInstance,
  createQueue,
  workerQueueCommandClient,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import onError from '@modules/on-error'
import { allLiveWorkerQueueNames } from '@modules/worker-queue-inventory'
import pMap from 'p-map'

const SCAN_COUNT = 500
const OBLITERATE_CONCURRENCY = 8

/**
 * GlideMQ dead-letter queue support was removed (no queue configures `deadLetterQueue` anymore),
 * so these names have no live producer or consumer. The list is retained here — and only here —
 * so `flushQueues()` can still clean up any `glide:{name}:*` keys a DLQ wrote before removal;
 * removal is not retroactive to keys already in Valkey.
 */
const LEGACY_DEAD_LETTER_QUEUE_NAMES = [
  'account-data-requests-dlq',
  'activitypub-delivery-dlq',
  'admin-imports-dlq',
  'bluesky-follow-propagation-dlq',
  'emails-dlq',
  'entity-listeners-dlq',
  'follower-distributions-dlq',
  'memberships-dlq',
  'notifications-dlq',
] as const

type UsageScanCursor = Awaited<ReturnType<typeof workerQueueCommandClient.scan>>[0]

/**
 * Every queue name this instance's `queues` flush touches: every policy-managed or universal live
 * worker queue plus each legacy DLQ retained only to clean up pre-removal orphaned keys.
 */
export function getQueueFlushTargetNames(): string[] {
  return [...allLiveWorkerQueueNames(), ...LEGACY_DEAD_LETTER_QUEUE_NAMES]
}

export function getQueueFlushTargetPrefixes(
  prefix: string | undefined = workerQueuePrefix,
): string[] {
  const namespace = prefix ?? 'glide'
  return [
    ...[...new Set(getQueueFlushTargetNames())].map(name => `${namespace}:{${name}}:`),
    `${namespace}:usage:`,
  ]
}

/**
 * Obliterates every live queue and every legacy DLQ (jobs, streams, scheduler state — all
 * queue-owned keys), then separately SCAN+UNLINKs `glide:usage:*` keys, since usage-tracking keys
 * are written by GlideMQ but aren't covered by any single queue's `obliterate()`.
 *
 * `Queue.obliterate()` reports no count, so `keysRemoved` stays `null` here even though real keys
 * are removed — matching the `null` convention `@services/valkey-admin/flush.mts` uses for other
 * mechanisms that don't report a count (`clearAllCaches`, `RateLimiter.invalidate`).
 * Every started obliteration settles before handle cleanup begins. Successfully closed temporary
 * handles unregister immediately; close failures remain registered for shutdown retry and fail the
 * flush, aggregated with an obliteration failure when both occur.
 */
export async function flushQueues(
  signal?: AbortSignal,
  client: typeof workerQueueCommandClient = workerQueueCommandClient,
): Promise<{ concern: 'queues'; keysRemoved: number | null }> {
  signal?.throwIfAborted()
  const targets = getQueueFlushTargetNames().map(name => createQueue(name))
  let obliterateError: Error | undefined

  try {
    await pMap(
      targets,
      async queue => {
        signal?.throwIfAborted()
        await queue.obliterate({ force: true })
        signal?.throwIfAborted()
      },
      { concurrency: OBLITERATE_CONCURRENCY, stopOnError: false },
    )
  } catch (error) {
    obliterateError =
      signal?.aborted &&
      error instanceof AggregateError &&
      error.errors.length > 0 &&
      error.errors.every(member => member === signal.reason)
        ? toError(signal.reason)
        : toError(error)
  }

  const closeResults = await Promise.allSettled(targets.map(closeAndUnregisterGlideMQInstance))
  const closeErrors = closeResults.flatMap(result =>
    result.status === 'rejected' ? [toError(result.reason)] : [],
  )
  if (obliterateError && !(signal?.aborted && obliterateError === signal.reason)) {
    onError(obliterateError)
  }
  if (closeErrors.length > 0) {
    throw new AggregateError(
      obliterateError ? [obliterateError, ...closeErrors] : closeErrors,
      'Queue flush handle cleanup failed',
    )
  }
  if (obliterateError) throw obliterateError

  signal?.throwIfAborted()
  try {
    await scanUnlinkUsageKeys(client, signal)
  } catch {
    signal?.throwIfAborted()
    // scanUnlinkUsageKeys() already reports failures via onError() internally (see below); treat
    // usage-key cleanup as best-effort bookkeeping so a transient Valkey error doesn't turn an
    // otherwise-successful queue obliteration into a failed flush.
  }

  return { concern: 'queues', keysRemoved: null }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export async function scanUnlinkUsageKeys(
  client: typeof workerQueueCommandClient = workerQueueCommandClient,
  signal?: AbortSignal,
): Promise<number> {
  signal?.throwIfAborted()
  try {
    let removed = 0
    let cursor: UsageScanCursor = '0'
    do {
      signal?.throwIfAborted()
      // oxlint-disable-next-line no-await-in-loop -- each SCAN advances this cursor before the next page can be requested
      const [nextCursor, keys] = await client.scan(cursor, {
        match: `${workerQueuePrefix ?? 'glide'}:usage:*`,
        count: SCAN_COUNT,
      })
      cursor = nextCursor
      signal?.throwIfAborted()
      // oxlint-disable-next-line no-await-in-loop -- unlinking this page must settle before requesting the next SCAN page
      if (keys.length > 0) removed += await client.unlink(keys)
      signal?.throwIfAborted()
    } while (cursor !== '0')
    return removed
  } catch (err) {
    if (signal?.aborted && err === signal.reason) throw err
    onError(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}
