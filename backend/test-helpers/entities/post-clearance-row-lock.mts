import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getTestPostgresBackendProcessId } from '../postgres-lock-wait.mts'

/** Holds `FOR UPDATE` on a live `posts` row until released. */
export async function holdTestPostRowLock(postId: string): Promise<{
  holderProcessId: number
  release(): void
  completed: Promise<void>
}> {
  const inserted = Promise.withResolvers<number>()
  const decision = Promise.withResolvers<void>()
  const completed = (async () => {
    await using query = await beginTransaction()
    await query(sql`/* holdTestPostRowLock */
      SELECT id FROM posts WHERE id = ${postId} FOR UPDATE
    `)
    inserted.resolve(await getTestPostgresBackendProcessId(query))
    await decision.promise
    await query.commit()
  })()
  void completed.catch(inserted.reject)
  return {
    holderProcessId: await inserted.promise,
    release: () => decision.resolve(),
    completed,
  }
}
