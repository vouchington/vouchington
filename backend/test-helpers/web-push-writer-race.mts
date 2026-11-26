import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Queue the initiating writer on the old subscription before starting its competitor.
 * On the old lock order the competitor takes ownership first, then queues behind the
 * initiating writer. Releasing the fixture lock lets the initiating writer reach ownership.
 */
export async function runTestWebPushWriterRace<Initiator, Competitor>(
  subscription: { user_id: string; id: string },
  initiate: () => Promise<Initiator>,
  compete: () => Promise<Competitor>,
): Promise<[PromiseSettledResult<Initiator>, PromiseSettledResult<Competitor>]> {
  await using holder = await beginTransaction()
  const { rows } = await holder<{ pid: number }>(sql`
    /* runTestWebPushWriterRace.holdSubscription */
    SELECT pg_backend_pid() AS pid
    FROM web_push_subscriptions
    WHERE user_id = ${subscription.user_id} AND id = ${subscription.id} AND deleted_at IS NULL
    FOR NO KEY UPDATE`)
  const holderPid = rows[0]?.pid
  if (holderPid === undefined) throw new Error('Web Push race fixture has no active subscription')

  const initiator = Promise.allSettled([initiate()] as const)
  try {
    const initiatingPid = await waitForBlockedWriter([holderPid], initiator)
    const competitor = Promise.allSettled([compete()] as const)
    try {
      await waitForBlockedWriter([holderPid, initiatingPid], competitor, initiatingPid)
      await holder.commit()
      return [(await initiator)[0], (await competitor)[0]]
    } finally {
      await holder[Symbol.asyncDispose]()
      await competitor
    }
  } finally {
    await holder[Symbol.asyncDispose]()
    await initiator
  }
}

async function waitForBlockedWriter(
  blockers: number[],
  action: Promise<[PromiseSettledResult<unknown>]>,
  initiatingPid?: number,
): Promise<number> {
  let outcome: PromiseSettledResult<unknown> | undefined
  void action.then(([result]) => {
    outcome = result
  })
  const deadline = performance.now() + 1_000
  while (performance.now() < deadline) {
    if (outcome) break
    const { rows } = await write<{ pid: number }>(sql`
      /* waitForBlockedWebPushWriter */
      SELECT waiting.pid
      FROM pg_stat_activity waiting
      WHERE waiting.wait_event_type = 'Lock'
        AND waiting.pid IS DISTINCT FROM ${initiatingPid ?? null}::integer
        AND pg_blocking_pids(waiting.pid) && ${blockers}::integer[]
      LIMIT 1`)
    const pid = rows[0]?.pid
    if (pid !== undefined) return pid
  }
  if (outcome?.status === 'rejected') throw outcome.reason
  throw new Error('Web Push writer did not queue on the owned subscription')
}
