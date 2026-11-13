import { recoverRejectedCopyrightFormReviewEffect } from '../services/copyright-notices/form-reviews-recovery.mts'
import { expect } from 'vitest'
import { reviewCopyrightFormIntake } from '../services/copyright-notices/form-reviews.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { effectiveReviewConflict } from './copyright-effective-review-outcomes.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import { readTestClaimantMisuseSummary } from './services/copyright-notices/claimant-abuse-fixtures.mts'

/** A replay of committed authority neither appends misuse nor leaves partial decision effects. */
export async function assertServiceFormDecisionReplay(
  input: Parameters<typeof reviewCopyrightFormIntake>[0],
  noticeId: string,
  claimantId: string,
) {
  const before = await readEffectiveReviewState(noticeId, [claimantId])
  const misuse = await readTestClaimantMisuseSummary(claimantId)
  const [result] = await Promise.allSettled([reviewCopyrightFormIntake(input)])
  const after = await readEffectiveReviewState(noticeId, [claimantId])
  expect([
    {
      outcome: {
        status: 'fulfilled',
        noticeId,
        submissionId: expect.any(String),
        is_accepted: input.is_accepted,
      },
      state: before,
      misuse,
    },
    { outcome: effectiveReviewConflict, state: before, misuse },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled'
        ? { status: 'fulfilled', ...result!.value }
        : copyrightRaceResult(result!),
    state: after,
    misuse: await readTestClaimantMisuseSummary(claimantId),
  })
}

/** Recovery of a fully committed rejection is an idempotent job even when its snapshot aborts. */
export async function assertServiceRejectedRecoveryReplay(intakeId: string, noticeId: string) {
  const before = await readEffectiveReviewState(noticeId, [])
  const [result] = await Promise.allSettled([recoverRejectedCopyrightFormReviewEffect(intakeId)])
  expect([
    { outcome: { status: 'fulfilled' }, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: before },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(result!),
    state: await readEffectiveReviewState(noticeId, []),
  })
}
