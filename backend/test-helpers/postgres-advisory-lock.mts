import { writePool, type PoolClient } from '@data-stores/psql'

export type TestPostgresAdvisoryLock = {
  release(): Promise<void>
}

export async function acquireTestPostgresAdvisoryLock({
  namespace,
  key,
  timeout,
  mode = 'exclusive',
}: {
  namespace: number
  key: number
  timeout: string
  mode?: 'shared' | 'exclusive'
}): Promise<TestPostgresAdvisoryLock> {
  const client = await writePool.connect()

  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', ['statement_timeout', timeout])
    await client.query(
      mode === 'shared'
        ? '/* acquireTestPostgresAdvisoryLock */ SELECT pg_advisory_lock_shared($1, $2)'
        : '/* acquireTestPostgresAdvisoryLock */ SELECT pg_advisory_lock($1, $2)',
      [namespace, key],
    )
    await client.query('COMMIT')
  } catch (err) {
    client.release(toError(err))
    throw err
  }

  return createTestPostgresAdvisoryLock(client, namespace, key, mode)
}

function createTestPostgresAdvisoryLock(
  client: PoolClient,
  namespace: number,
  key: number,
  mode: 'shared' | 'exclusive',
): TestPostgresAdvisoryLock {
  let released = false

  return {
    async release(): Promise<void> {
      if (released) return
      released = true

      try {
        const result = await client.query<{ unlocked: boolean }>(
          mode === 'shared'
            ? '/* releaseTestPostgresAdvisoryLock */ SELECT pg_advisory_unlock_shared($1, $2) AS unlocked'
            : '/* releaseTestPostgresAdvisoryLock */ SELECT pg_advisory_unlock($1, $2) AS unlocked',
          [namespace, key],
        )
        if (!result.rows[0]?.unlocked) {
          throw new Error('PostgreSQL did not release the test advisory lock')
        }
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
