import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { readCopyrightLegalClockForTest } from '@voucha/test-helpers/services/copyright-notices/last-legal-activity-clock'
import { describe, expect, it } from 'vitest'
import { recordEuCopyrightSupervisedComplaint } from './eu-supervised-complaint.mts'
import { receiveEuCopyrightNotice } from './eu-notice-receipt.mts'
import { recordCopyrightJurisdictionPolicyApproval } from './jurisdiction-policy.mts'
import { lockCopyrightNoticeForLegalWrite } from './last-legal-activity.mts'
import { placeCopyrightCasePreservationHold } from './retention-review-closures.mts'

describe('legal-write lock order', () => {
  it('commits a decision path and a hold placement that race on one notice', async () => {
    const [claimant, staff, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
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

    // Both writers queue behind this transaction's notice lock, then run against each other.
    const gate = await beginTransaction()
    await lockCopyrightNoticeForLegalWrite(gate, receipt.notice_id)
    const decision = recordEuCopyrightSupervisedComplaint(claimant, receipt.notice_id, {
      idempotencyKey: crypto.randomUUID(),
      authorityReference: `DSC-${crypto.randomUUID()}`,
      explanation: 'Complaint filed with the authority',
    })
    const hold = placeCopyrightCasePreservationHold(staff, receipt.notice_id, 'court_request')
    await gate.commit()

    await expect(Promise.all([decision, hold])).resolves.toEqual([
      expect.objectContaining({ is_duplicate: false }),
      expect.objectContaining({ id: expect.any(String) }),
    ])
    expect((await readClock()).getTime()).toBeGreaterThan(before.getTime())
  })
})
