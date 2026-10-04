import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'
import { createOutboundCopyrightCorrespondence } from '../services/copyright-notices/correspondence.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'
import { insertTestImage } from './entities/images-insert.mts'
import { insertTestPostImage } from './entities/images.mts'
import { getTestPostImagePlacement } from './entities/post-images.mts'
import { insertTestPost } from './entities/posts.mts'
import { createTestUserDirect } from './entities/users-direct.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

export type AssessedUsDmcaCopyrightNoticeFixtureInput = {
  postTitlePrefix: string
  postSlugPrefix: string
  postMarkdown: string
  claimantDisplayName: string | null
  noticeBodyCiphertext: string
  receiptIdempotencyKeyPrefix: string
  assessBeforeReceipt: boolean
}

/** US DMCA claimant, moderator, hosted image, assessed notice, and claimant receipt. */
export async function createAssessedUsDmcaCopyrightNoticeFixture(
  input: AssessedUsDmcaCopyrightNoticeFixtureInput,
) {
  const [claimant, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const imageId = await insertTestImage(claimant.id)
  const postId = await insertTestPost({
    title: `${input.postTitlePrefix} ${crypto.randomUUID()}`,
    slug: `${input.postSlugPrefix}-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: input.postMarkdown,
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: input.claimantDisplayName,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      bodyCiphertext: input.noticeBodyCiphertext,
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('fixture notice disappeared')
  const submission = aggregate.submissions[0]
  if (!submission) throw new Error('fixture notice submission disappeared')
  if (!input.assessBeforeReceipt) {
    await recordClaimantReceipt(notice.id, submission.id, input.receiptIdempotencyKeyPrefix)
  }
  const noticeAssessment = await appendCopyrightSubmissionAssessment({
    submissionId: submission.id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  if (input.assessBeforeReceipt) {
    await recordClaimantReceipt(notice.id, submission.id, input.receiptIdempotencyKeyPrefix)
  }
  return { aggregate, claimant, moderator, notice, noticeAssessment }
}

async function recordClaimantReceipt(
  noticeId: string,
  submissionId: string,
  idempotencyKeyPrefix: string,
): Promise<void> {
  const correspondence = await createOutboundCopyrightCorrespondence({
    noticeId,
    submissionId,
    correspondenceKind: 'receipt',
    compositionKind: 'deterministic_template',
    bodyCiphertext: `receipt-${crypto.randomUUID()}`,
    draftedById: null,
  })
  await createCopyrightDeliveryIntent({
    noticeId,
    submissionId,
    correspondenceId: correspondence.id,
    recipientUserId: null,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_receipt',
    channel: 'email',
    idempotencyKey: `${idempotencyKeyPrefix}-${crypto.randomUUID()}`,
    recipientEmail: `tests+copyright-${crypto.randomUUID()}@voucha.ai`,
  })
}
