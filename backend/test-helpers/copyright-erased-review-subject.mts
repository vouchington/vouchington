import { expect } from 'vitest'
import {
  recoverRejectedCopyrightFormReviewEffect,
  searchRecoverableCopyrightFormReviewIntakeIds,
} from '../services/copyright-notices/form-reviews-recovery.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { readTestOwnedCopyrightSweepIds } from './services/copyright-notices/sweep-ids.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import type { createErasedReviewScene } from './copyright-erased-review-scenes.mts'

/** An erased reviewer cannot create a false human assessment; projection and reversal each commit completely. */
export async function assertErasedReviewRecovery(
  scene: Awaited<ReturnType<typeof createErasedReviewScene>>,
) {
  const noticeId = scene.notice.intake.copyright_notice_id
  const intakeId = scene.notice.intake.id
  const before = await readEffectiveReviewState(noticeId, [scene.claimant.id])
  const restriction = before.state.restrictions[0]!
  const target = before.state.targets[0]!
  await expect(
    readTestOwnedCopyrightSweepIds(searchRecoverableCopyrightFormReviewIntakeIds, intakeId),
  ).resolves.toEqual([intakeId])
  const projected = {
    ...before,
    state: {
      ...before.state,
      deliveries: [
        ...before.state.deliveries,
        `claimant_decision_notice:email:${scene.claimant.id}`,
        `claimant_decision_notice:in_app:${scene.claimant.id}`,
      ].toSorted(),
      correspondence: [...before.state.correspondence, 'decision_notice' as const].toSorted(),
    },
  }
  const reversed = {
    ...projected,
    state: {
      ...projected.state,
      restrictions: projected.state.restrictions.map(row =>
        row.id === restriction.id ? { ...row, review: 'reverse' as const, reviewer: null } : row,
      ),
      actions: [
        ...projected.state.actions,
        {
          id: expect.any(String),
          restriction: restriction.id,
          deadline: null,
          revision: target.placement_revision,
          action: 'restore',
          state: 'pending',
        },
      ],
      events: [...projected.state.events, 'reversal_restoration_intent_created'].toSorted(),
      deliveries: [
        ...projected.state.deliveries,
        `poster_review_notice:email:${scene.claimant.id}`,
        `poster_review_notice:in_app:${scene.claimant.id}`,
        `claimant_decision_notice:email:${scene.claimant.id}`,
        `claimant_decision_notice:in_app:${scene.claimant.id}`,
      ].toSorted(),
      correspondence: [
        ...projected.state.correspondence,
        'decision_notice' as const,
        'decision_notice' as const,
      ].toSorted(),
    },
  }
  const [result] = await Promise.allSettled([recoverRejectedCopyrightFormReviewEffect(intakeId)])
  const [after, pending] = await Promise.all([
    readEffectiveReviewState(noticeId, [scene.claimant.id]),
    readTestOwnedCopyrightSweepIds(searchRecoverableCopyrightFormReviewIntakeIds, intakeId),
  ])
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before, pending: [intakeId] },
    { outcome: nativeCopyrightSerializationConflict, state: projected, pending: [intakeId] },
    { outcome: { status: 'fulfilled' }, state: reversed, pending: [] },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(result!),
    state: after,
    pending,
  })
}
