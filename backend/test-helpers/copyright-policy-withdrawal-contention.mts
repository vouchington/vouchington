import { beginTransaction } from '@data-stores/psql'
import { read } from './fixture-executor.mts'
import type { QueryExecutor } from '@data-stores/psql/types'
import type { PrivateUser } from '../services/users/types.mts'
import sql from './fixture-sql.mts'
import { onTestFinished } from 'vitest'
import { withdrawCopyrightJurisdictionPolicyApproval } from '../services/copyright-notices/jurisdiction-policy.mts'

export async function readOwnedPolicyWithdrawals(approvalId: string) {
  const { rows } = await read<{ id: string }>(sql`
    /* readOwnedPolicyWithdrawals */
    SELECT id FROM copyright_jurisdiction_policy_withdrawals
    WHERE copyright_jurisdiction_policy_approval_id = ${approvalId}
  `)
  return rows
}

/** Real production lock, real FK insertion, then rollback before durable withdrawal commits. */
export async function exercisePolicyWithdrawalReservation(
  administrator: PrivateUser,
  approvalId: string,
) {
  await using withdrawalTransaction = await beginTransaction()
  await using reservation = await beginTransaction()
  const locked = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const insertIssued = Promise.withResolvers<void>()
  void locked.promise.catch(() => {})
  void insertIssued.promise.catch(() => {})
  const query = new Proxy(withdrawalTransaction, {
    apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
      const [input] = argumentsList
      const text = typeof input === 'string' ? input : input.text
      const pending: ReturnType<QueryExecutor> = Reflect.apply(target, thisArgument, argumentsList)
      if (text.includes('/* withdrawCopyrightJurisdictionPolicyApproval:lock */')) {
        return pending.then(async result => {
          locked.resolve()
          await resume.promise
          return result
        })
      }
      if (text.includes('/* withdrawCopyrightJurisdictionPolicyApproval */')) insertIssued.resolve()
      return pending
    },
  })
  const production = (async () => {
    const value = await withdrawCopyrightJurisdictionPolicyApproval(administrator, approvalId, {
      query,
    })
    await withdrawalTransaction.commit()
    return value
  })()
  void production.catch(err => {
    locked.reject(err)
    insertIssued.reject(err)
  })
  // Register before the contending statement. Release the gate before independent drains.
  let cleanupPromise: Promise<void> | undefined
  function cleanup() {
    return (cleanupPromise ??= (async () => {
      resume.resolve()
      const outcomes = await Promise.allSettled([production, reservation.rollback()])
      const errors: unknown[] = []
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') errors.push(outcome.reason)
      }
      if (errors.length)
        throw new AggregateError(errors, 'Withdrawal contention cleanup failed', {
          cause: errors[0],
        })
    })())
  }
  onTestFinished(cleanup)
  const errors: unknown[] = []
  let result:
    | {
        reserved: { id: string; approval_id: string }
        withdrawal: { id: string }
        rows: { id: string }[]
      }
    | undefined
  try {
    await locked.promise
    const { rows } = await reservation<{ id: string; approval_id: string }>(sql`
      /* reserveOwnedPolicyWithdrawal */
      INSERT INTO copyright_jurisdiction_policy_withdrawals (
        copyright_jurisdiction_policy_approval_id, withdrawn_by_id
      ) VALUES (${approvalId}, ${administrator.id})
      RETURNING id, copyright_jurisdiction_policy_approval_id AS approval_id
    `)
    const reserved = rows[0]
    if (!reserved) throw new Error('Native reservation returned no receipt')
    resume.resolve()
    await insertIssued.promise
    await reservation.rollback()
    const withdrawal = await production
    result = { reserved, withdrawal, rows: await readOwnedPolicyWithdrawals(approvalId) }
  } catch (err) {
    errors.push(err)
  } finally {
    try {
      await cleanup()
    } catch (err) {
      errors.push(err)
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, 'Withdrawal and cleanup failed', { cause: errors[0] })
  if (!result) throw new Error('Missing native withdrawal contention result')
  return result
}
