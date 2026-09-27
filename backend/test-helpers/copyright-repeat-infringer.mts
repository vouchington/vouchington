import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { pollUntilNotNull } from './polling.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

export async function readTestRepeatInfringerOpenReviewIds(accountId: string): Promise<string[]> {
  const { rows } = await read<{ id: string }>(sql`
    SELECT id FROM copyright_repeat_infringer_reviews
    WHERE account_user_id = ${accountId} AND outcome IS NULL
  `)
  return rows.map(row => row.id)
}

/** Holds the canonical author lock until both independent confirmation transactions reach sync. */
export async function confirmTestRepeatInfringerNoticesConcurrently(
  accountId: string,
  operations: Array<() => Promise<unknown>>,
): Promise<void> {
  let outcomes: Promise<PromiseSettledResult<unknown>[]>
  {
    await using transaction = await beginTransaction()
    await transaction(sql`/* confirmTestRepeatInfringerNoticesConcurrently:authorLock */
      SELECT pg_advisory_xact_lock(hashtextextended(${`author:${accountId.toLowerCase()}`}, 0))
    `)
    const pid = await getTestPostgresBackendProcessId(transaction)
    outcomes = Promise.allSettled(operations.map(operation => operation()))
    const blocked = await pollUntilNotNull(
      async () => {
        const { rows } = await read<{ count: number }>(sql`
        SELECT count(*)::integer AS count FROM pg_stat_activity
        WHERE ${pid} = ANY(pg_blocking_pids(pid))
          AND query LIKE '%lockPostPublicationScope%'
      `)
        return rows[0]?.count === operations.length ? true : null
      },
      5_000,
      10,
    )
    if (!blocked) throw new Error('Both confirmation transactions did not reach the author lock')
    await transaction.commit()
  }
  const results = await outcomes
  for (const result of results) if (result.status === 'rejected') throw result.reason
}
