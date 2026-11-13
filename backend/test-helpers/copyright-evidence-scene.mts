import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from './index.mts'
import {
  seedCopyrightSubmissionAssessment,
  seedCopyrightCounterNotice,
} from './copyright-notice-submissions.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createDeterministicCopyrightCorrespondenceInTransaction } from '../services/copyright-notices/correspondence.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'
import { appendCopyrightSubmissionAssessmentInTransaction } from '../services/copyright-notices/compliance.mts'
import { calculateUsCounterNoticeRestorationWindow } from '../services/copyright-notices/deadlines.mts'
import { createCounterNoticeForwardingInTransaction } from '../services/copyright-notices/counter-notice-forwarding.mts'
import { createCopyrightCounterReviewOutcome } from '../services/copyright-notices/counter-review-outcome.mts'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '../services/users/types.mts'
export async function createTwoTargetFixture() {
  const [claimant, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const imageIds = await Promise.all([insertTestImage(claimant.id), insertTestImage(claimant.id)])
  const postId = await insertTestPost({
    title: `copyright evidence ${crypto.randomUUID()}`,
    slug: `copyright-evidence-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'images',
  })
  await Promise.all(imageIds.map(imageId => insertTestPostImage({ postId, imageId })))
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: { kind: 'notice', sourceKind: 'signed_in_form', bodyCiphertext: 'notice' },
    targets: await Promise.all(
      imageIds.map(async imageId => {
        const placement = await getTestPostImagePlacement(postId, imageId)
        if (!placement) throw new Error('fixture image placement disappeared')
        return {
          placementId: placement.placement_id,
          placementRevision: placement.placement_revision,
          imageId,
          bindingFamily: 'post',
          hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
        }
      }),
    ),
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('fixture notice disappeared')
  const noticeAssessment = await seedCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  await seedEvidenceClaimantReceipt(notice.id, aggregate.submissions[0].id)
  return { aggregate, claimant, moderator, notice, noticeAssessment }
}

async function seedEvidenceClaimantReceipt(noticeId: string, submissionId: string) {
  await using transaction = await beginTransaction()
  const receipt = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId,
      submissionId,
      correspondenceKind: 'receipt',
      bodyText: 'Your notice was received.',
    },
    transaction,
  )
  await transaction(sql`/* seedEvidenceClaimantReceipt:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, copyright_notice_correspondence_id)
    VALUES (${noticeId}, 'outbound_correspondence_created', ${receipt.id})`)
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId,
      correspondenceId: receipt.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'email',
      idempotencyKey: `evidence-receipt-${crypto.randomUUID()}`,
      recipientEmail: `tests+${crypto.randomUUID()}@voucha.ai`,
    },
    transaction,
  )
  await transaction.commit()
}

export async function seedEvidenceCounterDeadline(input: {
  noticeId: string
  claimantId: string
  moderator: PrivateUser
  targetIds: string[]
}) {
  const { submission } = await seedCopyrightCounterNotice(
    input.noticeId,
    input.claimantId,
    input.targetIds,
  )
  await using transaction = await beginTransaction()
  const assessment = await appendCopyrightSubmissionAssessmentInTransaction(
    {
      submissionId: submission.id,
      currentUser: input.moderator,
      assessedAt: new Date(),
      substantiallyCompliant: true,
      targetIds: input.targetIds,
    },
    transaction,
  )
  const window = calculateUsCounterNoticeRestorationWindow(submission.received_at)
  const { rows } = await transaction<{
    id: string
    earliest_restoration_at: Date
  }>(sql`/* seedEvidenceCounterDeadline */
    INSERT INTO copyright_notice_deadlines (copyright_notice_id, qualifying_counter_notice_assessment_identity_id,
      earliest_restoration_at, escalation_at, restoration_deadline_at)
    VALUES (${input.noticeId}, ${assessment.id}, ${window.earliest_restoration_at}, ${window.escalation_at},
      ${window.restoration_deadline_at}) RETURNING id, earliest_restoration_at`)
  const deadline = rows[0]!
  await createCounterNoticeForwardingInTransaction(
    {
      assessmentId: assessment.id,
      earliestRestorationAt: deadline.earliest_restoration_at,
      aiAssisted: false,
    },
    transaction,
  )
  await transaction(sql`/* seedEvidenceCounterDeadline:review */
    INSERT INTO copyright_notice_counter_notice_reviews (copyright_notice_submission_id,
      copyright_notice_submission_assessment_identity_id, copyright_notice_deadline_id,
      reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext)
    VALUES (${submission.id}, ${assessment.id}, ${deadline.id}, CURRENT_TIMESTAMP, ${input.moderator.id}, true,
      ${encryptSecret('The structured counter-notice is formally complete.', `copyright-counter-review:${submission.id}`)})`)
  await transaction(sql`/* seedEvidenceCounterDeadline:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_submission_id, is_counter_notice_accepted)
    VALUES (${input.noticeId}, 'counter_notice_reviewed', ${input.moderator.id}, ${submission.id}, true)`)
  await createCopyrightCounterReviewOutcome(transaction, input.noticeId, submission.id, true, false)
  await transaction.commit()
  return deadline
}
