import { writePool, type PoolClient } from '@data-stores/psql'

export type TestModerationTransparencyCohortLock = {
  release(): Promise<void>
}

/** Holds the exact source/release cohort advisory key in a dedicated session. */
export async function acquireTestModerationTransparencyCohortLock(options: {
  occurredAt: Date
  metric: string
  category: string
}): Promise<TestModerationTransparencyCohortLock> {
  const key = `moderation-transparency-rollup:${options.occurredAt.toISOString().slice(0, 10)}:global:${options.metric}:${options.category}`
  const client = await writePool.connect()
  try {
    await client.query(
      '/* acquireTestModerationTransparencyCohortLock */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
      [key],
    )
  } catch (error) {
    client.release(toError(error))
    throw error
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
