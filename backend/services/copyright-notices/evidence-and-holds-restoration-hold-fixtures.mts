import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import type { publishImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import {
  appendCopyrightSubmissionAssessment,
  createCopyrightCounterNotice,
  createCopyrightDeliveryIntent,
  createCopyrightNoticeAggregate,
  createCounterNoticeDeadline,
  createEligibleCopyrightRestoreIntent,
  createOutboundCopyrightCorrespondence,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
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

export async function deliverInitialCopyrightWithhold(
  noticeId: string,
  publish: typeof publishImagePlacementDeliveryRecord,
): Promise<void> {
  const withhold = (await getCopyrightNoticePrivateAggregate(noticeId))?.actionIntents.find(
    intent => intent.action === 'withhold',
  )
  if (!withhold) throw new Error('initial withhold intent disappeared')
  await processCopyrightActionIntent(withhold.id, new Date('2026-07-01T12:01:00.000Z'), {
    ...createTestCopyrightDeliveryDependencies(publish),
  })
}

export async function createCompliantCounterNoticeDeadline(input: {
  claimant: Parameters<typeof createCopyrightCounterNotice>[0]
  noticeId: string
  moderator: Parameters<typeof appendCopyrightSubmissionAssessment>[0]['currentUser']
  targetIds: string[]
  assessedAt?: Date
}) {
  const counterNotice = await createCopyrightCounterNotice(
    input.claimant,
    input.noticeId,
    crypto.randomUUID(),
    {
      name: 'Poster',
      address: '1 Main Street',
      telephone: '555-0100',
      consentToFederalJurisdiction: true,
      consentToServiceOfProcess: true,
      goodFaithMisidentificationUnderPenaltyOfPerjury: true,
      electronicSignature: 'Poster',
      targetIds: input.targetIds,
    },
  )
  const counterAssessment = await appendCopyrightSubmissionAssessment({
    submissionId: counterNotice.submission.id,
    assessedAt: input.assessedAt ?? new Date('2026-07-02T12:00:00.000Z'),
    currentUser: input.moderator,
    substantiallyCompliant: true,
    targetIds: input.targetIds,
  })
  return createCounterNoticeDeadline({ assessmentId: counterAssessment.id })
}

export async function createCounterNoticeRestoreIntent(input: {
  claimant: Parameters<typeof createCopyrightCounterNotice>[0]
  noticeId: string
  moderator: Parameters<typeof appendCopyrightSubmissionAssessment>[0]['currentUser']
  targetId: string
  restrictionId: string
  placementRevision: number
  offsetMs?: number
}) {
  const deadline = await createCompliantCounterNoticeDeadline({
    claimant: input.claimant,
    noticeId: input.noticeId,
    moderator: input.moderator,
    targetIds: [input.targetId],
  })
  const now = new Date(deadline.earliest_restoration_at.getTime() + (input.offsetMs ?? 60_000))
  const restore = await createEligibleCopyrightRestoreIntent({
    noticeId: input.noticeId,
    targetId: input.targetId,
    restrictionId: input.restrictionId,
    deadlineId: deadline.id,
    expectedPlacementRevision: input.placementRevision,
    now,
  })
  return { deadline, now, restore }
}
