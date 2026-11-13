import { expect } from 'vitest'
import { enforceCopyrightAssessment } from '../services/copyright-notices/enforce-assessment.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import {
  readTerritorialDecisionState,
  type TerritorialRestrictionScene,
} from './copyright-territorial-decision-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
  copyrightRestrictedRaceState,
} from './copyright-assessment-race-outcomes.mts'

/** One precommitted human territorial target stays wholly owed or commits its whole imposition. */
export async function assertTerritorialOwedEnforcement(
  jurisdiction: 'eu_dsa' | 'uk',
  scene: TerritorialRestrictionScene,
) {
  const before = await readTerritorialDecisionState(jurisdiction, scene)
  const assessment = before.assessors[0]
  const target = before.effective.state.targets[0]
  if (!assessment || !target || before.effective.state.restrictions.length)
    throw new Error('Owned territorial owed prerequisite is incomplete')
  const [result] = await Promise.allSettled([enforceCopyrightAssessment(assessment.id)])
  const after = await readTerritorialDecisionState(jurisdiction, scene)
  const poster = scene.posts[0]!.poster.id
  const restricted = copyrightRestrictedRaceState(
    before.effective.state,
    { assessmentId: assessment.id, targetId: target.id, imposedById: scene.staff.id },
    after.effective.state.restrictions[0]?.id,
    poster,
    target.placement_revision,
    await isCopyrightStaydownMatchingEnabled(),
  )
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    {
      outcome: { status: 'fulfilled', value: undefined },
      state: {
        ...before,
        parent: { ...before.parent, clock: expect.any(Date) },
        notice: {
          ...before.notice,
          accepted_at: expect.any(Date),
          provisional_withholding_at: expect.any(Date),
        },
        effective: {
          ...before.effective,
          accounts: before.effective.accounts.map(account => ({
            ...account,
            incidents: [
              ...account.incidents,
              { notice: scene.noticeId, operative: true, disposition: null },
            ],
          })),
          provenance: [...before.effective.provenance, { account: poster, target: target.id }],
          state: {
            ...restricted,
            deliveries: [
              ...restricted.deliveries,
              ...(jurisdiction === 'eu_dsa'
                ? [`claimant_decision_notice:email:${scene.claimant.id}`]
                : []),
              `claimant_decision_notice:in_app:${scene.claimant.id}`,
            ].toSorted(),
          },
        },
      },
    },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
  expect(after.parent.clock.getTime()).toBeGreaterThanOrEqual(before.parent.clock.getTime())
}
