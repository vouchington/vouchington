import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightLegalClockForTest } from '@voucha/test-helpers/services/copyright-notices/last-legal-activity-clock'
import { describe, expect, it } from 'vitest'
import { recordEuCopyrightSupervisedComplaint } from './eu-supervised-complaint.mts'
import { receiveEuCopyrightNotice } from './eu-notice-receipt.mts'
import { recordCopyrightJurisdictionPolicyApproval } from './jurisdiction-policy.mts'

describe('committed legal activity', () => {
  it('advances the case clock after a supervised complaint commits', async () => {
    const [claimant, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'eu_dsa',
      policyVersion: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    const suffix = crypto.randomUUID()
    const receipt = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      {
        contact: `claimant-${suffix}@example.test`,
        contentDescription: `Work ${suffix}`,
        grounds: `Grounds ${suffix}`,
        hostedUseUrl: `https://example.test/${suffix}`,
        notifierName: `Notifier ${suffix}`,
        notifierEmail: `notifier-${suffix}@example.test`,
        goodFaithStatement: true,
      },
    )
    const readClock = () => readCopyrightLegalClockForTest(receipt.notice_id)
    const before = await readClock()

    const decision = await recordEuCopyrightSupervisedComplaint(claimant, receipt.notice_id, {
      idempotencyKey: crypto.randomUUID(),
      authorityReference: `DSC-${crypto.randomUUID()}`,
      explanation: 'Complaint filed with the authority',
    })
    expect(decision).toMatchObject({ is_duplicate: false })
    expect((await readClock()).getTime()).toBeGreaterThan(before.getTime())
  })
})
