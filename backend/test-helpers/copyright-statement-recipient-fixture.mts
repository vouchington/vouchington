import { createTestUser, insertTestImage, insertTestPost, insertTestPostImage } from './index.mts'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { DELETED_USER_ID } from '../services/users/constants.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from '../services/copyright-notices/restrictions.mts'

export async function createMultiOwnerStatementFixture() {
  const [claimant, moderator, publicOwner, privateOwner] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser(),
    createTestUser(),
  ])
  const targets = await Promise.all(
    [publicOwner, privateOwner].map(async (owner, index) => {
      const postId = await insertTestPost({
        createdById: owner.id,
        title: 'Statement recipient scope',
        slug: crypto.randomUUID(),
        markdown: 'Image',
        privacy: index ? 'private' : 'public',
        broadcast: index ? 'users' : 'everyone',
      })
      const imageId = await insertTestImage(owner.id)
      const placementId = await insertTestPostImage({ postId, imageId })
      return {
        owner,
        postId,
        imageId,
        placementId,
        placementRevision: 1,
        bindingFamily: 'post' as const,
        hostedUseUrl: `https://voucha.ai/posts/${postId}`,
      }
    }),
  )
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date(),
    claimantUserId: claimant.id,
    claimantDisplayName: null,
    claimantContactCiphertext: 'private',
    workDescription: 'work',
    policyVersion: 'test',
    initialSubmission: { kind: 'notice', sourceKind: 'signed_in_form', bodyCiphertext: 'private' },
    targets,
  })
  const aggregate = (await getCopyrightNoticePrivateAggregate(notice.id))!
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date(),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  for (const target of aggregate.targets) {
    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: moderator.id,
    })
  }
  return { notice, targets, aggregate, moderator }
}

export async function markStatementPosterDeleted(userId: string): Promise<void> {
  await write(
    sql`/* markStatementPosterDeleted */ UPDATE users SET deleted_at = NOW() WHERE id = ${userId}`,
  )
}

export async function reassignStatementTargetToTombstone(targetId: string): Promise<void> {
  await write(sql`/* reassignStatementTargetToTombstone */
    UPDATE posts SET created_by_id = ${DELETED_USER_ID}
    FROM image_placements image, copyright_notice_targets target
    WHERE posts.id = image.post_id AND image.placement_id = target.placement_id AND target.id = ${targetId}
  `)
}

/** Hold the real account lifecycle key while a separate legal transition must fail without waiting. */
export async function withStatementPosterLifecycleFence(
  userId: string,
  operation: () => Promise<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    sql`/* withStatementPosterLifecycleFence */ SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
  )
  await operation()
  await transaction.commit()
}
