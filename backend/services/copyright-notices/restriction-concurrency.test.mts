import { describe, expect, it, vi } from 'vitest'
import type { publishImagePlacementDeliveryRecord } from '@services/images/delivery-registry'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  completeCopyrightMandatoryHumanReview,
  createCopyrightNoticeAggregate,
  createCopyrightDeliveryIntent,
  createCopyrightCounterNotice,
  createOutboundCopyrightCorrespondence,
  createCounterNoticeDeadline,
  createEligibleCopyrightRestoreIntent,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
} from './index.mts'

describe('copyright restriction concurrency', () => {
  it('notifies only the poster at the restricted post-image placement', async () => {
    const [targetPoster, unrelatedPoster, moderatorRecord] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const imageId = await insertTestImage(targetPoster.id)
    const [targetPostId, unrelatedPostId] = await Promise.all([
      insertTestPost({
        title: `copyright target placement ${crypto.randomUUID()}`,
        slug: `copyright-target-placement-${crypto.randomUUID()}`,
        createdById: targetPoster.id,
        markdown: 'image',
      }),
      insertTestPost({
        title: `copyright unrelated placement ${crypto.randomUUID()}`,
        slug: `copyright-unrelated-placement-${crypto.randomUUID()}`,
        createdById: unrelatedPoster.id,
        markdown: 'image',
      }),
    ])
    await Promise.all([
      insertTestPostImage({ postId: targetPostId, imageId }),
      insertTestPostImage({ postId: unrelatedPostId, imageId }),
    ])
    const targetPlacement = await requireTestPostImagePlacement(targetPostId, imageId)
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date('2026-06-30T16:00:00.000Z'),
      claimantUserId: null,
      claimantDisplayName: null,
      claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
      workDescription: `work-${crypto.randomUUID()}`,
      policyVersion: 'test-v1',
      initialSubmission: {
        kind: 'notice',
        sourceKind: 'signed_in_form',
        bodyCiphertext: `notice-${crypto.randomUUID()}`,
      },
      targets: [
        {
          placementKey: `image-placement:${targetPlacement.placement_id}`,
          placementRevision: targetPlacement.placement_revision,
          imageId,
          hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
        },
      ],
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    if (!aggregate) throw new Error('fixture notice disappeared')
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: aggregate.submissions[0].id,
      assessedAt: new Date('2026-07-01T11:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
    })

    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: aggregate.targets[0].id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })

    const restricted = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(
      new Set(
        restricted?.deliveryIntents
          .filter(intent => intent.delivery_kind === 'poster_restriction_notice')
          .map(intent => intent.recipient_user_id),
      ),
    ).toEqual(new Set([targetPoster.id]))
    expect(restricted?.actionIntents).toContainEqual(
      expect.objectContaining({
        action: 'withhold',
        expected_placement_revision: targetPlacement.placement_revision,
        state: 'pending',
      }),
    )
    const withholdIntent = restricted?.actionIntents.find(intent => intent.action === 'withhold')
    if (!withholdIntent) throw new Error('withhold intent disappeared')
    const publish = vi.fn<typeof publishImagePlacementDeliveryRecord>().mockResolvedValue(undefined)
    await expect(
      processCopyrightActionIntent(withholdIntent.id, new Date('2026-07-01T12:01:00.000Z'), {
        publishImagePlacementDeliveryRecord: publish,
      }),
    ).resolves.toBe('applied')
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ state: 'withheld', imageId }))
    const completed = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(completed?.actionIntents).toContainEqual(
      expect.objectContaining({
        id: withholdIntent.id,
        state: 'completed',
        completed_at_reason: 'completed',
      }),
    )
  })

  it('serializes mandatory review and restoration for one placement', async () => {
    const [claimant, moderatorRecord] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `copyright concurrency ${crypto.randomUUID()}`,
      slug: `copyright-concurrency-${crypto.randomUUID()}`,
      createdById: claimant.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(claimant.id)
    await insertTestPostImage({ postId, imageId })
    const placement = await requireTestPostImagePlacement(postId, imageId)
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date('2026-06-30T16:00:00.000Z'),
      claimantUserId: claimant.id,
      claimantDisplayName: null,
      claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
      workDescription: `work-${crypto.randomUUID()}`,
      policyVersion: 'test-v1',
      initialSubmission: {
        kind: 'notice',
        sourceKind: 'signed_in_form',
        bodyCiphertext: `notice-${crypto.randomUUID()}`,
      },
      targets: [
        {
          placementKey: `image-placement:${placement.placement_id}`,
          placementRevision: placement.placement_revision,
          imageId,
          hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
        },
      ],
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    if (!aggregate) throw new Error('fixture notice disappeared')
    const receipt = await createOutboundCopyrightCorrespondence({
      noticeId: notice.id,
      submissionId: aggregate.submissions[0].id,
      correspondenceKind: 'receipt',
      compositionKind: 'deterministic_template',
      bodyCiphertext: `receipt-${crypto.randomUUID()}`,
      draftedById: null,
    })
    await createCopyrightDeliveryIntent({
      noticeId: notice.id,
      submissionId: aggregate.submissions[0].id,
      correspondenceId: receipt.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'email',
      idempotencyKey: `copyright-claimant-receipt-${crypto.randomUUID()}`,
      recipientEmail: `tests+copyright-${crypto.randomUUID()}@voucha.ai`,
    })
    const target = aggregate.targets[0]!
    const noticeAssessment = await appendCopyrightSubmissionAssessment({
      submissionId: aggregate.submissions[0]!.id,
      assessedAt: new Date('2026-07-01T11:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
    })
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: null,
    })
    const counterNotice = await createCopyrightCounterNotice(
      claimant,
      notice.id,
      crypto.randomUUID(),
      {
        name: 'Claimant',
        address: '1 Main Street',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        targetIds: [target.id],
      },
    )
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: counterNotice.submission.id,
      assessedAt: new Date('2026-07-01T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: assessment.id })
    const [review, restoration] = await Promise.allSettled([
      completeCopyrightMandatoryHumanReview({
        noticeId: notice.id,
        restrictionId: restriction.id,
        currentUser: moderator,
        action: 'confirm',
        rationale: 'The restriction remains appropriate after review.',
        reviewedAt: new Date('2026-07-02T12:00:00.000Z'),
      }),
      createEligibleCopyrightRestoreIntent({
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now: new Date('2026-07-16T12:00:00.000Z'),
      }),
    ])

    expect(review.status).toBe('fulfilled')
    const restorationOutcome =
      restoration.status === 'fulfilled'
        ? restoration.value.action
        : (restoration.reason as Error).message
    expect(['restore', 'Copyright restoration is not eligible']).toContain(restorationOutcome)
  })
})

async function requireTestPostImagePlacement(postId: string, imageId: string) {
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error(`Missing image placement for ${postId}`)
  return placement
}
