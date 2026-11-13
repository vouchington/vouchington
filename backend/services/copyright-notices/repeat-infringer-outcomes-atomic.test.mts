import { createOwnedRepeatThresholdScene } from '@voucha/test-helpers/copyright-repeat-threshold-scenes'
import { readOwnedRepeatAtomicState } from '@voucha/test-helpers/copyright-repeat-atomic-state'
import { seedEffectiveAppealDecision } from '@voucha/test-helpers/copyright-effective-review-decisions'
import { assertEffectiveAppeal } from '@voucha/test-helpers/copyright-effective-review-subjects'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getModeratorActionRowsForTest,
  withFailingTransactionQueryOptionsForTest,
} from '@voucha/test-helpers'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { getPrivateUserByAny } from '@services/users/get'
import { unsuspendUser } from '@services/users/suspension'
import {
  listCopyrightRepeatInfringerAccountsForNotice,
  recordCopyrightRepeatInfringerReinstatement,
  recordCopyrightRepeatInfringerReviewOutcome,
} from './index.mts'

describe('atomic copyright repeat-infringer outcomes', () => {
  it('rolls back a restricting outcome when its final moderator action write fails and commits an independent decision', async () => {
    const [poster, moderator, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const firstNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const secondNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
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

    const before = await readOwnedRepeatAtomicState(poster.id, [firstNoticeId, secondNoticeId])
    await expect(
      withFailingTransactionQueryOptionsForTest('recordModeratorAction', options =>
        recordCopyrightRepeatInfringerReviewOutcome(input, options),
      ),
    ).rejects.toThrow('Injected query failure for recordModeratorAction')
    expect(await readOwnedRepeatAtomicState(poster.id, [firstNoticeId, secondNoticeId])).toEqual(
      before,
    )
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
    expect(await getModeratorActionRowsForTest({ targetUserId: poster.id })).toEqual([])
    expect(
      (await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId))[0],
    ).toEqual(expect.objectContaining({ open_review_id: reviewId }))

    const independent = await createOwnedRepeatThresholdScene()
    await expect(
      recordCopyrightRepeatInfringerReviewOutcome(independent.enforcement),
    ).resolves.toEqual({
      id: independent.reviewId,
      account_user_id: independent.poster.id,
      outcome: 'restrict',
    })
    await expect(getPrivateUserByAny(independent.poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: expect.any(Date) }),
    )
    expect(await getModeratorActionRowsForTest({ targetUserId: independent.poster.id })).toEqual([
      expect.objectContaining({ action_type: 'suspend', actor_user_id: independent.admin.id }),
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
    const scene = await createOwnedRepeatThresholdScene()
    await seedEffectiveAppealDecision(scene.reversal, scene.first.noticeId)
    const before = await readOwnedRepeatAtomicState(scene.poster.id, [
      scene.first.noticeId,
      scene.second.noticeId,
    ])
    await expect(
      recordCopyrightRepeatInfringerReviewOutcome(scene.enforcement),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Restrict and terminate require two is_operative incidents',
    })
    expect(
      await readOwnedRepeatAtomicState(scene.poster.id, [
        scene.first.noticeId,
        scene.second.noticeId,
      ]),
    ).toEqual(before)
    await expect(getPrivateUserByAny(scene.poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
  })

  it('suspends when enforcement commits before reversal', async () => {
    const actual = await createOwnedRepeatThresholdScene()
    await recordCopyrightRepeatInfringerReviewOutcome(actual.enforcement)
    await assertEffectiveAppeal(
      actual.first,
      actual.poster,
      actual.moderator,
      'reverse',
      { [actual.poster.id]: false },
      0,
      actual.appeal.submission.id,
    )
    await expect(getPrivateUserByAny(actual.poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: expect.any(Date) }),
    )
    // An independent committed reversal also preserves the already imposed suspension.
    const committed = await createOwnedRepeatThresholdScene()
    await recordCopyrightRepeatInfringerReviewOutcome(committed.enforcement)
    await seedEffectiveAppealDecision(committed.reversal, committed.first.noticeId)
    await expect(getPrivateUserByAny(committed.poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: expect.any(Date) }),
    )
  })
})
