import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  appendCopyrightSubmissionAssessment,
  createCopyrightNoticeAggregate,
  getCopyrightNoticePrivateAggregate,
} from './index.mts'
import { getOrCreateEmailAssessment } from './email-assessment.mts'

describe('getOrCreateEmailAssessment', () => {
  it('reuses the current compliant assessment when concurrent reviewers race', async () => {
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const poster = await createTestUser()
    const postId = await insertTestPost({
      title: `email assessment ${crypto.randomUUID()}`,
      slug: `email-assessment-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date(),
      claimantUserId: null,
      claimantDisplayName: 'Claimant',
      claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
      workDescription: 'Original photograph',
      policyVersion: 'test-v1',
      initialSubmission: { kind: 'notice', sourceKind: 'email', bodyCiphertext: 'ciphertext' },
      targets: [
        {
          placementKey: `post-image:${postId}:${imageId}`,
          placementRevision: 1,
          imageId,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    const submissionId = aggregate?.submissions[0]?.id
    if (!submissionId) throw new Error('email submission missing')
    const [first, second] = await Promise.all([
      getOrCreateEmailAssessment(moderator, { noticeId: notice.id, submissionId }),
      getOrCreateEmailAssessment(moderator, { noticeId: notice.id, submissionId }),
    ])
    expect(first.id).toBe(second.id)
  })

  it('fails closed when a non-compliant current assessment blocks a compliant create', async () => {
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const poster = await createTestUser()
    const postId = await insertTestPost({
      title: `email assessment conflict ${crypto.randomUUID()}`,
      slug: `email-assessment-conflict-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date(),
      claimantUserId: null,
      claimantDisplayName: 'Claimant',
      claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
      workDescription: 'Original photograph',
      policyVersion: 'test-v1',
      initialSubmission: { kind: 'notice', sourceKind: 'email', bodyCiphertext: 'ciphertext' },
      targets: [
        {
          placementKey: `post-image:${postId}:${imageId}`,
          placementRevision: 1,
          imageId,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    const submissionId = aggregate?.submissions[0]?.id
    if (!submissionId) throw new Error('email submission missing')
    const compliant = await appendCopyrightSubmissionAssessment({
      submissionId,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: true,
    })
    await appendCopyrightSubmissionAssessment({
      submissionId,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: false,
      supersedesAssessmentId: compliant.id,
    })
    await expect(
      getOrCreateEmailAssessment(moderator, { noticeId: notice.id, submissionId }),
    ).rejects.toMatchObject({ status: 409 })
  })
})
