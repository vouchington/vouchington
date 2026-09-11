import { read, beginTransaction } from '@data-stores/psql'
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
    await query(sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended('entity_relation_votes:' || ${userId}::text || ':' || ${relationId}::text, 0)
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

export async function testCategorizerVoteLockHasWaiter(): Promise<boolean> {
  const { rows } = await read<{ waiting: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND query LIKE '%clearCategoriesForUnlinkedTopicAlias lock%'
        AND wait_event = 'advisory'
    ) AS waiting
  `)
  return rows[0]?.waiting ?? false
}
