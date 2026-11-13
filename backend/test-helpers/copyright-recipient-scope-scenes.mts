import { getCopyrightClaimantEmail } from '../services/copyright-notices/claimant-email.mts'
import { createTestUser, insertTestImage, insertTestPost, insertTestPostImage } from './index.mts'
import { beginTransaction } from '@data-stores/psql'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { appendCopyrightSubmissionAssessmentInTransaction } from '../services/copyright-notices/compliance.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'

export async function createCommittedRecipientScopeScene() {
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
  await using transaction = await beginTransaction()
  const assessment = await appendCopyrightSubmissionAssessmentInTransaction(
    {
      submissionId: aggregate.submissions[0].id,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: true,
    },
    transaction,
  )
  await transaction.commit()
  for (const target of aggregate.targets) {
    await seedCopyrightStatementRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      revision: target.placement_revision,
      moderatorId: moderator.id,
    })
  }
  return { notice, targets, aggregate, moderator }
}

export async function readRecipientScopeRetainedEmail(noticeId: string) {
  await using transaction = await beginTransaction()
  const email = await getCopyrightClaimantEmail(noticeId, transaction)
  await transaction.commit()
  return email
}
