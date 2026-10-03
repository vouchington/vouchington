import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  concealJurisdictionPolicyApprovals,
  insertJurisdictionPolicyApproval,
  insertJurisdictionPolicyWithdrawal,
  readCopyrightTerritorialContractShape,
  withRolledBackTerritorialTransaction,
} from '@voucha/test-helpers/data-stores/psql/copyright-eu-uk-contracts'
import {
  acknowledgeUkCopyrightNotice,
  recordUkCopyrightAcknowledgmentFailure,
} from './uk-acknowledgment.mts'
import {
  receiveUkCopyrightNotice,
  receiveUkCopyrightNoticeInTransaction,
} from './uk-notice-receipt.mts'
import { recordUkCopyrightRedressDecision, submitUkCopyrightRedress } from './uk-redress.mts'
import { recordUkCopyrightReview } from './uk-review.mts'
import { recordCopyrightJurisdictionPolicyApproval } from './jurisdiction-policy.mts'
import type { TerritorialNoticeRequest } from './territorial-fields.mts'

function noticeRequest(): TerritorialNoticeRequest {
  const suffix = crypto.randomUUID()
  return {
    contact: `claimant-${suffix}@example.test`,
    contentDescription: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hostedUseUrl: `https://example.test/${suffix}`,
  }
}

describe('UK copyright notice contracts', () => {
  it('fails closed without an approved policy and after that approval is withdrawn', async () => {
    const claimant = await createTestUser()
    await withRolledBackTerritorialTransaction(async transaction => {
      await concealJurisdictionPolicyApprovals(transaction, 'uk', claimant.id)
      await expect(
        receiveUkCopyrightNoticeInTransaction(
          claimant,
          crypto.randomUUID(),
          noticeRequest(),
          transaction,
        ),
      ).rejects.toMatchObject({ status: 403, message: 'UK copyright notices are not available' })
      const approvalId = await insertJurisdictionPolicyApproval(
        transaction,
        'uk',
        `uk-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
        claimant.id,
      )
      const opened = await receiveUkCopyrightNoticeInTransaction(
        claimant,
        crypto.randomUUID(),
        noticeRequest(),
        transaction,
      )
      expect(opened.route_destination).toBe('staff_queue')
      await insertJurisdictionPolicyWithdrawal(transaction, approvalId, claimant.id)
      await expect(
        receiveUkCopyrightNoticeInTransaction(
          claimant,
          crypto.randomUUID(),
          noticeRequest(),
          transaction,
        ),
      ).rejects.toMatchObject({ status: 403, message: 'UK copyright notices are not available' })
    })
  })

  it('records receipt, human review, and redress without EU rows or a US clock', async () => {
    const [claimant, staff, administrator, stranger] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'uk',
      policyVersion: `uk-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    const receipt = await receiveUkCopyrightNotice(claimant, crypto.randomUUID(), noticeRequest())
    const acknowledgment = await acknowledgeUkCopyrightNotice(claimant, receipt.notice_id)
    expect(receipt.route_destination).toBe('staff_queue')
    expect(acknowledgment.acknowledged_at).toBeInstanceOf(Date)
    expect(acknowledgment.escalated).toBe(false)
    await expect(
      recordUkCopyrightReview(stranger, receipt.notice_id, 'Not staff'),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      submitUkCopyrightRedress(claimant, receipt.notice_id, crypto.randomUUID(), 'Too soon'),
    ).rejects.toMatchObject({ status: 404 })
    const review = await recordUkCopyrightReview(staff, receipt.notice_id, 'Staff review rationale')
    expect(review.automation_disclosure).toBe('human')
    const redress = await submitUkCopyrightRedress(
      claimant,
      receipt.notice_id,
      crypto.randomUUID(),
      'Please review this notice',
    )
    const decision = await recordUkCopyrightRedressDecision(staff, receipt.notice_id, redress.id, {
      disposition: 'maintain',
      rationale: 'Staff kept the recorded review',
    })
    expect(decision.staff_disposition).toBe('maintain')
    const failing = await receiveUkCopyrightNotice(claimant, crypto.randomUUID(), noticeRequest())
    await recordUkCopyrightAcknowledgmentFailure(staff, failing.notice_id)
    await recordUkCopyrightAcknowledgmentFailure(staff, failing.notice_id)
    await recordUkCopyrightAcknowledgmentFailure(staff, failing.notice_id)
    await recordUkCopyrightAcknowledgmentFailure(staff, failing.notice_id)
    const exhausted = await recordUkCopyrightAcknowledgmentFailure(staff, failing.notice_id)
    expect(exhausted.escalated).toBe(true)
    await expect(readCopyrightTerritorialContractShape(receipt.notice_id)).resolves.toMatchObject({
      jurisdiction: 'uk',
      accepted_at: null,
      provisional_withholding_at: null,
      deadline_count: 0,
      target_count: 0,
      lifecycle_event_count: 0,
      eu_receipt_count: 0,
      eu_statement_count: 0,
      uk_receipt_count: 1,
      uk_review_count: 1,
    })
  })
})
