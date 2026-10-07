import {
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../entities/index.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import { completeCopyrightMandatoryHumanReview } from '../../../services/copyright-notices/index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from '../../../services/copyright-notices/restrictions.mts'
import { appendCopyrightSubmissionAssessment } from '../../../services/copyright-notices/compliance.mts'
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
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const restriction = await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId: aggregate.targets[0].id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: null,
  })
  await completeCopyrightMandatoryHumanReview({
    noticeId: notice.id,
    restrictionId: restriction.id,
    currentUser: moderator,
    action: 'confirm',
    rationale: 'The restriction remains appropriate after review.',
    reviewedAt: new Date('2026-07-02T12:00:00.000Z'),
  })
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
