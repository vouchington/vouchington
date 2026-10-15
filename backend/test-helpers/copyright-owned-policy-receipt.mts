import { beginTransaction, writePool, type PoolClient } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '../services/users/types.mts'
import { copyrightJurisdictionPolicyLockKey } from '../services/copyright-notices/jurisdiction-policy.mts'
import { receiveTerritorialCopyrightNoticeInTransaction } from '../services/copyright-notices/territorial-notice-receipt.mts'
import { onTestFinished } from 'vitest'
import { TEST_STATEMENT_TIMEOUT_MS } from './statement-timeout-constant.mts'
import { insertJurisdictionPolicyApproval } from './data-stores/psql/copyright-eu-uk-contracts.mts'

/** Bind a real receipt to this test's approval before any competing writer can replace it. */
export async function createTestEuNoticeWithOwnedApproval(
  administrator: PrivateUser,
  claimant: PrivateUser,
): Promise<{ approvalId: string; noticeId: string }> {
  let closing = false
  let preparation: Promise<{ approvalId: string; noticeId: string }> | undefined
  // Register before connect or any query. A timed-out caller still joins the complete preparation.
  onTestFinished(async () => {
    closing = true
    await preparation
  })
  const assertOpen = () => {
    if (closing) throw new Error('Owned EU receipt preparation is closing')
  }
  preparation = prepare()
  return preparation

  async function prepare(): Promise<{ approvalId: string; noticeId: string }> {
    let client: PoolClient | undefined
    let locked = false
    let failed = false
    let primary: unknown
    let priorTimeout: string | undefined
    let result: { approvalId: string; noticeId: string } | undefined
    const cleanupErrors: unknown[] = []
    const key = copyrightJurisdictionPolicyLockKey('eu_dsa')
    try {
      assertOpen()
      client = await writePool.connect()
      assertOpen()
      const { rows } = await client.query<{ statement_timeout: string }>('SHOW statement_timeout')
      priorTimeout = rows[0]?.statement_timeout
      if (priorTimeout === undefined) throw new Error('Owned EU receipt timeout was not returned')
      assertOpen()
      await client.query('/* ownedEuReceiptLockBudget */ SELECT set_config($1, $2, false)', [
        'statement_timeout',
        `${TEST_STATEMENT_TIMEOUT_MS}ms`,
      ])
      assertOpen()
      await client.query(
        '/* ownedEuReceiptFence */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
        [key],
      )
      locked = true
      assertOpen()
      // BEGIN must follow the session fence: approved_at uses the transaction's start time.
      await using transaction = await beginTransaction({ client })
      assertOpen()
      const query = new Proxy(transaction, {
        apply(target, thisArgument, argumentsList: Parameters<TransactionQuery>) {
          assertOpen()
          return Reflect.apply(target, thisArgument, argumentsList) as ReturnType<TransactionQuery>
        },
      })
      const suffix = crypto.randomUUID()
      const approvalId = await insertJurisdictionPolicyApproval(
        query,
        'eu_dsa',
        `eu-${suffix.replaceAll('-', '').slice(0, 12)}`,
        administrator.id,
      )
      const receipt = await receiveTerritorialCopyrightNoticeInTransaction(
        { user: claimant, identity: `user:${claimant.id}` },
        'eu_dsa',
        suffix,
        {
          contact: `claimant-${suffix}@example.test`,
          contentDescription: `Work ${suffix}`,
          grounds: `Grounds ${suffix}`,
          hostedUseUrl: `https://example.test/${suffix}`,
          notifierName: `Notifier ${suffix}`,
          notifierEmail: `notifier-${suffix}@example.test`,
          goodFaithStatement: true,
        },
        query,
      )
      assertOpen()
      await transaction.commit()
      result = { approvalId, noticeId: receipt.notice_id }
    } catch (err) {
      failed = true
      primary = err
    } finally {
      if (client) {
        if (locked) {
          try {
            const { rows } = await client.query<{ unlocked: boolean }>(
              '/* ownedEuReceiptUnfence */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
              [key],
            )
            if (!rows[0]?.unlocked)
              cleanupErrors.push(new Error('Owned EU receipt session fence was not held'))
          } catch (err) {
            cleanupErrors.push(err)
          }
        }
        if (priorTimeout !== undefined) {
          try {
            await client.query(
              '/* restoreOwnedEuReceiptBudget */ SELECT set_config($1, $2, false)',
              ['statement_timeout', priorTimeout],
            )
          } catch (err) {
            cleanupErrors.push(err)
          }
        }
        try {
          client.release(failed || cleanupErrors.length > 0)
        } catch (err) {
          cleanupErrors.push(err)
        }
      }
    }
    if (cleanupErrors.length)
      throw new AggregateError(cleanupErrors, 'Owned EU receipt cleanup failed', {
        cause: failed ? primary : cleanupErrors[0],
      })
    if (failed) throw primary
    if (!result) throw new Error('Owned EU receipt preparation returned no result')
    return result
  }
}
