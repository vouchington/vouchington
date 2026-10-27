import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { acquireTestPostgresAdvisoryLock } from './postgres-advisory-lock.mts'

const LOCK_NAMESPACE = 1_447_904_068
const LOCK_KEY = 1
const LOCK_TIMEOUT = '60s'

async function resetClassifierRetentionCursors(): Promise<void> {
  await write(sql`/* resetClassifierRetentionCursorsForTest */
    UPDATE classifier_retention_cursors SET cursor_id = NULL, cursor_ordinal = NULL, cursor_child_id = NULL,
      cursor_classifier_id = NULL,
      cursor_prompt_version_id = NULL, sweep_start_key = NULL, sweep_end_key = NULL`)
}

/**
 * The retention cursors are one global row per sweep, so a test that stops mid-sweep (small
 * batchSize with maxBatches 1) would otherwise make a parallel test skip its rows. Serialize such
 * tests and leave every cursor at its start before and after.
 */
export async function withClassifierRetentionSweepLock<T>(fn: () => Promise<T>): Promise<T> {
  const lock = await acquireTestPostgresAdvisoryLock({
    namespace: LOCK_NAMESPACE,
    key: LOCK_KEY,
    timeout: LOCK_TIMEOUT,
  })
  try {
    await resetClassifierRetentionCursors()
    return await fn()
  } finally {
    try {
      await resetClassifierRetentionCursors()
    } finally {
      await lock.release()
    }
  }
}
