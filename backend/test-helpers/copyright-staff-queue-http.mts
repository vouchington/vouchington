import { beginTransaction, writePool } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '../services/users/types.mts'
import sql from 'sql-template-strings'
import { copyrightStaffQueueKeysSql } from '../services/copyright-notices/read-models-staff-queue-sql.mts'
import { copyrightJurisdictionPolicyLockKey } from './copyright-jurisdiction-policy-lock.mts'
import { withApiRequestQueryOptions } from './api/server.mts'
import { readCopyrightStaffQueueWindow, type QueuePage } from './copyright-staff-queue-walk.mts'

/** One stable native queue snapshot, optional rolled-back policy reservation, and actual HTTP. */
export async function withCopyrightStaffQueueHttp<Result>(
  moderator: PrivateUser,
  policy: { approvalId: string; actor: PrivateUser } | undefined,
  run: (context: {
    query: TransactionQuery
    read: (
      ids: readonly string[],
      boost: boolean,
      limit: 1 | 100,
    ) => Promise<QueuePage & { observedIds: string[]; rawObservedIds: string[] }>
    rejectPriorCursor: (cursor: string) => Promise<void>
    assertInterleaving: (
      first: string,
      control: string,
      last: string,
      boost: boolean,
    ) => Promise<void>
  }) => Promise<Result>,
  now: Date,
): Promise<Result> {
  const client = await writePool.connect()
  const requiredControls = new Set<string>()
  const lockKey = policy ? copyrightJurisdictionPolicyLockKey('eu_dsa') : undefined
  let locked = false
  const releaseLock = async () => {
    if (!locked || !lockKey) return
    const { rows } = await client.query<{ unlocked: boolean }>(
      '/* unlockCopyrightQueueSnapshot */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
      [lockKey],
    )
    if (!rows[0]?.unlocked) throw new Error('Copyright snapshot session lock was not held')
    locked = false // stays set on failure so final cleanup retries, then discards the client
  }
  let discardClient = false
  let failed = false
  let primary: unknown
  let result: Result | undefined
  const failures: unknown[] = []
  try {
    if (lockKey) {
      await client.query(
        '/* lockCopyrightQueueSnapshot */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
        [lockKey],
      )
      locked = true
    }
    await using transaction = await beginTransaction({ client })
    try {
      await transaction(
        '/* withCopyrightStaffQueueHttp */ SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
      )
      if (policy) {
        await transaction(sql`/* withCopyrightStaffQueueHttp:reservePolicy */
        INSERT INTO copyright_jurisdiction_policy_withdrawals (
          copyright_jurisdiction_policy_approval_id, withdrawn_by_id
        )
        SELECT approval.id, ${policy.actor.id}
        FROM copyright_jurisdiction_policy_approvals approval
        WHERE approval.jurisdiction = 'eu_dsa' AND approval.id <> ${policy.approvalId}
          AND NOT EXISTS (
            SELECT 1 FROM copyright_jurisdiction_policy_withdrawals withdrawal
            WHERE withdrawal.copyright_jurisdiction_policy_approval_id = approval.id
          )`)
      }
      await releaseLock()
      result = await withApiRequestQueryOptions({ query: transaction, now }, async request => {
        await request.authenticateAs(moderator)
        return run({
          query: transaction,
          read: (ids, boost, limit) =>
            readCopyrightStaffQueueWindow({
              transaction,
              request,
              ids,
              controls: [...requiredControls],
              boost,
              limit,
              now,
            }),
          assertInterleaving: async (first, control, last, boost) => {
            const { rows } = await transaction<{ id: string }>(
              sql`/* assertCopyrightQueueInterleaving */`.append(
                copyrightStaffQueueKeysSql({ trustedFlaggerBoost: boost, now }),
              )
                .append(sql` SELECT id FROM queue_key WHERE id = ANY(${[first, control, last]}::uuid[])
              ORDER BY tier, waiting_since, id LIMIT 3`),
            )
            if (rows.map(row => row.id).join(',') !== [first, control, last].join(',')) {
              throw new Error('Eligible control does not interleave in the real native queue')
            }
            // Every later walk must observe this explicit readable interleaving fixture.
            requiredControls.add(control)
          },
          rejectPriorCursor: async cursor => {
            await request
              .get(`/api/v1/copyright-notices/review-queue?after=${encodeURIComponent(cursor)}`)
              .expect(400)
          },
        })
      })
    } catch (err) {
      failed = true
      primary = err
    } finally {
      // The listener closes/drains before rollback; the lock is already released unless setup failed.
      try {
        await transaction.rollback()
      } catch (err) {
        failures.push(err)
        discardClient = true
      }
    }
  } catch (err) {
    if (!failed) {
      failed = true
      primary = err
    } else failures.push(err)
    discardClient = true
  } finally {
    try {
      await releaseLock()
    } catch (err) {
      failures.push(err)
      discardClient = true
    }
    try {
      client.release(discardClient)
    } catch (err) {
      failures.push(err)
    }
  }
  if (failed && failures.length === 0) throw primary
  if (failed) failures.unshift(primary)
  if (failures.length) throw new AggregateError(failures, 'Copyright queue snapshot cleanup failed')
  return result as Result
}
