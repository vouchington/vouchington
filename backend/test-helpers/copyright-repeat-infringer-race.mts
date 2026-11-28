import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { afterPostgresTransactionQueryForTest } from './injected-postgres-transactions.mts'

/**
 * Hold the first transaction open immediately after `openReview` runs until a second connection
 * queues behind it on `copyright_repeat_infringer_account_states`, then let both commit.
 */
export async function raceConcurrentRepeatInfringerOpenReviewsForTest<Result>(
  accountId: string,
  first: () => Promise<Result>,
  second: () => Promise<Result>,
): Promise<{ first: Result; second: Result }> {
  let contender: Promise<Result> | undefined
  let restore: (() => void) | undefined
  restore = afterPostgresTransactionQueryForTest(
    '/* syncCopyrightRepeatInfringerIncidents:openReview */',
    values => values.some(value => Array.isArray(value) && value.includes(accountId)),
    async transaction => {
      restore?.()
      restore = undefined
      const { rows: pidRows } = await transaction<{ pid: number }>(sql`
        /* raceConcurrentRepeatInfringerOpenReviewsForTest:pid */
        SELECT pg_backend_pid() AS pid
      `)
      const firstPid = pidRows[0]?.pid
      if (firstPid === undefined) throw new Error('Expected backend pid for first openReview')
      let secondSettled = false
      contender = second().finally(() => {
        secondSettled = true
      })
      const deadline = performance.now() + 2_000
      while (performance.now() < deadline) {
        if (secondSettled) break
        const { rows } = await write<{ pid: number }>(sql`
          /* raceConcurrentRepeatInfringerOpenReviewsForTest:waitBlocked */
          SELECT waiting.pid
          FROM pg_stat_activity waiting
          WHERE waiting.wait_event_type = 'Lock'
            AND ${firstPid} = ANY(pg_blocking_pids(waiting.pid))
          LIMIT 1
        `)
        if (rows.length > 0) break
      }
    },
  )
  try {
    const firstResult = await first()
    if (!contender) throw new Error('First sync did not execute openReview')
    return { first: firstResult, second: await contender }
  } finally {
    restore?.()
    await contender?.catch(() => undefined)
  }
}
