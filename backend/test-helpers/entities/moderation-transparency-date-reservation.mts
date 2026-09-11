import { writePool, type PoolClient } from '@data-stores/psql'

const TEST_MODERATION_TRANSPARENCY_NOW = new Date('2009-12-15T12:00:00.000Z')
const TEST_MODERATION_TRANSPARENCY_LOCK = 'moderation-transparency-global-test-window'
// Must stay below backend-data-stores' 30s testTimeout/hookTimeout (test-helpers/vitest-config/
// backend-data-projects.mts) so a contended wait fails the `pg_advisory_lock` statement itself —
// via Postgres statement_timeout, inside the still-awaited call — instead of outliving Vitest's
// own timeout. A wait that outlives Vitest's timeout can acquire the lock after the test has
// already been marked failed and moved on, orphaning a held lock with no release() ever wired up.
const TEST_MODERATION_TRANSPARENCY_LOCK_TIMEOUT = '15s'

export type TestModerationTransparencyDateReservation = {
  now: Date
  release(): Promise<void>
}

/**
 * Serializes tests of the global transparency projection and gives each one the same clean,
 * recyclable 37-month window. Released transparency rows are intentionally immutable, so
 * ordinary source cleanup cannot isolate exact aggregate assertions on a persistent test database.
 */
export async function acquireTestModerationTransparencyDateReservation(): Promise<TestModerationTransparencyDateReservation> {
  const client = await writePool.connect()
  try {
    await acquireTestModerationTransparencyLock(client)
    await clearTestModerationTransparencyWindow(client)
    return createReservation(client)
  } catch (error) {
    client.release(toError(error))
    throw error
  }
}

/** Proves mutual exclusion: fails to acquire the reservation's advisory lock from a second session. */
export async function isTestModerationTransparencyLockHeldByAnotherSession(): Promise<boolean> {
  const observer = await writePool.connect()
  try {
    const { rows } = await observer.query<{ acquired: boolean }>(
      '/* isTestModerationTransparencyLockHeldByAnotherSession */ SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
      [TEST_MODERATION_TRANSPARENCY_LOCK],
    )
    const acquired = rows[0]?.acquired === true
    if (acquired) {
      // The lock was free, so this observer session just took it itself — release it before
      // returning the connection to the pool, or the pooled session holds it indefinitely and
      // every later reservation attempt blocks on a lock nobody is actually using.
      await observer.query(
        '/* isTestModerationTransparencyLockHeldByAnotherSession release */ SELECT pg_advisory_unlock(hashtextextended($1, 0))',
        [TEST_MODERATION_TRANSPARENCY_LOCK],
      )
    }
    return !acquired
  } finally {
    observer.release()
  }
}

async function acquireTestModerationTransparencyLock(client: PoolClient): Promise<void> {
  await client.query('BEGIN')
  await client.query('SELECT set_config($1, $2, true)', [
    'statement_timeout',
    TEST_MODERATION_TRANSPARENCY_LOCK_TIMEOUT,
  ])
  try {
    await client.query(
      '/* acquireTestModerationTransparencyDateReservation */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
      [TEST_MODERATION_TRANSPARENCY_LOCK],
    )
    await client.query('COMMIT')
  } catch (error) {
    throw new Error(
      `Timed out reserving the moderation transparency test window after ${TEST_MODERATION_TRANSPARENCY_LOCK_TIMEOUT}`,
      { cause: error },
    )
  }
}

async function clearTestModerationTransparencyWindow(client: PoolClient): Promise<void> {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL session_replication_role = replica')
    await client.query(
      `/* clearTestReleasedModerationTransparencyWindow */
      DELETE FROM moderation_transparency_released_daily_rollups
      WHERE day >= (date_trunc('month', $1::timestamptz) - interval '36 months')::date
        AND day < (date_trunc('month', $1::timestamptz) + interval '1 month')::date`,
      [TEST_MODERATION_TRANSPARENCY_NOW],
    )
    await client.query(
      `/* clearTestPendingModerationTransparencyWindow */
      DELETE FROM moderation_transparency_daily_rollups
      WHERE day >= (date_trunc('month', $1::timestamptz) - interval '36 months')::date
        AND day < (date_trunc('month', $1::timestamptz) + interval '1 month')::date`,
      [TEST_MODERATION_TRANSPARENCY_NOW],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

function createReservation(client: PoolClient): TestModerationTransparencyDateReservation {
  let released = false
  return {
    now: new Date(TEST_MODERATION_TRANSPARENCY_NOW),
    async release(): Promise<void> {
      if (released) return
      released = true
      try {
        await clearTestModerationTransparencyWindow(client)
        const { rows } = await client.query<{ unlocked: boolean }>(
          '/* releaseTestModerationTransparencyDateReservation */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [TEST_MODERATION_TRANSPARENCY_LOCK],
        )
        if (!rows[0]?.unlocked) {
          throw new Error('PostgreSQL did not release the reserved test window')
        }
        client.release()
      } catch (error) {
        client.release(toError(error))
        throw error
      }
    },
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
