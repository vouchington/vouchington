import { describe, expect, it } from 'vitest'
import { createTestUser, getTestPostImagePlacement } from '@voucha/test-helpers'
import { createHostedImagePost } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { acceptAndSupersedeCopyrightNotice } from '@voucha/test-helpers/copyright-restriction-assessment-race'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { seedCopyrightSubmissionAssessment } from '@voucha/test-helpers/copyright-notice-submissions'
import { isCopyrightStaydownMatchingEnabled } from './config.mts'
import {
  copyrightRaceResult,
  assessmentSerializationConflict,
  nativeCopyrightSerializationConflict,
  readCopyrightAssessmentRaceState,
  copyrightRestrictedRaceState,
  copyrightSupersededRaceState,
} from '@voucha/test-helpers/copyright-assessment-race-outcomes'
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
  const original = await seedCopyrightSubmissionAssessment({
    submissionId: submission.id,
    currentUser,
    assessedAt: new Date(),
    substantiallyCompliant: true,
  })
  return {
    noticeId: notice.id,
    posterId: post.poster.id,
    revision: target.placement_revision,
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
  it.each(['restriction', 'assessment'] as const)(
    'keeps complete legal facts when %s reaches its write first',
    async first => {
      const { noticeId, acceptance, assessment, posterId, revision } = await createScene()
      const before = await readCopyrightAssessmentRaceState(noticeId)
      const staydown = await isCopyrightStaydownMatchingEnabled()
      const { restricted, assessed } = await acceptAndSupersedeCopyrightNotice(
        acceptance,
        assessment,
        first,
      )
      const after = await readCopyrightAssessmentRaceState(noticeId)
      const restrictionId = after.restrictions[0]?.id
      const supersedingId = after.assessments.find(
        row => row.supersedes === acceptance.assessmentId,
      )?.id
      const restrictedState = copyrightRestrictedRaceState(
        before,
        acceptance,
        restrictionId,
        posterId,
        revision,
        staydown,
      )
      const assessedState = copyrightSupersededRaceState(
        before,
        assessment.submissionId,
        acceptance.assessmentId,
        supersedingId,
      )
      // A failed transaction contributes no authority, restriction, action or audit side effects.
      expect([
        {
          restricted: {
            status: 'fulfilled',
            id: restrictionId,
            target: acceptance.targetId,
            assessment: acceptance.assessmentId,
            imposedBy: acceptance.imposedById,
            review: 'confirm',
            reviewer: acceptance.imposedById,
          },
          assessed: assessmentSerializationConflict,
          state: restrictedState,
        },
        {
          restricted: nativeCopyrightSerializationConflict,
          assessed: { status: 'fulfilled', id: supersedingId },
          state: assessedState,
        },
        {
          restricted: nativeCopyrightSerializationConflict,
          assessed: assessmentSerializationConflict,
          state: before,
        },
      ]).toContainEqual({
        restricted: copyrightRaceResult(restricted),
        assessed: copyrightRaceResult(assessed),
        state: after,
      })
    },
  )

  it('rejects stale authority after a committed superseding assessment without writing', async () => {
    const { noticeId, acceptance, assessment } = await createScene()
    await seedCopyrightSubmissionAssessment(assessment)
    const before = await getCopyrightNoticePrivateAggregate(noticeId)
    await expect(acceptCopyrightNoticeAndImposeRestriction(acceptance)).rejects.toMatchObject({
      status: 422,
      message: 'A current notice assessment is required before restriction',
    })
    expect(await getCopyrightNoticePrivateAggregate(noticeId)).toEqual(before)
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
