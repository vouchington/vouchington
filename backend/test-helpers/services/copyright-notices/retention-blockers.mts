import { randomUUID } from 'node:crypto'
import {
  appendCopyrightLegalHoldAssessment,
  createCopyrightDeliveryIntent,
  createOutboundCopyrightCorrespondence,
  issueCopyrightGuestCapability,
  resolveCopyrightLegalHold,
  revokeCopyrightGuestCapability,
} from '../../../services/copyright-notices/index.mts'
import { insertEncryptedCopyrightHoldSubmission } from '../../data-stores/psql/copyright-hold-submission.mts'
import {
  cancelCopyrightDeadline,
  insertOpenCopyrightDeadline,
} from '../../data-stores/psql/copyright-review-target.mts'
import { sendAllCopyrightDeliveries } from './retention-deliveries.mts'
import { createRetentionMinimalCase, type MinimalRetentionCase } from './retention-minimal-case.mts'

const DAY_MS = 24 * 60 * 60 * 1000

/** A case something keeps open, one stored original it holds, and the step that ends that. */
export type RetentionBlockedCase = {
  noticeId: string
  evidenceKey: string
  release: () => Promise<void>
}

/** Builds a minimal case with one stored original and lets `block` open the blocker on it. */
export async function blockMinimalCase(
  block: (entry: MinimalRetentionCase) => Promise<() => Promise<unknown>>,
  options: { claimant?: boolean } = {},
): Promise<RetentionBlockedCase> {
  const entry = await createRetentionMinimalCase({ artifacts: 1, ...options })
  const end = await block(entry)
  return {
    noticeId: entry.noticeId,
    evidenceKey: entry.evidenceKeys[0]!,
    release: async () => {
      await end()
    },
  }
}

/** A court or CCB filing a moderator verified and nobody has resolved yet. */
export const createOpenLegalHoldCase = () =>
  blockMinimalCase(async entry => {
    const submissionId = await insertEncryptedCopyrightHoldSubmission(entry.noticeId)
    const hold = await appendCopyrightLegalHoldAssessment({
      currentUser: entry.moderator,
      submissionId,
      assessedAt: new Date(),
      fromOriginalClaimant: true,
      proceedingKind: 'ccb',
      ccbClaimKind: 'claim',
      commencedAt: new Date(),
      receivedByDesignatedAgentAt: new Date(),
      sameMaterial: true,
      targetIds: [entry.targetId],
      rationale: `Verified filing ${randomUUID()}.`,
    })
    return () =>
      resolveCopyrightLegalHold({
        currentUser: entry.moderator,
        assessmentId: hold.id,
        resolvedAt: new Date(),
        resolutionKind: 'dismissed',
        rationale: `Proceeding dismissed ${randomUUID()}.`,
      })
  })

/** An accepted counter-notice whose restoration deadline has not been resolved. */
export const createOpenDeadlineCase = () =>
  blockMinimalCase(async entry => {
    const deadlineId = await insertOpenCopyrightDeadline({
      noticeId: entry.noticeId,
      actorUserId: entry.moderator.id,
      escalationAt: new Date(Date.now() + 10 * DAY_MS),
      restorationDeadlineAt: new Date(Date.now() + 14 * DAY_MS),
    })
    return () => cancelCopyrightDeadline(deadlineId)
  })

/** A receipt to the claimant that no worker has sent yet. */
export const createUnsentDeliveryCase = () =>
  blockMinimalCase(async entry => {
    const receipt = await createOutboundCopyrightCorrespondence({
      noticeId: entry.noticeId,
      submissionId: entry.submissionId,
      correspondenceKind: 'receipt',
      compositionKind: 'deterministic_template',
      bodyCiphertext: `receipt-${randomUUID()}`,
      draftedById: null,
    })
    await createCopyrightDeliveryIntent({
      noticeId: entry.noticeId,
      submissionId: entry.submissionId,
      correspondenceId: receipt.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'email',
      idempotencyKey: `retention-receipt-${randomUUID()}`,
      recipientEmail: `claimant-${randomUUID()}@example.test`,
    })
    return () => sendAllCopyrightDeliveries(entry.noticeId)
  })

/** A guest capability that can still file against the case for another week. */
export const createLiveGuestCapabilityCase = () =>
  blockMinimalCase(async entry => {
    const capability = await issueCopyrightGuestCapability({
      currentUser: entry.moderator,
      noticeId: entry.noticeId,
      expiresAt: new Date(Date.now() + 7 * DAY_MS),
    })
    return () =>
      revokeCopyrightGuestCapability({
        currentUser: entry.moderator,
        noticeId: entry.noticeId,
        capabilityId: capability.id,
        revokedAt: new Date(),
      })
  })
