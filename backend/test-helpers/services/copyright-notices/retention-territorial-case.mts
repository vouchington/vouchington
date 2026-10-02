import { randomUUID } from 'node:crypto'
import { receiveEuCopyrightNotice } from '../../../services/copyright-notices/eu-notice-receipt.mts'
import { recordCopyrightTerritorialPolicyApproval } from '../../../services/copyright-notices/territorial-policy.mts'
import { receiveUkCopyrightNotice } from '../../../services/copyright-notices/uk-notice-receipt.mts'
import { createTestUser } from '../../index.mts'

/**
 * An EU DSA or UK notice, received under a freshly approved territorial policy. Nothing in the
 * staff queue holds it open, so only its jurisdiction keeps it from the US DMCA retention sweep.
 */
export async function createRetentionTerritorialCase(jurisdiction: 'eu_dsa' | 'uk') {
  const [claimant, administrator] = await Promise.all([
    createTestUser(),
    createTestUser({ administrator: true }),
  ])
  await recordCopyrightTerritorialPolicyApproval(administrator, {
    jurisdiction,
    policyVersion: `${jurisdiction}-${randomUUID().replaceAll('-', '').slice(0, 12)}`,
  })
  const suffix = randomUUID()
  const receive = jurisdiction === 'eu_dsa' ? receiveEuCopyrightNotice : receiveUkCopyrightNotice
  const receipt = await receive(claimant, randomUUID(), {
    contact: `claimant-${suffix}@example.test`,
    contentDescription: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hostedUseUrl: `https://example.test/${suffix}`,
  })
  return { noticeId: receipt.notice_id }
}
