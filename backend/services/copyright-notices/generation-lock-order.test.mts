import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { createCopyrightFormFixture } from '@voucha/test-helpers/copyright-route-fixtures'
import { runWhileCopyrightGenerationsHeld } from '@voucha/test-helpers/copyright-generation-order-race'
import { createTestCopyrightFormIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { createCopyrightDeliveryIntents } from './delivery-intent-batch.mts'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { createCopyrightFormIntake } from './form-intakes.mts'
import { rejectCopyrightEmailCorrespondence } from './email-correspondence-rejection.mts'
import { recoverMissingDecisionAssessments } from './enforcement-recovery.mts'
import type { CopyrightDeliveryIntentInput } from './delivery-types.mts'

/**
 * Every writer owns its case generation row first. Each test holds the generation like such a
 * writer, proves the operation queues on it before any notice, submission or link lock, then
 * locks those rows itself. Any other acquisition order is a lock cycle.
 */
describe('copyright generation-first lock order', () => {
  useCopyrightIntakeEnvironment()

  async function createAcceptedFormDecision() {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const fixture = await createCopyrightFormFixture()
    const { intake } = await createCopyrightFormIntake({
      currentUser: fixture.claimant,
      requesterIdentity: `user:${fixture.claimant.id}`,
      idempotencyKey: randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: fixture.form.claimant_display_name,
        claimantContact: fixture.form.claimant_contact,
        claimantEmail: fixture.form.claimant_email,
        workDescription: fixture.form.work_description,
        goodFaithBelief: fixture.form.has_good_faith_belief,
        accuracyAuthorityUnderPenaltyOfPerjury:
          fixture.form.has_accuracy_authority_under_penalty_of_perjury,
        electronicSignature: fixture.form.electronic_signature,
        claimantTargets: fixture.form.targets.map(target => ({
          surfaceKind: 'post-image' as const,
          postId: target.post_id,
          imageId: target.image_id,
          hostedUseUrl: target.target_url,
        })),
      },
    })
    await createTestCopyrightFormIntakeReview({
      intakeId: intake.id,
      moderatorId: moderator.id,
      is_accepted: true,
    })
    return {
      moderator,
      noticeId: intake.copyright_notice_id,
      submissionId: intake.copyright_notice_submission_id,
    }
  }

  function intent(
    noticeId: string,
    userId: string,
    submissionId: string | null,
  ): CopyrightDeliveryIntentInput {
    return {
      noticeId,
      submissionId,
      correspondenceId: null,
      recipientUserId: userId,
      recipientRole: 'poster',
      deliveryKind: 'status_update',
      channel: 'in_app',
      idempotencyKey: `generation-order:${randomUUID()}`,
    }
  }

  it('rejects email correspondence after owning the generation, not an unwritten notice lock', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const notice = await createRetentionMinimalCase()
    const intake = await createRetentionParsedEmail(`reject-order-${randomUUID()}`, {
      reply: true,
    })
    await linkCopyrightEmailIntakeToNotice({
      intakeId: intake.id,
      noticeId: notice.noticeId,
      linkKind: 'thread',
    })
    const result = await runWhileCopyrightGenerationsHeld({
      heldNoticeIds: [notice.noticeId],
      start: () =>
        rejectCopyrightEmailCorrespondence({
          currentUser: moderator,
          intakeId: intake.id,
          kind: 'supplement',
          rationale: 'Not a case supplement.',
          recommendationId: null,
          manualFallbackReason: 'Agent output is unavailable.',
        }),
      holderWrites: async holder => {
        await holder(sql`/* testGenerationOrder:rejectionRows */
          SELECT notice.id FROM copyright_notices notice
          JOIN copyright_notice_email_intake_notice_links link
            ON link.copyright_notice_id = notice.id
          JOIN copyright_notice_email_intakes intake
            ON intake.id = link.copyright_notice_email_intake_id
          WHERE intake.id = ${intake.id} FOR UPDATE OF notice, link, intake`)
      },
    })
    expect(result).toEqual({ noticeId: notice.noticeId, isDuplicate: false })
  })

  it('recovers a missing assessment after owning the generation, not notice and submission locks', async () => {
    const { noticeId, submissionId } = await createAcceptedFormDecision()
    const user = await createTestUser()
    const page = await runWhileCopyrightGenerationsHeld({
      heldNoticeIds: [noticeId],
      start: () => recoverMissingDecisionAssessments({ ids: [submissionId], limit: 1 }),
      // A delivery writer that owns the generation next references the submission by foreign key.
      holderWrites: async holder => {
        await createCopyrightDeliveryIntents([intent(noticeId, user.id, submissionId)], holder)
      },
    })
    expect(page.results).toEqual([submissionId])
  })

  it('appends an assessment after owning the generation, before notice and submission locks', async () => {
    const { moderator, noticeId, submissionId } = await createAcceptedFormDecision()
    const assessment = await runWhileCopyrightGenerationsHeld({
      heldNoticeIds: [noticeId],
      start: () =>
        appendCopyrightSubmissionAssessment({
          submissionId,
          assessedAt: new Date(),
          currentUser: moderator,
          substantiallyCompliant: true,
        }),
      holderWrites: async holder => {
        await holder(sql`/* testGenerationOrder:assessmentRows */
          SELECT submission.id FROM copyright_notice_submissions submission
          JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
          WHERE submission.id = ${submissionId} FOR UPDATE OF notice, submission`)
      },
    })
    expect(assessment.copyright_notice_submission_id).toBe(submissionId)
  })

  it('creates a multi-case delivery batch holding only generations until it writes', async () => {
    const first = await createAcceptedFormDecision()
    const second = await createAcceptedFormDecision()
    const user = await createTestUser()
    const [low, high] = [first, second].toSorted((a, b) => a.noticeId.localeCompare(b.noticeId))
    const intents = await runWhileCopyrightGenerationsHeld({
      heldNoticeIds: [high!.noticeId],
      start: async () => {
        await using transaction = await beginTransaction()
        const created = await createCopyrightDeliveryIntents(
          [low!, high!].map(item => intent(item.noticeId, user.id, item.submissionId)),
          transaction,
        )
        await transaction.commit()
        return created
      },
      // The holder locks the notice the batch must not have key-shared before its generation.
      holderWrites: async holder => {
        await holder(sql`/* testGenerationOrder:batchRows */
          SELECT id FROM copyright_notices WHERE id = ${low!.noticeId} FOR UPDATE`)
      },
    })
    expect(intents.map(created => created.copyright_notice_id)).toEqual([
      low!.noticeId,
      high!.noticeId,
    ])
  })
})
