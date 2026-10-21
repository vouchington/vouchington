import { addAbortListener } from 'node:events'
import { acquireTestPostgresAdvisoryLock } from './postgres-advisory-lock.mts'
import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'

/** Writes a paused control row directly, without publishing the change to workers. */
export async function insertPausedQueueDomainControlForTest(domain: string): Promise<void> {
  await write(
    sql`/* insertPausedQueueDomainControlForTest */
      INSERT INTO queue_domain_controls (domain, paused_at) VALUES (${domain}, clock_timestamp())`,
  )
}

/** Removes the control rows a test created for its synthetic domains. */
export async function removeQueueDomainControlsForTest(domains: readonly string[]): Promise<void> {
  await write(
    sql`/* removeQueueDomainControlsForTest */
      DELETE FROM queue_domain_controls WHERE domain = ANY(${domains})`,
  )
}

/** Coordinate the actual global content pause control, independently of queue prefixes. */
export function acquireContentAnalysisTestReservation(mode: 'shared' | 'exclusive') {
  return acquireTestPostgresAdvisoryLock({
    namespace: 1_129_333_328,
    key: 1,
    mode,
    timeout: '4s',
  })
}

/** Abort observation, while preserving rejection for the caller and draining mutations separately. */
export function waitForQueueDomainTestResult<T>(operation: Promise<T>, signal: AbortSignal) {
  const cancelled = Promise.withResolvers<never>()
  const listener = addAbortListener(signal, () => cancelled.reject(signal.reason))
  const result = Promise.race([operation, cancelled.promise]).finally(() => {
    listener[Symbol.dispose]()
  })
  // A listener may reject while the caller is still awaiting its preceding enqueue.
  void result.catch(() => undefined)
  return result
}

/** Drain a late subscription before restoring its fixture configuration, even if close fails. */
export async function closeQueueDomainTestWatcher(
  pending: Promise<{ close(): Promise<void> }> | undefined,
  restoreConfig: (() => void) | undefined,
): Promise<void> {
  try {
    await (await pending)?.close()
  } finally {
    restoreConfig?.()
  }
}
