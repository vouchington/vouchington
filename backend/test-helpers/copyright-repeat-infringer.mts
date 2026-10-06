import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { pollUntilNotNull } from './polling.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

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
    await pollUntilNotNull(
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
      'both confirmation transactions to reach the author lock',
    )
    await transaction.commit()
  }
  const results = await outcomes
  for (const result of results) if (result.status === 'rejected') throw result.reason
}

export async function observeTestRepeatInfringerAuthorLock<Result, Observation>(input: {
  accountId: string
  operation: () => Promise<Result>
  observe: () => Promise<Observation>
}): Promise<{ result: Result; observation: Observation }> {
  let operation: Promise<Result>
  let observation: Observation
  {
    await using transaction = await beginTransaction()
    await transaction(sql`/* observeTestRepeatInfringerAuthorLock:authorLock */
      SELECT pg_advisory_xact_lock(hashtextextended(${`author:${input.accountId.toLowerCase()}`}, 0))
    `)
    const pid = await getTestPostgresBackendProcessId(transaction)
    operation = input.operation()
    await waitForTestPostgresLockWaiter(pid, 'lockPostPublicationScope')
    observation = await input.observe()
    await transaction.commit()
  }
  return { result: await operation, observation }
}

export async function raceTestRepeatInfringerAuthorLock(input: {
  accountId: string
  operations: Array<() => Promise<unknown>>
}): Promise<PromiseSettledResult<unknown>[]> {
  let outcomes: Promise<PromiseSettledResult<unknown>[]>
  {
    await using transaction = await beginTransaction()
    await transaction(sql`/* raceTestRepeatInfringerAuthorLock:authorLock */
      SELECT pg_advisory_xact_lock(hashtextextended(${`author:${input.accountId.toLowerCase()}`}, 0))
    `)
    const pid = await getTestPostgresBackendProcessId(transaction)
    const started: Array<Promise<unknown>> = []
    for (const operation of input.operations) {
      started.push(operation())
      await pollUntilNotNull(
        async () => {
          const { rows } = await read<{ count: number }>(sql`
            /* raceTestRepeatInfringerAuthorLock:waiters */
            SELECT count(*)::integer AS count FROM pg_stat_activity
            WHERE ${pid} = ANY(pg_blocking_pids(pid))
              AND query LIKE '%lockPostPublicationScope%'
          `)
          return rows[0]?.count === started.length ? true : null
        },
        5_000,
        10,
        'the operations to reach the author lifecycle lock',
      )
    }
    outcomes = Promise.allSettled(started)
    await transaction.commit()
  }
  return outcomes
}

export async function readTestRepeatInfringerEnforcementState(input: {
  accountId: string
  reviewId: string
}): Promise<{ outcome: string | null; suspended: boolean }> {
  const { rows } = await write<{ outcome: string | null; suspended: boolean }>(sql`
    /* readTestRepeatInfringerEnforcementState */
    SELECT review.outcome,
      EXISTS (
        SELECT 1 FROM user_suspensions suspension
        WHERE suspension.user_id = ${input.accountId} AND suspension.lifted_at IS NULL
      ) AS suspended
    FROM copyright_repeat_infringer_reviews review
    WHERE review.id = ${input.reviewId}
  `)
  const state = rows[0]
  if (!state) throw new Error('Repeat-infringer review disappeared')
  return state
}
