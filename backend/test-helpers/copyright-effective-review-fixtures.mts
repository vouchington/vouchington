import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from './index.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightUnreviewedRestriction } from './copyright-assessment-race-fixtures.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** Owned live placements and committed unreviewed legal authority; no competing admission request. */
export async function createEffectiveReviewNotice(ownerIds: string[], moderator: PrivateUser) {
  const targets = []
  for (const ownerId of ownerIds) {
    const postId = await insertTestPost({
      title: `copyright ${crypto.randomUUID()}`,
      slug: `copyright-${crypto.randomUUID()}`,
      createdById: ownerId,
      markdown: 'image',
    })
    const imageId = await insertTestImage(ownerId)
    await insertTestPostImage({ postId, imageId })
    const placement = await getTestPostImagePlacement(postId, imageId)
    if (!placement) throw new Error('Owned placement missing')
    targets.push({
      placementId: placement.placement_id,
      placementRevision: placement.placement_revision,
      imageId,
      bindingFamily: 'post' as const,
      hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
    })
  }
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T12:00:00.000Z'),
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
  if (!aggregate) throw new Error('Owned notice missing')
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0]!.id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const restrictions = []
  const savedByPlacement = new Map(aggregate.targets.map(row => [row.placement_id, row]))
  for (const target of targets) {
    const saved = savedByPlacement.get(target.placementId)!
    const restriction = await seedCopyrightUnreviewedRestriction({
      noticeId: notice.id,
      targetId: saved.id,
      assessmentId: assessment.id,
      revision: saved.placement_revision,
    })
    restrictions.push({
      id: restriction.id,
      targetId: saved.id,
      imageId: target.imageId,
      revision: target.placementRevision,
    })
  }
  const owners: Record<string, string[]> = {}
  for (const [index, owner] of ownerIds.entries())
    (owners[owner] ??= []).push(restrictions[index]!.targetId)
  return { noticeId: notice.id, restrictions, owners }
}

export async function createEffectiveStaydownNotice(targetCount = 1) {
  const [claimant, actor] = await Promise.all([createTestUserDirect(), createTestUserDirect()])
  const moderator = { ...actor, roles: ['moderator'] } as typeof actor
  const fixture = await createEffectiveReviewNotice(
    Array<string>(targetCount).fill(claimant.id),
    moderator,
  )
  return { ...fixture, claimant, moderator }
}
