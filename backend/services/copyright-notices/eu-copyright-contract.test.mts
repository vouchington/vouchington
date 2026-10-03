import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  concealJurisdictionPolicyApprovals,
  insertJurisdictionPolicyApproval,
  insertJurisdictionPolicyWithdrawal,
  readCopyrightTerritorialContractShape,
  withRolledBackTerritorialTransaction,
} from '@voucha/test-helpers/data-stores/psql/copyright-eu-uk-contracts'
import { createCopyrightFormIntake } from './index.mts'
import {
  acknowledgeEuCopyrightNotice,
  recordEuCopyrightAcknowledgmentFailure,
} from './eu-acknowledgment.mts'
import {
  receiveEuCopyrightNotice,
  receiveEuCopyrightNoticeInTransaction,
} from './eu-notice-receipt.mts'
import { recordEuCopyrightStatementOfReasons } from './eu-reasons.mts'
import { recordEuCopyrightRedressDecision, submitEuCopyrightRedress } from './eu-redress.mts'
import { compileEuCopyrightTransparencyReport } from './eu-reporting.mts'
import { recordEuCopyrightSupervisedComplaint } from './eu-supervised-complaint.mts'
import {
  recordCopyrightJurisdictionPolicyApproval,
  withdrawCopyrightJurisdictionPolicyApproval,
} from './jurisdiction-policy.mts'
import type { TerritorialNoticeRequest } from './territorial-fields.mts'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'

function noticeRequest(): TerritorialNoticeRequest {
  const suffix = crypto.randomUUID()
  return {
    contact: `claimant-${suffix}@example.test`,
    contentDescription: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hostedUseUrl: `https://example.test/${suffix}`,
  }
}

async function euActors() {
  const [claimant, staff, administrator, stranger] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
    createTestUser(),
  ])
  const approval = await recordCopyrightJurisdictionPolicyApproval(administrator, {
    jurisdiction: 'eu_dsa',
    policyVersion: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
  })
  return { claimant, staff, administrator, stranger, approval }
}

