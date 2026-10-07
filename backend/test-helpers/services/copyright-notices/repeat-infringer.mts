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
import { createCopyrightNoticeAggregate } from './create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'

export async function createTestRepeatInfringerNotice(
  ownerIds: string[],
  moderator: PrivateUser,
): Promise<{
  noticeId: string
  restrictions: Array<{ id: string; targetId: string }>
}> {
  const targets = await Promise.all(
    ownerIds.map(async ownerId => {
      const postId = await insertTestPost({
        title: `copyright ${crypto.randomUUID()}`,
        slug: `copyright-${crypto.randomUUID()}`,
        createdById: ownerId,
        markdown: 'image',
      })
      const imageId = await insertTestImage(ownerId)
      await insertTestPostImage({ postId, imageId })
      const placement = await getTestPostImagePlacement(postId, imageId)
      if (!placement) throw new Error('Test placement missing')
      return {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post' as const,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      }
    }),
  )
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date(),
    claimantUserId: null,
    claimantDisplayName: 'Claimant',
    claimantContactCiphertext: crypto.randomUUID(),
    workDescription: crypto.randomUUID(),
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      bodyCiphertext: crypto.randomUUID(),
    },
    targets,
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('Test notice missing')
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0]!.id,
    assessedAt: new Date(),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const restrictions = []
  const targetsByPlacement = new Map(aggregate.targets.map(target => [target.placement_id, target]))
  for (const target of targets) {
    const saved = targetsByPlacement.get(target.placementId)
    if (!saved) throw new Error('Test target missing')
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: saved.id,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: null,
    })
    restrictions.push({ id: restriction.id, targetId: saved.id })
  }
  return { noticeId: notice.id, restrictions }
}

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
