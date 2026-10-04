import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import { writePool, type PoolClient } from '@data-stores/psql'

export type TestModerationTransparencyCohortLock = {
  release(): Promise<void>
}

/** Holds the exact source/release cohort advisory key in a dedicated session. */
export async function acquireTestModerationTransparencyCohortLock(options: {
  occurredAt: Date
  metric: FiniteValue<'moderation_transparency_metrics'>
  category: FiniteValue<'moderation_transparency_categories'>
}): Promise<TestModerationTransparencyCohortLock> {
  const key = `moderation-transparency-rollup:${options.occurredAt.toISOString().slice(0, 10)}:global:${options.metric}:${options.category}`
  const client = await writePool.connect()
  try {
    await client.query(
      '/* acquireTestModerationTransparencyCohortLock */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
      [key],
    )
  } catch (err) {
    client.release(toError(err))
    throw err
  }
  return createTestModerationTransparencyCohortLock(client, key)
}

function createTestModerationTransparencyCohortLock(
  client: PoolClient,
  key: string,
): TestModerationTransparencyCohortLock {
  let released = false
  return {
    async release(): Promise<void> {
      if (released) return
      released = true
      try {
        const { rows } = await client.query<{ unlocked: boolean }>(
          '/* releaseTestModerationTransparencyCohortLock */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [key],
        )
        if (!rows[0]?.unlocked) throw new Error('PostgreSQL did not release the cohort lock')
        client.release()
      } catch (err) {
        client.release(toError(err))
        throw err
      }
    },
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
