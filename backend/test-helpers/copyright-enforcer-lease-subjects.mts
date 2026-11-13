import { expect } from 'vitest'
import { enforceCopyrightAssessment } from '../services/copyright-notices/enforce-assessment.mts'
import { interceptCopyrightImpositionForTest } from './copyright-imposition-intercept.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import {
  copyrightRaceResult,
  copyrightRestrictedRaceState,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import type { createCopyrightRestorationHoldFixture } from './copyright-restoration-hold-fixtures.mts'

type Scene = Awaited<ReturnType<typeof createCopyrightRestorationHoldFixture>>

/** A completed sibling owns the full result, including when the earlier enforcer resumes with an error. */
export async function assertEnforcerCompletedSibling(scene: Scene, fail: boolean) {
  const before = await readEffectiveReviewState(scene.notice.id, [scene.claimant.id])
  const target = scene.aggregate.targets[0]!
  let committed = false
  interceptCopyrightImpositionForTest(scene.notice.id, async () => {
    await seedCopyrightStatementRestriction({
      noticeId: scene.notice.id,
      targetId: target.id,
      assessmentId: scene.assessment.id,
      revision: target.placement_revision,
      moderatorId: scene.moderator.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    })
    committed = true
    if (fail) throw new Error('stalled owner resumed')
  })
  const [result] = await Promise.allSettled([enforceCopyrightAssessment(scene.assessment.id)])
  expect(committed).toBe(true)
  const after = await readEffectiveReviewState(scene.notice.id, [scene.claimant.id])
  const restrictionId = after.state.restrictions[0]?.id
  const incident = { notice: scene.notice.id, operative: true, disposition: null }
  const success = {
    ...before,
    provenance: [{ account: scene.claimant.id, target: target.id }],
    accounts: before.accounts.map(row => ({ ...row, incidents: [...row.incidents, incident] })),
    state: {
      ...copyrightRestrictedRaceState(
        before.state,
        { assessmentId: scene.assessment.id, targetId: target.id, imposedById: scene.moderator.id },
        restrictionId,
        scene.claimant.id,
        target.placement_revision,
        await isCopyrightStaydownMatchingEnabled(),
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
    { outcome: { status: 'fulfilled' }, state: success },
    { outcome: nativeCopyrightSerializationConflict, state: success },
  ]).toContainEqual({
    outcome:
      result!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(result!),
    state: after,
  })
  const [replay] = await Promise.allSettled([enforceCopyrightAssessment(scene.assessment.id)])
  expect(replay).toEqual({ status: 'fulfilled', value: undefined })
  expect(await readEffectiveReviewState(scene.notice.id, [scene.claimant.id])).toEqual(after)
}

export async function assertOwedEnforcerFailure(scene: Scene) {
  const before = await readEffectiveReviewState(scene.notice.id, [scene.claimant.id])
  interceptCopyrightImpositionForTest(scene.notice.id, async () => {
    throw new Error('provider outage')
  })
  await expect(enforceCopyrightAssessment(scene.assessment.id)).rejects.toThrow('provider outage')
  expect(await readEffectiveReviewState(scene.notice.id, [scene.claimant.id])).toEqual(before)
  const [recovery] = await Promise.allSettled([enforceCopyrightAssessment(scene.assessment.id)])
  const after = await readEffectiveReviewState(scene.notice.id, [scene.claimant.id])
  const target = scene.aggregate.targets[0]!
  const restrictionId = after.state.restrictions[0]?.id
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
        await isCopyrightStaydownMatchingEnabled(),
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
    { outcome: { status: 'fulfilled' }, state: success },
    { outcome: nativeCopyrightSerializationConflict, state: before },
  ]).toContainEqual({
    outcome:
      recovery!.status === 'fulfilled' ? { status: 'fulfilled' } : copyrightRaceResult(recovery!),
    state: after,
  })
}
