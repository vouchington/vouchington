import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  appendCopyrightSubmissionAssessment,
  createCopyrightDeliveryIntent,
  createCopyrightNoticeAggregate,
  createOutboundCopyrightCorrespondence,
  getCopyrightNoticePrivateAggregate,
} from './index.mts'

export async function createCopyrightRestorationHoldFixture() {
  const [claimant, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const [imageId, postId] = await Promise.all([
    insertTestImage(claimant.id),
    insertTestPost({
      title: `copyright hold ${crypto.randomUUID()}`,
      slug: `copyright-hold-${crypto.randomUUID()}`,
      createdById: claimant.id,
      markdown: 'images',
    }),
  ])
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
  const { assessment, receipt } = await createAssessmentAndReceipt(aggregate, moderator, notice.id)
  await createCopyrightDeliveryIntent({
    noticeId: notice.id,
    submissionId: aggregate.submissions[0].id,
    correspondenceId: receipt.id,
    recipientUserId: null,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_receipt',
    channel: 'email',
    idempotencyKey: `copyright-hold-receipt-${crypto.randomUUID()}`,
    recipientEmail: `tests+copyright-${crypto.randomUUID()}@voucha.ai`,
  })
  return { aggregate, assessment, claimant, moderator, notice }
}

async function createAssessmentAndReceipt(
  aggregate: NonNullable<Awaited<ReturnType<typeof getCopyrightNoticePrivateAggregate>>>,
  moderator: Awaited<ReturnType<typeof createTestUserDirect>>,
  noticeId: string,
) {
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const receipt = await createOutboundCopyrightCorrespondence({
    noticeId,
    submissionId: aggregate.submissions[0].id,
    correspondenceKind: 'receipt',
    compositionKind: 'deterministic_template',
    bodyCiphertext: `receipt-${crypto.randomUUID()}`,
    draftedById: null,
  })
  return { assessment, receipt }
}
