import { expect } from 'vitest'
import { recordEuCopyrightStatementOfReasons } from '../services/copyright-notices/eu-reasons.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import type { TerritorialCopyrightDecisionInput } from '../services/copyright-notices/territorial-decision.mts'
import {
  readTerritorialDecisionState,
  type TerritorialRestrictionScene,
} from './copyright-territorial-decision-state.mts'
import { territorialDecisionPlacements } from './copyright-territorial-decision-outcomes.mts'
import { territorialDecisionStages } from './copyright-territorial-decision-stages.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'

/** A renewed post-withdrawal decision may abort admission or a later target, never commit partial target facts. */
export async function assertRenewedTerritorialOutcome(
  scene: TerritorialRestrictionScene,
  input: TerritorialCopyrightDecisionInput,
) {
  const before = await readTerritorialDecisionState('eu_dsa', scene)
  const placements = await territorialDecisionPlacements(scene)
  const [result] = await Promise.allSettled([
    recordEuCopyrightStatementOfReasons(scene.staff, scene.noticeId, input),
  ])
  const after = await readTerritorialDecisionState('eu_dsa', scene)
  const stages = territorialDecisionStages(
    'eu_dsa',
    scene,
    input,
    before,
    after,
    placements,
    await isCopyrightStaydownMatchingEnabled(),
  )
  const abort = {
    status: 'rejected',
    statusCode: 409,
    code: 'CONFLICT',
    message: 'Conflicting copyright case change',
    causeCode: '40001',
  }
  expect([
    { outcome: abort, state: before },
    ...stages.slice(0, -1).map(state => ({ outcome: abort, state })),
    ...(stages.length
      ? [
          {
            outcome: {
              status: 'fulfilled',
              value: {
                id: after.decisions.at(-1)?.id,
                decided_at: expect.any(Date),
                automation_disclosure: 'human',
                outcome: input.outcome,
              },
            },
            state: stages.at(-1),
          },
        ]
      : []),
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
}
