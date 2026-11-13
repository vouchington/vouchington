import { expect } from 'vitest'
import type { PrivateUser } from '../services/users/types.mts'
import type { createRequest } from './api/server.mts'
import { readTerritorialDecisionState } from './copyright-territorial-decision-state.mts'
import { territorialDecisionStages } from './copyright-territorial-decision-stages.mts'
import { territorialDecisionPlacements } from './copyright-territorial-decision-outcomes.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import {
  observeCopyrightOwnedHttp,
  copyrightHttpSerializationAbort,
} from './copyright-owned-http-serialization.mts'

/** A no-action review is one complete admission transaction, with its native abort witness. */
export async function assertUkRouteReview(input: {
  noticeId: string
  claimant: PrivateUser
  staff: PrivateUser
  claimantContact: string
  request: ReturnType<typeof createRequest>
}) {
  const scene = { ...input, posts: [], targets: [] }
  const decision = {
    text: 'Staff review rationale',
    publicExplanation: 'The notice did not establish infringement.',
    outcome: 'no_action' as const,
    targets: [],
  }
  const before = await readTerritorialDecisionState('uk', scene)
  const placements = await territorialDecisionPlacements(scene)
  const { response, nativeCodes } = await observeCopyrightOwnedHttp(input.noticeId, async () =>
    input.request.post(`/api/v1/copyright-uk-notices/${input.noticeId}/reviews`).send({
      rationale: decision.text,
      public_explanation: decision.publicExplanation,
      outcome: decision.outcome,
    }),
  )
  const after = await readTerritorialDecisionState('uk', scene)
  const stages = territorialDecisionStages(
    'uk',
    scene,
    decision,
    before,
    after,
    placements,
    await isCopyrightStaydownMatchingEnabled(),
  )
  expect([
    { outcome: copyrightHttpSerializationAbort, state: before },
    {
      outcome: {
        status: 201,
        code: undefined,
        message: undefined,
        nativeCodes: [],
        value: {
          id: after.decisions.at(-1)?.id,
          reviewed_at: expect.any(String),
          automation_disclosure: 'human',
        },
      },
      state: stages.at(-1),
    },
  ]).toContainEqual({
    outcome: {
      status: response.status,
      code: response.body.code,
      message: response.body.message,
      value: response.body.copyright_uk_review,
      nativeCodes,
    },
    state: after,
  })
}
