import { expect } from 'vitest'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import type { TerritorialCopyrightDecisionInput } from '../services/copyright-notices/territorial-decision.mts'
import {
  readTerritorialDecisionState,
  type TerritorialRestrictionScene,
} from './copyright-territorial-decision-state.mts'
import { territorialDecisionStages } from './copyright-territorial-decision-stages.mts'
import { territorialDecisionPlacements } from './copyright-territorial-decision-outcomes.mts'
import type { createRequest } from './api/server.mts'

/** One real HTTP decision couples its exact domain response to admission and target transactions. */
export async function assertTerritorialHttpDecisionOutcome(
  jurisdiction: 'eu_dsa' | 'uk',
  scene: TerritorialRestrictionScene,
  input: TerritorialCopyrightDecisionInput,
  staff: ReturnType<typeof createRequest>,
) {
  const before = await readTerritorialDecisionState(jurisdiction, scene)
  const placements = await territorialDecisionPlacements(scene)
  const base =
    jurisdiction === 'eu_dsa' ? '/api/v1/copyright-eu-notices' : '/api/v1/copyright-uk-notices'
  const response = await staff
    .post(
      `${base}/${scene.noticeId}/${jurisdiction === 'eu_dsa' ? 'statements-of-reasons' : 'reviews'}`,
    )
    .send({
      [jurisdiction === 'eu_dsa' ? 'statement' : 'rationale']: input.text,
      public_explanation: input.publicExplanation,
      outcome: input.outcome,
      ...(input.outcome === 'restrict'
        ? {
            targets: input.targets.map(target => ({
              surface: 'post-image',
              post_id: target.postId,
              image_id: target.imageId,
              target_url: target.hostedUseUrl,
            })),
          }
        : {}),
    })
  const after = await readTerritorialDecisionState(jurisdiction, scene)
  const stages = territorialDecisionStages(
    jurisdiction,
    scene,
    input,
    before,
    after,
    placements,
    await isCopyrightStaydownMatchingEnabled(),
  )
  const abort = {
    status: 409,
    code: 'CONFLICT',
    message: 'Conflicting copyright case change',
    value: undefined,
  }
  const decision = after.decisions.at(-1)
  const success = {
    status: 201,
    code: undefined,
    message: undefined,
    value:
      jurisdiction === 'eu_dsa'
        ? {
            id: decision?.id,
            decided_at: expect.any(String),
            automation_disclosure: 'human',
            outcome: input.outcome,
          }
        : { id: decision?.id, reviewed_at: expect.any(String), automation_disclosure: 'human' },
  }
  expect([
    { outcome: abort, state: before },
    ...stages.slice(0, -1).map(state => ({ outcome: abort, state })),
    { outcome: success, state: stages.at(-1) },
  ]).toContainEqual({
    outcome: {
      status: response.status,
      code: response.body.code,
      message: response.body.message,
      value:
        response.body[
          jurisdiction === 'eu_dsa' ? 'copyright_eu_statement_of_reasons' : 'copyright_uk_review'
        ],
    },
    state: after,
  })
}
