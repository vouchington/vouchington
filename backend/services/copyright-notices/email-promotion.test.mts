import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import {
  readCopyrightEmailIntakeReview,
  readCopyrightEmailIntakeResponses,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  createOwnedCopyrightReceiptScene,
  seedOwnedCopyrightReceiptSource,
  createOwnedCopyrightProviderReply,
  seedOwnedCopyrightProviderStage,
} from '@voucha/test-helpers/copyright-email-receipt-scenes'
import { seedOwnedCopyrightReplyClaim } from '@voucha/test-helpers/copyright-reply-replay-fixtures'
import { readOwnedCopyrightMailWork } from '@voucha/test-helpers/copyright-email-work-state'
import {
  assertOwnedCopyrightMailPreparation,
  assertOwnedCopyrightProviderWrite,
  assertOwnedCopyrightStaleMailLease,
} from '@voucha/test-helpers/copyright-email-work-outcomes'
import { assertCopyrightPromotionOutcome } from '@voucha/test-helpers/copyright-email-promotion-outcomes'
import { assertCommittedCopyrightGraphReplay } from '@voucha/test-helpers/copyright-committed-graph-replay'
import { seedCommittedCopyrightPromotion } from '@voucha/test-helpers/copyright-promotion-committed-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { markCopyrightDeliveryIntentBouncedBySesMessageId } from './delivery-bounces.mts'
import {
  copyrightPromotionText,
  copyrightReceiptText,
  copyrightNeedsInformationText,
} from './statement-of-reasons-wording.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { rejectCopyrightEmailIntake } from './email-rejection.mts'

describe('copyright email promotion', () => {
  useCopyrightIntakeEnvironment()
  it.each(['pending', 'failed', 'none'] as const)(
    'promotes atomically while retaining the %s arrival receipt',
    async state => {
      expect.hasAssertions()
      const scene = await createOwnedCopyrightReceiptScene(state)
      const before = await readCopyrightEmailIntakeResponses(scene.intake.id)
      expect(before).toEqual(
        state === 'none'
          ? []
          : [{ id: scene.arrivalId, delivery_kind: 'email_intake_received', state }],
      )
      await assertCopyrightPromotionOutcome({ input: scene.input, intakeIds: [scene.intake.id] })
      expect(await readCopyrightEmailIntakeResponses(scene.intake.id)).toEqual(before)
    },
  )

  it.each(['pending', 'failed', 'none'] as const)(
    'uses the applicable case acknowledgement from a committed %s arrival stage',
    async state => {
      const scene = await createOwnedCopyrightReceiptScene(state)
      const approved = await seedCommittedCopyrightPromotion(scene.input)
      const aggregate = await getCopyrightNoticePrivateAggregate(approved.noticeId)
      const receipt = aggregate!.deliveryIntents.find(
        row => row.delivery_kind === 'claimant_receipt',
      )!
      await assertOwnedCopyrightMailPreparation(
        receipt.id,
        'claimant@example.test',
        state === 'pending'
          ? copyrightPromotionText(approved.noticeId)
          : copyrightReceiptText(approved.noticeId),
      )
      expect(await readCopyrightEmailIntakeResponses(scene.intake.id)).toEqual(
        state === 'none'
          ? []
          : [{ id: scene.arrivalId, delivery_kind: 'email_intake_received', state }],
      )
      const decisions = (await readTestCopyrightStatementIntents(approved.noticeId)).filter(
        row => row.recipient_role === 'claimant',
      )
      expect(decisions).toHaveLength(1)
      expect(decisions[0]).toMatchObject({
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
        expect.arrayContaining([expect.objectContaining({ imposed_by_id: scene.moderator.id })]),
      )
      await expect(readCopyrightEmailIntakeReview(scene.intake.id)).resolves.toEqual([
        { decision: 'approved', promoted_copyright_notice_id: approved.noticeId },
      ])
      await assertCommittedCopyrightGraphReplay(
        {
          input: {
            ...scene.input,
            rationale: 'The prior moderator decision may be safely replayed.',
          },
          intakeIds: [scene.intake.id],
          parentNoticeIds: [approved.noticeId],
        },
        approved.noticeId,
      )
    },
  )

  it('prepares the exact stored staff response for its unmatched recipient', async () => {
    expect.hasAssertions()
    const scene = await createOwnedCopyrightProviderReply('needs_information')
    await assertOwnedCopyrightMailPreparation(
      scene.intentId,
      'claimant@example.test',
      `${copyrightNeedsInformationText}\n\nPlease identify the work and the hosted material.`,
    )
  })

  it('records the owned provider acceptance atomically', async () => {
    expect.hasAssertions()
    const scene = await createOwnedCopyrightProviderReply('needs_information')
    await seedOwnedCopyrightReplyClaim(scene.intentId)
    const before = await readOwnedCopyrightMailWork(scene.intentId)
    const leaseToken = before.work.lease_token
    if (!leaseToken) throw new Error('Owned provider claim is missing')
    await assertOwnedCopyrightProviderWrite({
      kind: 'sent',
      intentId: scene.intentId,
      leaseToken,
      sesMessageId: `ses-outbound-${crypto.randomUUID()}`,
    })
  })

  it('bounces only its committed sent reply and its matching private recipient', async () => {
    const scene = await createOwnedCopyrightProviderReply('needs_information')
    const sent = await seedOwnedCopyrightProviderStage(scene.intentId, 'sent')
    const before = await readOwnedCopyrightMailWork(scene.intentId)
    await expect(
      markCopyrightDeliveryIntentBouncedBySesMessageId({
        sesMessageId: sent.sesMessageId,
        recipientEmails: ['someone-else@example.test'],
      }),
    ).resolves.toBe(0)
    expect(await readOwnedCopyrightMailWork(scene.intentId)).toEqual(before)
    await assertOwnedCopyrightProviderWrite({
      kind: 'bounced',
      intentId: scene.intentId,
      sesMessageId: sent.sesMessageId,
      recipientEmail: 'claimant@example.test',
    })
  })

  it('records a retryable provider failure atomically', async () => {
    expect.hasAssertions()
    const scene = await createOwnedCopyrightProviderReply('rejected')
    await seedOwnedCopyrightReplyClaim(scene.intentId)
    const before = await readOwnedCopyrightMailWork(scene.intentId)
    const leaseToken = before.work.lease_token
    if (!leaseToken) throw new Error('Owned provider claim is missing')
    await assertOwnedCopyrightProviderWrite({
      kind: 'failed',
      intentId: scene.intentId,
      leaseToken,
      error: 'The email provider timed out.',
    })
  })

  it('never sends using a separately committed failed lease', async () => {
    expect.hasAssertions()
    const scene = await createOwnedCopyrightProviderReply('rejected')
    const failed = await seedOwnedCopyrightProviderStage(scene.intentId, 'retryable_failure')
    await assertOwnedCopyrightStaleMailLease(scene.intentId, failed.leaseToken)
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
    const { intake } = await seedOwnedCopyrightReceiptSource('pending')
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
