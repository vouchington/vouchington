import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function holdTestEntityRelationVoteLock(
  userId: string,
  relationId: string,
): Promise<{ release: () => Promise<void> }> {
  const ready = Promise.withResolvers<void>()
  const releaseSignal = Promise.withResolvers<void>()
  const completion = holdEntityRelationVoteLock()

  async function holdEntityRelationVoteLock(): Promise<void> {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* holdEntityRelationVoteLock */
        SELECT pg_advisory_xact_lock(
          hashtextextended('relation__rss_feed_item__category__topic__votes:' || ${userId}::text || ':' || ${relationId}::text, 0)
        )
      `)
    ready.resolve()
    await releaseSignal.promise
    await transaction.commit()
  }
  void completion.catch(ready.reject)
  await ready.promise
  return {
    release: async () => {
      releaseSignal.resolve()
      await completion
    },
  }
}
