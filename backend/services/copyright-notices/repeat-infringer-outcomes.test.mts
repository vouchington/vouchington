import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getModeratorActionRowsForTest,
  getTestPostPublicationDirtyWorkForScope,
} from '@voucha/test-helpers'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { deleteUser } from '@services/users/delete'
import { getPrivateUserByAny } from '@services/users/get'
import { suspendUser, unsuspendUser } from '@services/users/suspension'
import { createCopyrightRestorationHoldFixture } from './evidence-and-holds-restoration-hold-fixtures.mts'
import {
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  listCopyrightRepeatInfringerAccountsForNotice,
  recordCopyrightRepeatInfringerReinstatement,
  recordCopyrightRepeatInfringerReviewOutcome,
  resolveCopyrightLegalHold,
} from './index.mts'
import { recordCopyrightRepeatInfringerDisposition } from './repeat-infringer-incidents.mts'

describe('copyright repeat-infringer review outcomes', () => {
  it('suspends only for an administrator and blocks unsuspend until reinstatement', async () => {
    const [poster, moderator, admin, member] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    expect(moderator.roles).toContain('moderator')
    const firstNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await expect(
      listCopyrightRepeatInfringerAccountsForNotice(member, firstNoticeId),
    ).rejects.toMatchObject({ status: 403 })
    const accounts = await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId)
    expect(accounts).toEqual([
      expect.objectContaining({
        account_user_id: poster.id,
        operative: true,
        open_review_id: expect.any(String),
        termination_in_effect: false,
      }),
    ])
    const reviewId = accounts[0]?.open_review_id
    if (!reviewId) throw new Error('open review disappeared')

    await expect(
      recordCopyrightRepeatInfringerReviewOutcome({
        currentUser: moderator,
        reviewId,
        outcome: 'restrict',
        rationale: 'Two confirmed notices remain.',
        recordedAt: new Date('2026-07-04T12:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )

    await recordCopyrightRepeatInfringerReviewOutcome({
      currentUser: admin,
      reviewId,
      outcome: 'terminate',
      rationale: 'Two confirmed notices remain after review.',
      recordedAt: new Date('2026-07-04T12:00:00.000Z'),
    })
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: expect.any(Date) }),
    )
    await expect(unsuspendUser(admin, poster.id)).rejects.toMatchObject({ status: 409 })
    await expect(
      recordCopyrightRepeatInfringerReinstatement({
        currentUser: moderator,
        accountUserId: poster.id,
        rationale: 'The termination should be lifted.',
        recordedAt: new Date('2026-07-05T12:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ status: 403 })
    await recordCopyrightRepeatInfringerReinstatement({
      currentUser: admin,
      accountUserId: poster.id,
      rationale: 'The termination should be lifted.',
      recordedAt: new Date('2026-07-05T12:00:00.000Z'),
    })
    await expect(unsuspendUser(admin, poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
    await expect(
      recordCopyrightRepeatInfringerReviewOutcome({
        currentUser: moderator,
        reviewId,
        outcome: 'warning',
        rationale: 'The review is already closed.',
        recordedAt: new Date('2026-07-06T12:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
  it('rejects restrict when fewer than two incidents remain and ignores an existing suspension', async () => {
    const [poster, moderator, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const firstNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const accounts = await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId)
    const incidentId = accounts[0]?.incident_id
    const reviewId = accounts[0]?.open_review_id
    if (!incidentId || !reviewId) throw new Error('review fixture disappeared')
    await recordCopyrightRepeatInfringerDisposition({
      currentUser: moderator,
      incidentId,
      disposition: 'duplicate',
      rationale: 'This notice duplicates an earlier confirmed case.',
      recordedAt: new Date('2026-07-03T12:00:00.000Z'),
    })
    await expect(
      recordCopyrightRepeatInfringerReviewOutcome({
        currentUser: admin,
        reviewId,
        outcome: 'restrict',
        rationale: 'Only one operative incident remains.',
        recordedAt: new Date('2026-07-04T12:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ status: 409 })

    const thirdNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await suspendUser(admin, poster.id, 'allow', 'already suspended')
    const before = await getPrivateUserByAny(poster.id)
    const dirtyBefore = await getTestPostPublicationDirtyWorkForScope({
      type: 'author',
      id: poster.id,
    })
    if (!before?.suspended_at || !dirtyBefore)
      throw new Error('initial suspension state disappeared')
    const reopened = await listCopyrightRepeatInfringerAccountsForNotice(moderator, thirdNoticeId)
    const reopenedReviewId = reopened[0]?.open_review_id
    if (!reopenedReviewId) throw new Error('second review disappeared')
    await expect(
      recordCopyrightRepeatInfringerReviewOutcome({
        currentUser: admin,
        reviewId: reopenedReviewId,
        outcome: 'restrict',
        rationale: 'The account is already suspended.',
        recordedAt: new Date('2026-07-07T12:00:00.000Z'),
      }),
    ).resolves.toEqual(expect.objectContaining({ outcome: 'restrict' }))
    expect(await getModeratorActionRowsForTest({ targetUserId: poster.id })).toEqual([
      expect.objectContaining({ action_type: 'suspend', actor_id: admin.id }),
    ])
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: before.suspended_at }),
    )
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'author', id: poster.id }),
    ).resolves.toEqual(
      expect.objectContaining({ id: dirtyBefore.id, generation: dirtyBefore.generation }),
    )
    await expect(
      recordCopyrightRepeatInfringerReviewOutcome({
        currentUser: moderator,
        reviewId: crypto.randomUUID(),
        outcome: 'warning',
        rationale: 'Missing review.',
        recordedAt: new Date('2026-07-07T12:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      recordCopyrightRepeatInfringerReviewOutcome({
        currentUser: moderator,
        reviewId: reopenedReviewId,
        outcome: 'warning',
        rationale: '   ',
        recordedAt: new Date('2026-07-07T12:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      recordCopyrightRepeatInfringerReinstatement({
        currentUser: admin,
        accountUserId: poster.id,
        rationale: 'No termination is in effect.',
        recordedAt: new Date('2026-07-08T12:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('refuses deletion for an operative incident and allows it once none remain', async () => {
    const [poster, moderator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const firstNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const secondNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await expect(deleteUser(poster, poster)).rejects.toMatchObject({ status: 409 })
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ id: poster.id }),
    )
    for (const noticeId of [firstNoticeId, secondNoticeId]) {
      const accounts = await listCopyrightRepeatInfringerAccountsForNotice(moderator, noticeId)
      const incidentId = accounts[0]?.incident_id
      if (!incidentId || !accounts[0]?.operative) continue
      await recordCopyrightRepeatInfringerDisposition({
        currentUser: moderator,
        incidentId,
        disposition: 'withdrawn',
        rationale: 'The claimant withdrew this notice.',
        recordedAt: new Date('2026-07-03T12:00:00.000Z'),
      })
    }
    await expect(deleteUser(poster, poster)).resolves.toEqual(
      expect.objectContaining({ requestId: expect.any(String) }),
    )
  })

  it('refuses deletion for an unresolved qualifying hold and allows it after resolution', async () => {
    const { aggregate, claimant, moderator, notice } = await createCopyrightRestorationHoldFixture()
    const holdSubmission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-02T13:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    const hold = await appendCopyrightLegalHoldAssessment({
      currentUser: moderator,
      submissionId: holdSubmission.id,
      assessedAt: new Date('2026-07-02T13:01:00.000Z'),
      fromOriginalClaimant: true,
      proceedingKind: 'ccb',
      ccbClaimKind: 'claim',
      commencedAt: new Date('2026-07-02T13:00:00.000Z'),
      receivedByDesignatedAgentAt: new Date('2026-07-02T13:00:00.000Z'),
      sameMaterial: true,
      targetIds: [aggregate.targets[0].id],
      rationale: 'Verified qualifying CCB filing.',
    })
    await expect(deleteUser(claimant, claimant)).rejects.toMatchObject({ status: 409 })
    await resolveCopyrightLegalHold({
      currentUser: moderator,
      assessmentId: hold.id,
      resolvedAt: new Date('2026-07-03T12:00:00.000Z'),
      resolutionKind: 'dismissed',
      rationale: 'The proceeding was dismissed.',
    })
    await expect(deleteUser(claimant, claimant)).resolves.toEqual(
      expect.objectContaining({ requestId: expect.any(String) }),
    )
  })
})
