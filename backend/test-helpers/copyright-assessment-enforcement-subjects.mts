import { expect } from 'vitest'
import { enforceCopyrightAssessment } from '../services/copyright-notices/enforce-assessment.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import {
  copyrightRestrictedRaceState,
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import { withCapturedTestQueries } from './query-capture.mts'
import { readTestOwnedCopyrightSweepIds } from './services/copyright-notices/sweep-ids.mts'
import { searchPendingCopyrightEnforcementAssessmentIds } from '../services/copyright-notices/enforcement-pending.mts'
import type { createCopyrightRestorationHoldFixture } from './copyright-restoration-hold-fixtures.mts'

type EnforcementFixture = Awaited<ReturnType<typeof createCopyrightRestorationHoldFixture>>

/** One real enforcement job either commits its complete restriction/account/notice contract or remains owed. */
export async function assertAssessmentEnforcement(scene: EnforcementFixture) {
  const [before, staydown] = await Promise.all([
    readEffectiveReviewState(scene.notice.id, [scene.claimant.id]),
    isCopyrightStaydownMatchingEnabled(),
  ])
  const {
    result: [result],
    queries,
  } = await withCapturedTestQueries(() =>
    Promise.allSettled([enforceCopyrightAssessment(scene.assessment.id)]),
  )
  const [after, pending] = await Promise.all([
    readEffectiveReviewState(scene.notice.id, [scene.claimant.id]),
    readTestOwnedCopyrightSweepIds(
      searchPendingCopyrightEnforcementAssessmentIds,
      scene.assessment.id,
    ),
  ])
  const restrictionId = after.state.restrictions[0]?.id
  const target = scene.aggregate.targets[0]!
  const success = {
    ...before,
    provenance: [{ account: scene.claimant.id, target: target.id }],
    accounts: before.accounts.map(row => ({
      ...row,
      incidents: [
        ...row.incidents,
        { notice: scene.notice.id, operative: true, disposition: null },
      ],
    })),
    state: {
      ...copyrightRestrictedRaceState(
        before.state,
        { assessmentId: scene.assessment.id, targetId: target.id, imposedById: scene.moderator.id },
        restrictionId,
        scene.claimant.id,
        target.placement_revision,
        staydown,
      ),
      deliveries: [
        ...before.state.deliveries,
        `poster_restriction_notice:email:${scene.claimant.id}`,
        `poster_restriction_notice:in_app:${scene.claimant.id}`,
        `claimant_decision_notice:email:${scene.claimant.id}`,
        `claimant_decision_notice:in_app:${scene.claimant.id}`,
      ].toSorted(),
    },
  }
  expect([
    { outcome: { status: 'fulfilled' }, state: success, pending: [] },
    {
      outcome: nativeCopyrightSerializationConflict,
      state: before,
      pending: [scene.assessment.id],
    },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(result!),
    state: after,
    pending,
  })
  return queries
}

/** A superseded or fully enforced assessment has no remaining writer, so its legal/account state is identical. */
export async function assertAssessmentEnforcementNoop(scene: EnforcementFixture) {
  const before = await readEffectiveReviewState(scene.notice.id, [scene.claimant.id])
  await expect(enforceCopyrightAssessment(scene.assessment.id)).resolves.toBeUndefined()
  expect(await readEffectiveReviewState(scene.notice.id, [scene.claimant.id])).toEqual(before)
}
