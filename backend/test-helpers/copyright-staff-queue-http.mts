import { beginTransaction, writePool } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '../services/users/types.mts'
import sql from 'sql-template-strings'
import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import { copyrightStaffQueueCursorScope } from '../services/copyright-notices/read-models-staff.mts'
import { copyrightStaffQueueKeysSql } from '../services/copyright-notices/read-models-staff-queue-sql.mts'
import { copyrightJurisdictionPolicyLockKey } from '../services/copyright-notices/jurisdiction-policy.mts'
import { withApiRequestQueryOptions } from './api/server.mts'
import { firstOwnedKey, suffixCount, nativeKeyPage } from './copyright-staff-queue-keys.mts'

type QueueCase = {
  id: string
  reasons: string[]
  waiting_since: string
  next_deadline: { escalation_at: string; restoration_deadline_at: string } | null
}
type QueuePage = {
  copyright_notices: QueueCase[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

/** One stable native queue snapshot, optional rolled-back policy reservation, and actual HTTP. */
export async function withCopyrightStaffQueueHttp<Result>(
  moderator: PrivateUser,
  policy: { approvalId: string; actor: PrivateUser } | undefined,
  run: (context: {
    query: TransactionQuery
    read: (ids: readonly string[], boost: boolean, limit: 1 | 100) => Promise<QueuePage>
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
  const lockKey = policy ? copyrightJurisdictionPolicyLockKey('eu_dsa') : undefined
  let locked = false
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
    // Acquire the session lock BEFORE the snapshot, on the SAME borrowed client.
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
      result = await withApiRequestQueryOptions({ query: transaction, now }, async request => {
        await request.authenticateAs(moderator)
        return run({
          query: transaction,
          read: async (ids, boost, limit) => {
            const key = await firstOwnedKey(transaction, ids, boost, now)
            let after = encodeScopedTierPreciseUuidCursor(
              key.before,
              key.tier,
              key.id,
              copyrightStaffQueueCursorScope,
            )
            const count = await suffixCount(transaction, key, boost, now)
            const owned: QueueCase[] = []
            const cursors = new Set<string>([after])
            const seenOwned = new Set<string>()
            // Count actual snapshot keys, including interleaving rows. No polling or foreign mutation.
            for (let remaining = count; remaining > 0; remaining -= limit) {
              const nativePage = await nativeKeyPage(transaction, after, boost, limit, now)
              const expectedHasNext = nativePage.length > limit
              const last = expectedHasNext ? nativePage[limit - 1] : undefined
              const expectedCursor = last
                ? encodeScopedTierPreciseUuidCursor(
                    last.timestamp,
                    last.tier,
                    last.id,
                    copyrightStaffQueueCursorScope,
                  )
                : null
              const response = await request
                .get(
                  `/api/v1/copyright-notices/review-queue?limit=${limit}&after=${encodeURIComponent(after)}`,
                )
                .expect(200)
              const page = response.body as QueuePage
              const endCursor = page.page_info.end_cursor
              if (
                page.page_info.has_next_page !== expectedHasNext ||
                endCursor !== expectedCursor
              ) {
                throw new Error('HTTP page metadata differs from the real native key page')
              }
              for (const item of page.copyright_notices.filter(item => ids.includes(item.id))) {
                if (seenOwned.has(item.id)) throw new Error('HTTP walk repeated an owned notice')
                seenOwned.add(item.id)
                owned.push(item)
              }
              if (!page.page_info.has_next_page) {
                if (remaining > limit)
                  throw new Error('HTTP queue ended before native snapshot suffix')
                if (endCursor !== null) throw new Error('Terminal HTTP page retained an end cursor')
                return { copyright_notices: owned, page_info: page.page_info }
              }
              const next = endCursor
              if (!next || cursors.has(next)) throw new Error('HTTP queue cursor did not advance')
              cursors.add(next)
              after = next
            }
            throw new Error('HTTP queue exceeded its native snapshot suffix')
          },
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
      // The listener closes/drains before rollback; preserve the lock through owned cleanup.
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
    if (locked && lockKey) {
      try {
        const { rows } = await client.query<{ unlocked: boolean }>(
          '/* unlockCopyrightQueueSnapshot */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [lockKey],
        )
        if (!rows[0]?.unlocked) {
          failures.push(new Error('Copyright snapshot session lock was not held'))
          discardClient = true
        }
      } catch (err) {
        failures.push(err)
        discardClient = true
      }
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
