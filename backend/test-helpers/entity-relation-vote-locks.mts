import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function holdTestEntityRelationVoteLock(
  userId: string,
  relationId: string,
): Promise<OwnedTransaction> {
  const transaction = await beginTransaction()
  try {
    await transaction(sql`/* holdEntityRelationVoteLock */
        SELECT pg_advisory_xact_lock(
          hashtextextended('relation__rss_feed_item__category__topic__votes:' || ${userId}::text || ':' || ${relationId}::text, 0)
        )
      `)
    return transaction
  } catch (err) {
    try {
      await transaction[Symbol.asyncDispose]()
    } catch (err_) {
      throw new AggregateError([err, err_], 'Entity relation vote lock setup failed', {
        cause: err_,
      })
    }
    throw err
  }
}
