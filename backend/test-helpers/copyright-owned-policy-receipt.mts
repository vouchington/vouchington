import { beginTransaction } from '@data-stores/psql'
import type { PrivateUser } from '../services/users/types.mts'
import { receiveTerritorialCopyrightNoticeInTransaction } from '../services/copyright-notices/territorial-notice-receipt.mts'
import { insertJurisdictionPolicyApproval } from './data-stores/psql/copyright-eu-uk-contracts.mts'

/** Commit a receipt against precisely its owned approval, without changing global policy state. */
export async function createTestEuNoticeWithOwnedApproval(
  administrator: PrivateUser,
  claimant: PrivateUser,
): Promise<{ approvalId: string; noticeId: string }> {
  await using transaction = await beginTransaction()
  const suffix = crypto.randomUUID()
  const approvalId = await insertJurisdictionPolicyApproval(
    transaction,
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
    transaction,
    [approvalId],
  )
  await transaction.commit()
  return { approvalId, noticeId: receipt.notice_id }
}
