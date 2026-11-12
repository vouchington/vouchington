import { describe, expect, it } from 'vitest'
import { createTestUser, getTestPostImagePlacement } from '@voucha/test-helpers'
import { createHostedImagePost } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { acceptAndSupersedeCopyrightNotice } from '@voucha/test-helpers/copyright-restriction-assessment-race'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

async function createScene() {
  const [post, currentUser] = await Promise.all([
    createHostedImagePost('public'),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  const placement = await getTestPostImagePlacement(post.postId, post.imageId)
  if (!placement) throw new Error('Owned post placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date(),
    claimantUserId: null,
    claimantDisplayName: null,
    claimantContactCiphertext: 'Owned email notice.',
    workDescription: 'Owned photograph.',
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'email',
      bodyCiphertext: 'Owned email evidence.',
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId: post.imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  const submission = aggregate?.submissions[0]
  const target = aggregate?.targets[0]
  if (!submission || !target) throw new Error('Owned copyright evidence disappeared')
  const original = await appendCopyrightSubmissionAssessment({
    submissionId: submission.id,
    currentUser,
    assessedAt: new Date(),
    substantiallyCompliant: true,
  })
  return {
    noticeId: notice.id,
    acceptance: {
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: original.id,
      imposedAt: new Date(),
      imposedById: currentUser.id,
    },
    assessment: {
      submissionId: submission.id,
      currentUser,
      assessedAt: new Date(),
      substantiallyCompliant: true,
      supersedesAssessmentId: original.id,
    },
  }
}

describe('copyright enforcement and superseding assessment', () => {
  it('commits a valid restriction and rolls back the overlapping superseding assessment', async () => {
    const { noticeId, acceptance, assessment } = await createScene()
    const { restricted, assessed } = await acceptAndSupersedeCopyrightNotice(
      acceptance,
      assessment,
      'restriction',
    )
    expect(restricted).toMatchObject({
      status: 'fulfilled',
      value: {
        authorizing_assessment_id: acceptance.assessmentId,
        copyright_notice_target_id: acceptance.targetId,
        imposed_by_id: acceptance.imposedById,
      },
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(assessed).toMatchObject({
      status: 'rejected',
      reason: { status: 409, code: 'CONFLICT', cause: { code: '40001' } },
    })
    expect(aggregate?.submissions[0]).toMatchObject({
      current_assessment_identity_id: acceptance.assessmentId,
    })
    expect(aggregate?.assessments).toHaveLength(1)
    expect(aggregate?.restrictions).toEqual([
      expect.objectContaining({
        authorizing_assessment_id: acceptance.assessmentId,
        lifted_at: null,
      }),
    ])
    expect(aggregate?.actionIntents).toEqual([
      expect.objectContaining({ action: 'withhold', state: 'pending' }),
    ])
    expect(
      aggregate?.lifecycleEvents.filter(
        event => event.change_type === 'provisional_restriction_imposed',
      ),
    ).toHaveLength(1)
  })

  it('rolls back overlapping acceptance and rejects stale authority after the superseding commit', async () => {
    const { noticeId, acceptance, assessment } = await createScene()
    const { restricted, assessed } = await acceptAndSupersedeCopyrightNotice(
      acceptance,
      assessment,
      'assessment',
    )
    expect(restricted).toMatchObject({
      status: 'rejected',
      reason: { code: '40001' },
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(aggregate?.assessments).toHaveLength(2)
    const superseding = aggregate?.assessments.find(
      row => row.supersedes_assessment_id === acceptance.assessmentId,
    )
    expect(superseding).toMatchObject({ id: expect.any(String) })
    expect(assessed).toMatchObject({ status: 'fulfilled', value: { id: superseding?.id } })
    expect(aggregate?.submissions[0]).toMatchObject({
      current_assessment_identity_id: superseding?.id,
    })
    await expect(acceptCopyrightNoticeAndImposeRestriction(acceptance)).rejects.toMatchObject({
      status: 422,
      message: 'A current notice assessment is required before restriction',
    })
    expect(await getCopyrightNoticePrivateAggregate(noticeId)).toEqual(aggregate)
    expect(aggregate?.notice.accepted_at).toBeNull()
    expect(aggregate?.restrictions).toEqual([])
    expect(aggregate?.actionIntents).toEqual([])
    expect(
      aggregate?.lifecycleEvents.filter(
        event => event.change_type === 'provisional_restriction_imposed',
      ),
    ).toEqual([])
  })

  it('rolls back acceptance and restriction when the restriction write fails', async () => {
    const { noticeId, acceptance } = await createScene()
    const failure = new Error('Owned restriction write failed')
    await expect(
      observeTestPostgresClientQueries(
        () => acceptCopyrightNoticeAndImposeRestriction(acceptance),
        async query => {
          if (query.text.includes('/* acceptCopyrightNoticeAndImposeRestriction */')) throw failure
        },
      ),
    ).rejects.toBe(failure)
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(aggregate?.notice.accepted_at).toBeNull()
    expect(aggregate?.restrictions).toEqual([])
    expect(aggregate?.actionIntents).toEqual([])
    expect(
      aggregate?.lifecycleEvents.filter(
        event => event.change_type === 'provisional_restriction_imposed',
      ),
    ).toEqual([])
  })
})
