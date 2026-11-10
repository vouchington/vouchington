import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getModeratorActionRowsForTest,
  withFailingTransactionQueryOptionsForTest,
} from '@voucha/test-helpers'
import {
  confirmTestRepeatInfringerNotice,
  createTestRepeatInfringerRestriction,
} from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { getPrivateUserByAny } from '@services/users/get'
import { unsuspendUser } from '@services/users/suspension'
import {
  listCopyrightRepeatInfringerAccountsForNotice,
  createCopyrightAppeal,
  recordCopyrightRepeatInfringerReinstatement,
  recordCopyrightRepeatInfringerReviewOutcome,
  reviewCopyrightAppeal,
} from './index.mts'

describe('atomic copyright repeat-infringer outcomes', () => {
  it('rolls back a restricting outcome when its final moderator action write fails, then retries once', async () => {
    const [poster, moderator, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const firstNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const reviewId = (
      await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId)
    )[0]?.open_review_id
    if (!reviewId) throw new Error('open review disappeared')
    const input = {
      currentUser: admin,
      reviewId,
      outcome: 'restrict' as const,
      rationale: 'Two confirmed notices remain.',
      recordedAt: new Date('2026-07-04T12:00:00.000Z'),
    }

    await expect(
      withFailingTransactionQueryOptionsForTest('recordModeratorAction', options =>
        recordCopyrightRepeatInfringerReviewOutcome(input, options),
      ),
    ).rejects.toThrow('Injected query failure for recordModeratorAction')
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
    expect(await getModeratorActionRowsForTest({ targetUserId: poster.id })).toEqual([])
    expect(
      (await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId))[0],
    ).toEqual(expect.objectContaining({ open_review_id: reviewId }))

    await expect(recordCopyrightRepeatInfringerReviewOutcome(input)).resolves.toEqual(
      expect.objectContaining({ outcome: 'restrict' }),
    )
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: expect.any(Date) }),
    )
    expect(await getModeratorActionRowsForTest({ targetUserId: poster.id })).toEqual([
      expect.objectContaining({ action_type: 'suspend', actor_user_id: admin.id }),
    ])
  })

  it('keeps one outcome and one suspension when restrict and terminate race', async () => {
    const [poster, moderator, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const firstNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const reviewId = (
      await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId)
    )[0]?.open_review_id
    if (!reviewId) throw new Error('open review disappeared')
    const decision = {
      currentUser: admin,
      reviewId,
      rationale: 'Two confirmed notices remain.',
      recordedAt: new Date('2026-07-04T12:00:00.000Z'),
    }
    const outcomes = await Promise.allSettled([
      recordCopyrightRepeatInfringerReviewOutcome({ ...decision, outcome: 'restrict' }),
      recordCopyrightRepeatInfringerReviewOutcome({ ...decision, outcome: 'terminate' }),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(result => result.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ status: 409 }) }),
    ])
    expect(await getModeratorActionRowsForTest({ targetUserId: poster.id })).toEqual([
      expect.objectContaining({ action_type: 'suspend', actor_user_id: admin.id }),
    ])
  })

  it('keeps the termination gate until reinstatement commits, then allows unsuspend', async () => {
    const [poster, moderator, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const firstNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const reviewId = (
      await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId)
    )[0]?.open_review_id
    if (!reviewId) throw new Error('open review disappeared')
    await recordCopyrightRepeatInfringerReviewOutcome({
      currentUser: admin,
      reviewId,
      outcome: 'terminate',
      rationale: 'Two confirmed notices remain.',
      recordedAt: new Date('2026-07-04T12:00:00.000Z'),
    })
    await expect(unsuspendUser(admin, poster.id)).rejects.toMatchObject({ status: 409 })
    await recordCopyrightRepeatInfringerReinstatement({
      currentUser: admin,
      accountUserId: poster.id,
      rationale: 'The account may return after review.',
      recordedAt: new Date('2026-07-05T12:00:00.000Z'),
    })
    await expect(unsuspendUser(admin, poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
  })

  it('does not suspend when reversal commits before enforcement', async () => {
    const { poster, moderator, admin, reviewId, reverse, enforce } = await thresholdFixture()
    await reverse(moderator)
    await expect(enforce(admin, reviewId)).rejects.toMatchObject({ status: 409 })
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
  })

  it('suspends when enforcement commits before reversal', async () => {
    const { poster, moderator, admin, reviewId, reverse, enforce } = await thresholdFixture()
    await enforce(admin, reviewId)
    await reverse(moderator)
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: expect.any(Date) }),
    )
  })
})

async function thresholdFixture() {
  const [poster, moderator, admin] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
  ])
  const first = await createTestRepeatInfringerRestriction(poster.id, moderator)
  await createTestRepeatInfringerRestriction(poster.id, moderator)
  const account = (
    await listCopyrightRepeatInfringerAccountsForNotice(moderator, first.noticeId)
  )[0]
  const reviewId = account?.open_review_id
  if (!reviewId) throw new Error('open review disappeared')
  const appeal = await createCopyrightAppeal(poster, first.noticeId, crypto.randomUUID(), {
    reason: 'Please review.',
    targetIds: [first.targetId],
  })
  return {
    poster,
    moderator,
    admin,
    reviewId,
    reverse: (actor: typeof moderator) =>
      reviewCopyrightAppeal({
        submissionId: appeal.submission.id,
        currentUser: actor,
        recommendationId: null,
        manualFallbackReason: 'Manual review.',
        rationale: 'The evidence was reviewed.',
        decisions: [{ restrictionId: first.restrictionId, action: 'reverse' }],
      }),
    enforce: (actor: typeof admin, openReviewId: string) =>
      recordCopyrightRepeatInfringerReviewOutcome({
        currentUser: actor,
        reviewId: openReviewId,
        outcome: 'restrict',
        rationale: 'Two confirmed notices remain.',
        recordedAt: new Date(),
      }),
  }
}
