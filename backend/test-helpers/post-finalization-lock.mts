import { writePool } from '@data-stores/psql'
import type { PoolClient } from '@data-stores/psql/types'

export async function acquireTestPostFinalizationLock(
  namespace: number,
  postId: string,
): Promise<{
  release(): Promise<void>
}> {
  const client = await writePool.connect()
  try {
    await client.query(
      '/* acquireTestPostFinalizationLock */ SELECT pg_advisory_lock($1, hashtext($2))',
      [namespace, postId],
    )
  } catch (error) {
    client.release(toError(error))
    throw error
  }
  let released = false
  return {
    async release(): Promise<void> {
      if (released) return
      released = true
      await releaseTestPostFinalizationLock(client, namespace, postId)
    },
  }
}

async function releaseTestPostFinalizationLock(
  client: PoolClient,
  namespace: number,
  postId: string,
): Promise<void> {
  try {
    const unlock = await client.query<{ unlocked: boolean }>(
      '/* releaseTestPostFinalizationLock */ SELECT pg_advisory_unlock($1, hashtext($2)) AS unlocked',
      [namespace, postId],
    )
    if (!unlock.rows[0]?.unlocked) {
      throw new Error('PostgreSQL did not release the post finalization lock')
    }
    client.release()
  } catch (error) {
    client.release(toError(error))
    throw error
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
