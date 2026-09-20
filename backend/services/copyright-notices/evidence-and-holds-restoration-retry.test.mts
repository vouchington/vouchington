import { describe, expect, it } from 'vitest'
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
  createCopyrightCounterNotice,
  createCopyrightDeliveryIntent,
  createCopyrightNoticeAggregate,
  createCounterNoticeDeadline,
  createOutboundCopyrightCorrespondence,
  createEligibleCopyrightRestoreIntent,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
} from './index.mts'

async function createFixture() {
  const [claimant, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const imageId = await insertTestImage(claimant.id)
  const postId = await insertTestPost({
    title: `copyright evidence ${crypto.randomUUID()}`,
    slug: `copyright-evidence-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'images',
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: { kind: 'notice', sourceKind: 'signed_in_form', bodyCiphertext: 'notice' },
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
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
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
    idempotencyKey: `copyright-evidence-receipt-${crypto.randomUUID()}`,
    recipientEmail: `tests+copyright-${crypto.randomUUID()}@voucha.ai`,
  })
  return { aggregate, assessment, claimant, moderator, notice }
}

describe('copyright notice restoration retries', () => {
  it('fails closed after restore delivery rejects, then republishes allow and completes on retry', async () => {
    const {
      aggregate,
      assessment: noticeAssessment,
      claimant,
      moderator,
      notice,
    } = await createFixture()
    const target = aggregate.targets[0]!
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const initialWithhold = (
      await getCopyrightNoticePrivateAggregate(notice.id)
    )?.actionIntents.find(intent => intent.action === 'withhold')
    if (!initialWithhold) throw new Error('initial withhold intent disappeared')
    await expect(
      processCopyrightActionIntent(initialWithhold.id, new Date('2026-07-01T12:01:00.000Z'), {
        publishImagePlacementDeliveryRecord: async () => undefined,
      }),
    ).resolves.toBe('applied')
    const counterNotice = await createCopyrightCounterNotice(
      claimant,
      notice.id,
      crypto.randomUUID(),
      {
        name: 'Poster',
        address: '1 Main Street',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Poster',
        targetIds: [target.id],
      },
    )
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: counterNotice.submission.id,
      assessedAt: new Date('2026-07-02T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: assessment.id })
    const restorationAt = new Date(deadline.earliest_restoration_at.getTime() + 60_000)
    const restore = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: target.id,
      restrictionId: restriction.id,
      deadlineId: deadline.id,
      expectedPlacementRevision: target.placement_revision,
      now: restorationAt,
    })
    let rejectFirstAllow = true
    const publishedStates: string[] = []
    const publish: typeof publishImagePlacementDeliveryRecord = async input => {
      publishedStates.push(input.state)
      if (input.state === 'allow' && rejectFirstAllow) {
        rejectFirstAllow = false
        throw new Error('edge allow outage')
      }
    }
    await expect(
      processCopyrightActionIntent(restore.id, restorationAt, {
        publishImagePlacementDeliveryRecord: publish,
      }),
    ).rejects.toThrow('edge allow outage')
    expect(publishedStates).toEqual(['allow', 'withheld'])
    expect(
      (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
        intent => intent.id === restore.id,
      ),
    ).toEqual(expect.objectContaining({ state: 'pending' }))
    await expect(
      processCopyrightActionIntent(restore.id, new Date(restorationAt.getTime() + 2 * 60_000), {
        publishImagePlacementDeliveryRecord: publish,
      }),
    ).resolves.toBe('applied')
    expect(publishedStates).toEqual(['allow', 'withheld', 'allow'])
    expect(
      (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
        intent => intent.id === restore.id,
      ),
    ).toEqual(expect.objectContaining({ state: 'completed', completed_at_reason: 'completed' }))
  })
})
