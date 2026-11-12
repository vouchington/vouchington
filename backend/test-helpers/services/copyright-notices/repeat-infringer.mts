import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { insertCopyrightActionIntent } from '../../../services/copyright-notices/action-intent-insertion.mts'
import { applyCopyrightConfirmationConsequencesInTransaction } from '../../../services/copyright-notices/staydown-registration.mts'
import { createCopyrightRestrictionDecisionNoticesInTransaction } from '../../../services/copyright-notices/restriction-outcome-notices.mts'
import { createCopyrightReviewOutcomeNoticesInTransaction } from '../../../services/copyright-notices/review-outcome-notices.mts'
import {
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../entities/index.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import { completeCopyrightMandatoryHumanReview } from '../../../services/copyright-notices/index.mts'
import { seedCopyrightSubmissionAssessment } from '../../copyright-notice-submissions.mts'
import { createTestRepeatInfringerNotice } from '../../copyright-repeat-infringer.mts'
import { createCopyrightNoticeAggregate } from './create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'

export async function confirmTestRepeatInfringerNotice(
  posterId: string,
  moderator: PrivateUser,
  fixtureLabel: string = 'repeat outcome',
): Promise<string> {
  const postId = await insertTestPost({
    title: `${fixtureLabel} ${crypto.randomUUID()}`,
    slug: `${fixtureLabel.replaceAll(' ', '-')}-${crypto.randomUUID()}`,
    createdById: posterId,
    markdown: 'image',
  })
  const imageId = await insertTestImage(posterId)
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: null,
    claimantDisplayName: 'Claimant',
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
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  await seedConfirmedRepeatRestriction(
    notice.id,
    aggregate.targets[0].id,
    aggregate.targets[0].placement_revision,
    assessment.id,
    moderator,
  )
  return notice.id
}

export async function createTestRepeatInfringerRestriction(
  posterId: string,
  moderator: PrivateUser,
): Promise<{ noticeId: string; restrictionId: string; targetId: string }> {
  const fixture = await createTestRepeatInfringerNotice([posterId], moderator)
  const restriction = fixture.restrictions[0]
  if (!restriction) throw new Error('fixture restriction disappeared')
  await completeCopyrightMandatoryHumanReview({
    noticeId: fixture.noticeId,
    restrictionId: restriction.id,
    currentUser: moderator,
    action: 'confirm',
    rationale: 'The restriction remains appropriate after review.',
    reviewedAt: new Date(),
  })
  return {
    noticeId: fixture.noticeId,
    restrictionId: restriction.id,
    targetId: restriction.targetId,
  }
}

/** Confirmed dependency state; outcome tests still call the real administrative decisions. */
async function seedConfirmedRepeatRestriction(
  noticeId: string,
  targetId: string,
  revision: number,
  assessmentId: string,
  moderator: PrivateUser,
) {
  const imposedAt = new Date('2026-07-01T12:00:00.000Z')
  const reviewedAt = new Date('2026-07-02T12:00:00.000Z')
  const rationale = 'The restriction remains appropriate after review.'
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedConfirmedRepeatNotice */
    UPDATE copyright_notices SET accepted_at = ${imposedAt}, provisional_withholding_at = ${imposedAt}
    WHERE id = ${noticeId}`)
  const { rows } = await transaction<{ id: string }>(sql`/* seedConfirmedRepeatRestriction */
    INSERT INTO copyright_restrictions (copyright_notice_target_id, authorizing_assessment_id,
      imposed_at, human_reviewed_at, human_review_action, human_reviewed_by_id)
    VALUES (${targetId}, ${assessmentId}, ${imposedAt}, ${reviewedAt}, 'confirm', ${moderator.id}) RETURNING id`)
  const restriction = rows[0]
  if (!restriction) throw new Error('Owned confirmed restriction missing')
  await insertCopyrightActionIntent(transaction, restriction.id, revision, 'withhold')
  await createCopyrightRestrictionDecisionNoticesInTransaction(
    {
      noticeId,
      targetId,
      restrictionId: restriction.id,
      event: 'restricted',
    },
    transaction,
  )
  await createCopyrightReviewOutcomeNoticesInTransaction(
    {
      noticeId,
      restrictionId: restriction.id,
      action: 'confirm',
    },
    transaction,
  )
  await applyCopyrightConfirmationConsequencesInTransaction(noticeId, transaction)
  await transaction(sql`/* seedConfirmedRepeatHistory */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_restriction_id, review_action, review_rationale_ciphertext)
    VALUES (${noticeId}, 'provisional_restriction_imposed', NULL, ${restriction.id}, NULL, NULL),
      (${noticeId}, 'mandatory_human_review_completed', ${moderator.id}, ${restriction.id}, 'confirm',
        ${encryptSecret(rationale, `copyright-restriction-review:${restriction.id}`)})`)
  await transaction.commit()
}
