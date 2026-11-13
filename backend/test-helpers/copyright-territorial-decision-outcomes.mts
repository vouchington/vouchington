import { expect } from 'vitest'
import { recordEuCopyrightStatementOfReasons } from '../services/copyright-notices/eu-reasons.mts'
import { recordUkCopyrightReview } from '../services/copyright-notices/uk-review.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import type { TerritorialCopyrightDecisionInput } from '../services/copyright-notices/territorial-decision.mts'
import { beginTransaction } from '@data-stores/psql'
import { resolveCopyrightPostImagePlacements } from '../services/copyright-notices/placement-resolution.mts'
import {
  readTerritorialDecisionState,
  type TerritorialRestrictionScene,
} from './copyright-territorial-decision-state.mts'
import { territorialDecisionStages } from './copyright-territorial-decision-stages.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { createRequest } from './api/server.mts'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'

const conflict = {
  status: 'rejected',
  statusCode: 409,
  code: 'CONFLICT',
  message: 'Conflicting copyright case change',
  causeCode: '40001',
}
const determine = { eu_dsa: recordEuCopyrightStatementOfReasons, uk: recordUkCopyrightReview }
export async function territorialDecisionPlacements(scene: TerritorialRestrictionScene) {
  await using transaction = await beginTransaction()
  const rows = await resolveCopyrightPostImagePlacements(scene.targets, transaction)
  await transaction.commit()
  return rows
}

/** A provider fault after admission cannot erase a complete decision or commit any failed target. */
export async function assertTerritorialInterruptedDecision(
  jurisdiction: 'eu_dsa' | 'uk',
  scene: TerritorialRestrictionScene,
  input: TerritorialCopyrightDecisionInput,
  message: string,
  committedTargets: number,
) {
  const before = await readTerritorialDecisionState(jurisdiction, scene)
  const placements = await territorialDecisionPlacements(scene)
  const [result] = await Promise.allSettled([
    determine[jurisdiction](scene.staff, scene.noticeId, input),
  ])
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
  expect([
    { outcome: conflict, state: before },
    ...stages.slice(0, committedTargets).map(state => ({ outcome: conflict, state })),
    { outcome: { status: 'rejected', message }, state: stages[committedTargets] },
  ]).toContainEqual({
    outcome:
      result!.status === 'rejected' &&
      result!.reason instanceof Error &&
      result!.reason.message === message
        ? { status: 'rejected', message }
        : copyrightRaceResult(result!),
    state: after,
  })
}

/** Both HTTP actors execute once; exact conflict responses are coupled to every committed stage. */
export async function assertTerritorialDecisionHttpRace(
  jurisdiction: 'eu_dsa' | 'uk',
  scene: TerritorialRestrictionScene,
  input: TerritorialCopyrightDecisionInput,
) {
  const before = await readTerritorialDecisionState(jurisdiction, scene)
  const placements = await territorialDecisionPlacements(scene)
  const staff = createRequest()
  await staff.authenticateAs(scene.staff)
  const url =
    jurisdiction === 'eu_dsa'
      ? `/api/v1/copyright-eu-notices/${scene.noticeId}/statements-of-reasons`
      : `/api/v1/copyright-uk-notices/${scene.noticeId}/reviews`
  const body = {
    [jurisdiction === 'eu_dsa' ? 'statement' : 'rationale']: input.text,
    public_explanation: input.publicExplanation,
    outcome: input.outcome,
    targets: input.targets.map(target => ({
      surface: 'post-image',
      post_id: target.postId,
      image_id: target.imageId,
      target_url: target.hostedUseUrl,
    })),
  }
  const responses = await Promise.all([staff.post(url).send(body), staff.post(url).send(body)])
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
  const guard = {
    status: 409,
    code: undefined,
    message: territorialLabels(jurisdiction).decisionExists,
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
  const allowed = [
    { outcomes: [abort, abort], state: before },
    ...stages.flatMap((state, index) => {
      const outcome = index === stages.length - 1 ? success : abort
      return [
        { outcomes: [outcome, abort], state },
        { outcomes: [abort, outcome], state },
        { outcomes: [outcome, guard], state },
        { outcomes: [guard, outcome], state },
      ]
    }),
  ]
  expect(allowed).toContainEqual({
    outcomes: responses.map(response => ({
      status: response.status,
      code: response.body.code,
      message: response.body.message,
      value:
        response.body[
          jurisdiction === 'eu_dsa' ? 'copyright_eu_statement_of_reasons' : 'copyright_uk_review'
        ],
    })),
    state: after,
  })
}
