import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { failTestCopyrightDeliveryIntent } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { copyrightPromotionText, copyrightReceiptText } from './statement-of-reasons-wording.mts'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  readCopyrightEmailIntakeReview,
  readCopyrightEmailIntakeResponses,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  markCopyrightDeliveryIntentBouncedBySesMessageId,
  markCopyrightDeliveryIntentFailed,
  markCopyrightDeliveryIntentSent,
  prepareCopyrightEmailDelivery,
} from './index.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { rejectCopyrightEmailIntake } from './email-rejection.mts'
import { createParsedCopyrightEmailIntake } from './email-intake-test-fixtures.mts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('copyright email promotion', () => {
  useCopyrightIntakeEnvironment()
  it.each(['pending', 'failed', 'none'] as const)(
    'promotes while retaining a %s arrival receipt and uses the applicable case acknowledgement',
    async receiptState => {
      const [poster, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
      const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
      const postId = await insertTestPost({
        title: `Copyright email approval ${crypto.randomUUID()}`,
        slug: `copyright-email-approval-${crypto.randomUUID()}`,
        createdById: poster.id,
        markdown: 'Hosted copyright target.',
      })
      const imageId = await insertTestImage(poster.id)
      const placementId = await insertTestPostImage({ postId, imageId })
      if (receiptState === 'none') vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', 'false')
      const intake = await createParsedCopyrightEmailIntake()
      vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', 'true')
      const arrival = (await readCopyrightEmailIntakeResponses(intake.id))[0]
      expect(arrival?.delivery_kind).toBe(
        receiptState === 'none' ? undefined : 'email_intake_received',
      )
      if (receiptState === 'failed') await failTestCopyrightDeliveryIntent(arrival!.id)
      const approved = await promoteCopyrightEmailIntake({
        currentUser: moderator,
        intakeId: intake.id,
        recommendationId: null,
        manualFallbackReason: 'The extraction agent was unavailable.',
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Claimant',
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'Original photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        targets: [
          {
            placementId,
            placementRevision: 1,
            imageId,
            bindingFamily: 'post',
            hostedUseUrl: `https://voucha.ai/posts/${postId}`,
          },
        ],
        rationale: 'The email contains the statutory notice statements.',
      })
      const aggregate = await getCopyrightNoticePrivateAggregate(approved.noticeId)
      const receipt = aggregate!.deliveryIntents.find(
        row => row.delivery_kind === 'claimant_receipt',
      )!
      expect((await prepareCopyrightEmailDelivery(receipt.id)).text).toBe(
        receiptState === 'pending'
          ? copyrightPromotionText(approved.noticeId)
          : copyrightReceiptText(approved.noticeId),
      )
      expect(await readCopyrightEmailIntakeResponses(intake.id)).toEqual(
        receiptState === 'none'
          ? []
          : [{ id: arrival!.id, delivery_kind: 'email_intake_received', state: receiptState }],
      )
      const claimantDecision = (await readTestCopyrightStatementIntents(approved.noticeId)).filter(
        row => row.recipient_role === 'claimant',
      )
      expect(claimantDecision).toHaveLength(1)
      expect(claimantDecision[0]).toMatchObject({
        channel: 'email',
        recipient_user_id: null,
        email: 'claimant@example.test',
      })
      expect(aggregate?.submissions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: approved.submissionId, source_kind: 'email' }),
        ]),
      )
      expect(aggregate?.restrictions).toEqual(
        expect.arrayContaining([expect.objectContaining({ imposed_by_id: moderator.id })]),
      )
      await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([
        { decision: 'approved', promoted_copyright_notice_id: approved.noticeId },
      ])
      await expect(
        promoteCopyrightEmailIntake({
          currentUser: moderator,
          intakeId: intake.id,
          recommendationId: null,
          manualFallbackReason: 'The extraction agent was unavailable.',
          jurisdiction: 'us_dmca',
          claimantDisplayName: 'Claimant',
          claimantContact: 'claimant@example.test',
          claimantEmail: 'claimant@example.test',
          workDescription: 'Original photograph',
          goodFaithBelief: true,
          accuracyAuthorityUnderPenaltyOfPerjury: true,
          electronicSignature: 'Claimant',
          targets: [
            {
              placementId,
              placementRevision: 1,
              imageId,
              bindingFamily: 'post',
              hostedUseUrl: `https://voucha.ai/posts/${postId}`,
            },
          ],
          rationale: 'The prior moderator decision may be safely replayed.',
        }),
      ).resolves.toEqual(approved)
    },
  )

  it('sends and records a bounced staff response to a rejected email', async () => {
    const responseId = await rejectParsedIntakeWithResponse({
      responseKind: 'needs_information',
      responseMessage: 'Please identify the work and the hosted material.',
    })
    const first = await prepareCopyrightEmailDelivery(responseId)
    expect(first.subject).toContain('More information')
    expect(first.text).toContain('Please identify the work')
    const sesMessageId = `ses-outbound-${crypto.randomUUID()}`
    expect(
      await markCopyrightDeliveryIntentSent({
        intentId: responseId,
        leaseToken: first.leaseToken,
        sesMessageId,
      }),
    ).toBe(true)
    await expect(
      markCopyrightDeliveryIntentBouncedBySesMessageId({
        sesMessageId,
        recipientEmails: ['someone-else@example.test'],
      }),
    ).resolves.toBe(0)
    await expect(
      markCopyrightDeliveryIntentBouncedBySesMessageId({
        sesMessageId,
        recipientEmails: [first.recipientEmail.toUpperCase()],
      }),
    ).resolves.toBe(1)
  })

  it('records a retryable failure only after claiming an email response', async () => {
    const responseId = await rejectParsedIntakeWithResponse({
      responseKind: 'rejected',
      responseMessage: null,
    })
    const prepared = await prepareCopyrightEmailDelivery(responseId)
    await expect(
      markCopyrightDeliveryIntentFailed({
        intentId: responseId,
        leaseToken: prepared.leaseToken,
        error: 'The email provider timed out.',
      }),
    ).resolves.toBe(true)
    await expect(
      markCopyrightDeliveryIntentSent({
        intentId: responseId,
        leaseToken: prepared.leaseToken,
        sesMessageId: `ses-should-not-send-${crypto.randomUUID()}`,
      }),
    ).resolves.toBe(false)
  })

  it('rejects a recommendation that does not belong to the intake', async () => {
    const [poster, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `Copyright rec scope ${crypto.randomUUID()}`,
      slug: `copyright-rec-scope-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'Hosted copyright target.',
    })
    const imageId = await insertTestImage(poster.id)
    const placementId = await insertTestPostImage({ postId, imageId })
    const intake = await createParsedCopyrightEmailIntake()
    const foreignRecommendationId = '00000000-0000-7000-8000-000000000099'
    await expect(
      promoteCopyrightEmailIntake({
        currentUser: moderator,
        intakeId: intake.id,
        recommendationId: foreignRecommendationId,
        manualFallbackReason: null,
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Claimant',
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'Original photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        targets: [
          {
            placementId,
            placementRevision: 1,
            imageId,
            bindingFamily: 'post',
            hostedUseUrl: `https://voucha.ai/posts/${postId}`,
          },
        ],
        rationale: 'The recommendation belongs to a different intake.',
      }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      rejectCopyrightEmailIntake({
        currentUser: moderator,
        intakeId: intake.id,
        recommendationId: foreignRecommendationId,
        manualFallbackReason: null,
        rationale: 'The recommendation belongs to a different intake.',
        responseKind: 'rejected',
        responseMessage: null,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

async function rejectParsedIntakeWithResponse(
  response: Pick<
    Parameters<typeof rejectCopyrightEmailIntake>[0],
    'responseKind' | 'responseMessage'
  >,
): Promise<string> {
  const moderatorRecord = await createTestUser()
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const intake = await createParsedCopyrightEmailIntake()
  const { responseId } = await rejectCopyrightEmailIntake({
    currentUser: moderator,
    intakeId: intake.id,
    recommendationId: null,
    manualFallbackReason: 'The extraction agent was unavailable.',
    rationale: 'The message lacks the required declarations.',
    ...response,
  })
  if (!responseId) throw new Error('response was not created')
  return responseId
}
