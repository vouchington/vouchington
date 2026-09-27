import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getModeratorActionRowsForTest,
  getTestPostPublicationDirtyWorkForScope,
  withFailingTransactionQueryOptionsForTest,
} from '@voucha/test-helpers'
import {
  confirmTestRepeatInfringerNotice,
  createTestRepeatInfringerRestriction,
} from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import {
  observeTestRepeatInfringerAuthorLock,
  raceTestRepeatInfringerAuthorLock,
  readTestRepeatInfringerEnforcementState,
} from '@voucha/test-helpers/copyright-repeat-infringer'
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
      await getTestPostPublicationDirtyWorkForScope({ type: 'author', id: poster.id }),
    ).toBeUndefined()
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
      expect.objectContaining({ action_type: 'suspend', actor_id: admin.id }),
    ])
    expect(
      await getTestPostPublicationDirtyWorkForScope({ type: 'author', id: poster.id }),
    ).toEqual(
      expect.objectContaining({ reasons: expect.arrayContaining(['author_suspension_changed']) }),
    )
  })

  it('does not decide a restricting outcome before the canonical author lock permits suspension', async () => {
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
    const observed = await observeTestRepeatInfringerAuthorLock({
      accountId: poster.id,
      operation: () =>
        recordCopyrightRepeatInfringerReviewOutcome({
          currentUser: admin,
          reviewId,
          outcome: 'restrict',
          rationale: 'Two confirmed notices remain.',
          recordedAt: new Date('2026-07-04T12:00:00.000Z'),
        }),
      observe: () => readTestRepeatInfringerEnforcementState({ accountId: poster.id, reviewId }),
    })
    expect(observed.observation).toEqual({ outcome: null, suspended: false })
    expect(observed.result).toEqual(expect.objectContaining({ outcome: 'restrict' }))
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: expect.any(Date) }),
    )
  })

  it('serializes concurrent restrict and terminate decisions to one outcome and one suspension action', async () => {
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
    const outcomes = await raceTestRepeatInfringerAuthorLock({
      accountId: poster.id,
      operations: [
        () =>
          recordCopyrightRepeatInfringerReviewOutcome({
            currentUser: admin,
            reviewId,
            outcome: 'restrict',
            rationale: 'Two confirmed notices remain.',
            recordedAt: new Date('2026-07-04T12:00:00.000Z'),
          }),
        () =>
          recordCopyrightRepeatInfringerReviewOutcome({
            currentUser: admin,
            reviewId,
            outcome: 'terminate',
            rationale: 'Two confirmed notices remain.',
            recordedAt: new Date('2026-07-04T12:00:00.000Z'),
          }),
      ],
    })
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(result => result.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ status: 409 }) }),
    ])
    expect(await getModeratorActionRowsForTest({ targetUserId: poster.id })).toEqual([
      expect.objectContaining({ action_type: 'suspend', actor_id: admin.id }),
    ])
    expect(
      await getTestPostPublicationDirtyWorkForScope({ type: 'author', id: poster.id }),
    ).toEqual(
      expect.objectContaining({ reasons: expect.arrayContaining(['author_suspension_changed']) }),
    )
  })

  it('serializes reinstatement with unsuspend, retaining the termination gate until reinstatement commits', async () => {
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

    const results = await raceTestRepeatInfringerAuthorLock({
      accountId: poster.id,
      operations: [
        () => unsuspendUser(admin, poster.id),
        () =>
          recordCopyrightRepeatInfringerReinstatement({
            currentUser: admin,
            accountUserId: poster.id,
            rationale: 'The account may return after review.',
            recordedAt: new Date('2026-07-05T12:00:00.000Z'),
          }),
      ],
    })
    expect(results[0]).toEqual(
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409 }),
      }),
    )
    expect(results[1]).toEqual(expect.objectContaining({ status: 'fulfilled' }))
    await expect(unsuspendUser(admin, poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
  })

  it('rechecks the threshold in either deterministic reversal and enforcement order', async () => {
    for (const reversalFirst of [true, false]) {
      const [poster, moderator, admin] = await Promise.all([
        createTestUser(),
        createTestUser({ extraRoles: ['moderator'] }),
        createTestUser({ administrator: true }),
      ])
      const first = await createTestRepeatInfringerRestriction(poster.id, moderator)
      const second = await createTestRepeatInfringerRestriction(poster.id, moderator)
      const account = (
        await listCopyrightRepeatInfringerAccountsForNotice(moderator, first.noticeId)
      )[0]
      const reviewId = account?.open_review_id
      if (!reviewId) throw new Error('open review disappeared')
      const appeal = await createCopyrightAppeal(poster, first.noticeId, crypto.randomUUID(), {
        reason: 'Please review.',
        targetIds: [first.targetId],
      })
      const reverse = () =>
        reviewCopyrightAppeal({
          submissionId: appeal.submission.id,
          currentUser: moderator,
          recommendationId: null,
          manualFallbackReason: 'Manual review.',
          rationale: 'The evidence was reviewed.',
          decisions: [{ restrictionId: first.restrictionId, action: 'reverse' }],
        })
      const enforce = () =>
        recordCopyrightRepeatInfringerReviewOutcome({
          currentUser: admin,
          reviewId,
          outcome: 'restrict',
          rationale: 'Two confirmed notices remain.',
          recordedAt: new Date(),
        })
      const results = await raceTestRepeatInfringerAuthorLock({
        accountId: poster.id,
        operations: reversalFirst ? [reverse, enforce] : [enforce, reverse],
      })
      const dispositions = results.map(result =>
        result.status === 'rejected' ? (result.reason as { status?: number }).status : 'fulfilled',
      )
      expect(dispositions).toEqual(reversalFirst ? ['fulfilled', 409] : ['fulfilled', 'fulfilled'])
      const current = await getPrivateUserByAny(poster.id)
      expect(current?.suspended_at === null ? 'not-suspended' : 'suspended').toBe(
        reversalFirst ? 'not-suspended' : 'suspended',
      )
      void second
    }
  })
})