describe('EU copyright notice contracts', () => {
  it('fails closed without an approved policy and keeps the US aggregate on us_dmca', async () => {
    const claimant = await createTestUser()
    await withRolledBackTerritorialTransaction(async transaction => {
      await concealJurisdictionPolicyApprovals(transaction, 'eu_dsa', claimant.id)
      await expect(
        receiveEuCopyrightNoticeInTransaction(
          claimant,
          crypto.randomUUID(),
          noticeRequest(),
          transaction,
        ),
      ).rejects.toMatchObject({ status: 403, message: 'EU copyright notices are not available' })
      const approvalId = await insertJurisdictionPolicyApproval(
        transaction,
        'eu_dsa',
        `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
        claimant.id,
      )
      const opened = await receiveEuCopyrightNoticeInTransaction(
        claimant,
        crypto.randomUUID(),
        noticeRequest(),
        transaction,
      )
      expect(opened.route_destination).toBe('staff_queue')
      await insertJurisdictionPolicyWithdrawal(transaction, approvalId, claimant.id)
      await expect(
        receiveEuCopyrightNoticeInTransaction(
          claimant,
          crypto.randomUUID(),
          noticeRequest(),
          transaction,
        ),
      ).rejects.toMatchObject({ status: 403, message: 'EU copyright notices are not available' })
    })
    await expect(
      createCopyrightNoticeAggregate({
        jurisdiction: 'eu_dsa',
        receivedAt: new Date(),
        claimantUserId: claimant.id,
        claimantDisplayName: null,
        claimantContactCiphertext: 'ciphertext',
        workDescription: 'work',
        policyVersion: 'eu-test',
        targets: [],
        initialSubmission: { kind: 'notice', sourceKind: 'signed_in_form', bodyCiphertext: 'body' },
      }),
    ).rejects.toMatchObject({ status: 422, message: 'Only US DMCA notices use this aggregate' })
    await expect(
      createCopyrightFormIntake({
        currentUser: claimant,
        requesterIdentity: `user:${claimant.id}`,
        idempotencyKey: crypto.randomUUID(),
        request: {
          jurisdiction: 'eu_dsa',
          claimantDisplayName: null,
          claimantContact: 'contact',
          claimantEmail: 'claimant@example.test',
          workDescription: 'work',
          goodFaithBelief: true,
          accuracyAuthorityUnderPenaltyOfPerjury: true,
          electronicSignature: 'signed',
          claimantTargets: [],
        },
      }),
    ).rejects.toMatchObject({ status: 422, message: 'jurisdiction is required' })
  })

  it('records receipt, staff routing, and an acknowledgment without a US clock', async () => {
    const { claimant } = await euActors()
    const request = noticeRequest()
    const key = crypto.randomUUID()
    const receipt = await receiveEuCopyrightNotice(claimant, key, request)
    const acknowledgment = await acknowledgeEuCopyrightNotice(claimant, receipt.notice_id)
    const replay = await receiveEuCopyrightNotice(claimant, key, request)
    expect(receipt.route_destination).toBe('staff_queue')
    expect(receipt.is_duplicate).toBe(false)
    expect(replay).toMatchObject({ notice_id: receipt.notice_id, is_duplicate: true })
    expect(acknowledgment.acknowledged_at).toBeInstanceOf(Date)
    expect(acknowledgment.escalated).toBe(false)
    await expect(readCopyrightTerritorialContractShape(receipt.notice_id)).resolves.toMatchObject({
      jurisdiction: 'eu_dsa',
      accepted_at: null,
      provisional_withholding_at: null,
      deadline_count: 0,
      target_count: 0,
      lifecycle_event_count: 0,
      eu_receipt_count: 1,
      uk_receipt_count: 0,
      uk_review_count: 0,
    })
    await expect(
      receiveEuCopyrightNotice(claimant, key, { ...request, grounds: 'Different grounds' }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('escalates only after the fifth failed acknowledgment and not on a timer', async () => {
    const { claimant, staff, stranger } = await euActors()
    const receipt = await receiveEuCopyrightNotice(claimant, crypto.randomUUID(), noticeRequest())
    await expect(
      recordEuCopyrightAcknowledgmentFailure(stranger, receipt.notice_id),
    ).rejects.toMatchObject({ status: 403 })
    await recordEuCopyrightAcknowledgmentFailure(staff, receipt.notice_id)
    const open = await recordEuCopyrightAcknowledgmentFailure(staff, receipt.notice_id)
    expect(open.escalated).toBe(false)
    expect(open.exhausted_at).toBeNull()
    await recordEuCopyrightAcknowledgmentFailure(staff, receipt.notice_id)
    await recordEuCopyrightAcknowledgmentFailure(staff, receipt.notice_id)
    const exhausted = await recordEuCopyrightAcknowledgmentFailure(staff, receipt.notice_id)
    expect(exhausted).toMatchObject({ attempt_count: 5, escalated: true })
    expect(exhausted.exhausted_at).toBeInstanceOf(Date)
    await expect(
      recordEuCopyrightAcknowledgmentFailure(staff, receipt.notice_id),
    ).rejects.toMatchObject({ status: 409 })
    await expect(readCopyrightTerritorialContractShape(receipt.notice_id)).resolves.toMatchObject({
      deadline_count: 0,
      provisional_withholding_at: null,
    })
  })

  it('requires a staff statement before redress and reports only stored facts', async () => {
    const { claimant, staff, stranger } = await euActors()
    const periodStart = new Date(Date.now() - 60_000)
    const receipt = await receiveEuCopyrightNotice(claimant, crypto.randomUUID(), noticeRequest())
    await acknowledgeEuCopyrightNotice(claimant, receipt.notice_id)
    await expect(
      recordEuCopyrightStatementOfReasons(stranger, receipt.notice_id, 'Not a staff decision'),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      submitEuCopyrightRedress(claimant, receipt.notice_id, crypto.randomUUID(), 'Too soon'),
    ).rejects.toMatchObject({ status: 404 })
    const statement = await recordEuCopyrightStatementOfReasons(
      staff,
      receipt.notice_id,
      'Staff statement of reasons',
    )
    expect(statement.automation_disclosure).toBe('human')
    await expect(
      submitEuCopyrightRedress(stranger, receipt.notice_id, crypto.randomUUID(), 'Unrelated'),
    ).rejects.toMatchObject({ status: 403 })
    const redressKey = crypto.randomUUID()
    const redress = await submitEuCopyrightRedress(
      claimant,
      receipt.notice_id,
      redressKey,
      'Please review the restriction',
    )
    const decision = await recordEuCopyrightRedressDecision(staff, receipt.notice_id, redress.id, {
      disposition: 'revoke',
      rationale: 'Staff redress rationale',
    })
    expect(decision.staff_disposition).toBe('revoke')
    const complaint = await recordEuCopyrightSupervisedComplaint(claimant, receipt.notice_id, {
      authorityReference: `DSC-${crypto.randomUUID()}`,
      explanation: 'Complaint filed with the authority',
    })
    expect(complaint.escalation_id).toEqual(expect.any(String))
    const report = await compileEuCopyrightTransparencyReport(
      staff,
      periodStart,
      new Date(Date.now() + 60_000),
    )
    expect(report).toMatchObject({
      receipt_count: 1,
      statement_of_reasons_count: 1,
      redress_request_count: 1,
      redress_decision_count: 1,
      supervised_complaint_count: 1,
      escalation_count: 1,
    })
    await expect(readCopyrightTerritorialContractShape(receipt.notice_id)).resolves.toMatchObject({
      deadline_count: 0,
      target_count: 0,
      lifecycle_event_count: 0,
      eu_statement_count: 1,
      provisional_withholding_at: null,
    })
  })

  it('rejects a second withdrawal of the same policy approval', async () => {
    const { administrator, approval } = await euActors()
    await withdrawCopyrightJurisdictionPolicyApproval(administrator, approval.id)
    await expect(
      withdrawCopyrightJurisdictionPolicyApproval(administrator, approval.id),
    ).rejects.toMatchObject({ status: 409 })
  })
})
