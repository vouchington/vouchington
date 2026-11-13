import { beginTransaction, read } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import type { PrivateUser } from '../services/users/types.mts'
import sql from 'sql-template-strings'
import { receiveTerritorialCopyrightNoticeInTransaction } from '../services/copyright-notices/territorial-notice-receipt.mts'

export async function readOwnedPolicyWithdrawals(approvalId: string) {
  const { rows } = await read<{ id: string }>(sql`
    /* readOwnedPolicyWithdrawals */
    SELECT id FROM copyright_jurisdiction_policy_withdrawals
    WHERE copyright_jurisdiction_policy_approval_id = ${approvalId}
  `)
  return rows
}

export async function readOwnedPolicyApprovals(policyVersion: string) {
  const { rows } = await read<{ id: string }>(sql`
    /* readOwnedPolicyApprovals */
    SELECT id FROM copyright_jurisdiction_policy_approvals
    WHERE jurisdiction = 'eu_dsa' AND policy_version = ${policyVersion}
  `)
  return rows
}

/** The actual receipt guard, restricted to this fixture's approval cohort. */
export async function receiveOwnedCopyrightPolicyReceipt(
  claimant: PrivateUser,
  approvalId: string,
  afterApprovalRead?: () => Promise<void>,
) {
  await using transaction = await beginTransaction()
  let observed = false
  const query = new Proxy(transaction, {
    apply(target, thisArgument, args: Parameters<QueryExecutor>) {
      const [statement] = args
      const text = typeof statement === 'string' ? statement : statement.text
      const result: ReturnType<QueryExecutor> = Reflect.apply(target, thisArgument, args)
      if (
        !afterApprovalRead ||
        observed ||
        !text.includes('/* currentCopyrightJurisdictionPolicy */')
      )
        return result
      return result.then(async value => {
        if (value.rows.length !== 1 || value.rows[0]?.id !== approvalId)
          throw new Error('Owned approval admission checkpoint did not select its approval')
        observed = true
        await afterApprovalRead()
        return value
      })
    },
  })
  const suffix = crypto.randomUUID()
  const receipt = await receiveTerritorialCopyrightNoticeInTransaction(
    { user: claimant, identity: `user:${claimant.id}` },
    'eu_dsa',
    suffix,
    {
      notifierName: `Notifier ${suffix}`,
      notifierEmail: `notifier-${suffix}@example.test`,
      goodFaithStatement: true,
      contact: `Contact ${suffix}`,
      contentDescription: `Work ${suffix}`,
      grounds: `Grounds ${suffix}`,
      hostedUseUrl: `https://example.test/${suffix}`,
    },
    query,
    [approvalId],
  )
  if (afterApprovalRead && !observed) throw new Error('Owned approval checkpoint was not reached')
  await transaction.commit()
  return receipt
}

export async function readOwnedCopyrightPolicyReceipt(noticeId: string) {
  const { rows } = await read<{ approval_id: string }>(sql`
    /* readOwnedCopyrightPolicyReceipt */
    SELECT copyright_jurisdiction_policy_approval_id AS approval_id
    FROM copyright_territorial_notice_receipts WHERE copyright_notice_id = ${noticeId}`)
  return rows
}
