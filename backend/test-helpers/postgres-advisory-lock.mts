import { writePool, type PoolClient } from '@data-stores/psql'

export type TestPostgresAdvisoryLock = {
  release(): Promise<void>
}

export async function acquireTestPostgresAdvisoryLock({
  namespace,
  key,
  timeout,
}: {
  namespace: number
  key: number
  timeout: string
}): Promise<TestPostgresAdvisoryLock> {
  const client = await writePool.connect()

  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', ['statement_timeout', timeout])
    await client.query('/* acquireTestPostgresAdvisoryLock */ SELECT pg_advisory_lock($1, $2)', [
      namespace,
      key,
    ])
    await client.query('COMMIT')
  } catch (error) {
    client.release(toError(error))
    throw error
  }

  return createTestPostgresAdvisoryLock(client, namespace, key)
}

function createTestPostgresAdvisoryLock(
  client: PoolClient,
  namespace: number,
  key: number,
): TestPostgresAdvisoryLock {
  let released = false

  return {
    async release(): Promise<void> {
      if (released) return
      released = true

      try {
        const result = await client.query<{ unlocked: boolean }>(
          '/* releaseTestPostgresAdvisoryLock */ SELECT pg_advisory_unlock($1, $2) AS unlocked',
          [namespace, key],
        )
        if (!result.rows[0]?.unlocked) {
          throw new Error('PostgreSQL did not release the test advisory lock')
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
