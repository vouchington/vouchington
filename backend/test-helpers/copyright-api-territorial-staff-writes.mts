import { expect } from 'vitest'
import type { createRequest } from './api/server.mts'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'
import { readTerritorialReviewState } from './copyright-territorial-review-state.mts'

type Request = ReturnType<typeof createRequest>
/** A first failed acknowledgment attempt changes only its owned row and legal clock. */
export async function assertApiTerritorialAcknowledgmentFailure(
  request: Request,
  jurisdiction: 'eu_dsa' | 'uk',
  noticeId: string,
) {
  const before = await readCopyrightApiTerritorialState(noticeId)
  expect(before.acknowledgments).toHaveLength(1)
  expect(before.acknowledgments[0]).toMatchObject({
    attempt_count: 0,
    last_attempt_at: null,
    acknowledged_at: null,
    exhausted_at: null,
  })
  const base =
    jurisdiction === 'eu_dsa' ? '/api/v1/copyright-eu-notices' : '/api/v1/copyright-uk-notices'
  const response = await request.post(`${base}/${noticeId}/acknowledgment-failures`)
  const after = await readCopyrightApiTerritorialState(noticeId)
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      value: undefined,
      state: before,
    },
    {
      status: 200,
      code: undefined,
      message: undefined,
      value: {
        id: before.acknowledgments[0]!.id,
        attempt_count: 1,
        last_attempt_at: expect.any(String),
        acknowledged_at: null,
        exhausted_at: null,
        escalated: false,
      },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        acknowledgments: [
          {
            ...before.acknowledgments[0],
            attempt_count: 1,
            last_attempt_at: expect.any(Date),
            updated_at: expect.any(Date),
          },
        ],
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    value: response.body.acknowledgment,
    state: after,
  })
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}

/** No-action complaint decisions atomically update the request, history, identity, notices and clock. */
export async function assertApiNoActionRedressDecision(input: {
  request: Request
  jurisdiction: 'eu_dsa' | 'uk'
  noticeId: string
  redressId: string
  actorId: string
  claimantId: string
  disposition: 'maintain' | 'revoke'
  rationale: string
}) {
  const before = await readTerritorialReviewState(input.jurisdiction, input.noticeId, [])
  expect(before.effective.state.targets).toEqual([])
  expect(before.effective.state.restrictions).toEqual([])
  const base =
    input.jurisdiction === 'eu_dsa'
      ? '/api/v1/copyright-eu-notices'
      : '/api/v1/copyright-uk-notices'
  const response = await input.request
    .post(`${base}/${input.noticeId}/redress-requests/${input.redressId}/decisions`)
    .send({ staff_disposition: input.disposition, rationale: input.rationale })
  const after = await readTerritorialReviewState(input.jurisdiction, input.noticeId, [])
  const created = after.history.find(row => row.request === input.redressId)
  const revoke = input.disposition === 'revoke'
  const notices = [
    ...(revoke
      ? [
          ...(input.jurisdiction === 'eu_dsa'
            ? [`claimant_decision_notice:email:${input.claimantId}`]
            : []),
          `claimant_decision_notice:in_app:${input.claimantId}`,
        ]
      : []),
    ...(input.jurisdiction === 'eu_dsa'
      ? [
          `redress_decision_notice:email:${input.claimantId}`,
          `redress_decision_notice:in_app:${input.claimantId}`,
        ]
      : []),
  ]
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      value: undefined,
      state: before,
    },
    {
      status: 201,
      code: undefined,
      message: undefined,
      value: {
        id: created?.id,
        decided_at: expect.any(String),
        staff_disposition: input.disposition,
      },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        identities: [...before.identities, { id: created?.id, request: input.redressId }],
        history: [
          ...before.history,
          {
            id: created?.id,
            request: input.redressId,
            actor: input.actorId,
            disposition: input.disposition,
            at: expect.any(Date),
            rationale: input.rationale,
          },
        ],
        requests: before.requests.map(row =>
          row.id === input.redressId
            ? {
                ...row,
                current_staff_decision_identity_id: created?.id,
                staff_disposition: input.disposition,
                decided_at: expect.any(Date),
                decided_by_id: input.actorId,
                rationale_ciphertext: expect.any(String),
                decodedRationale: input.rationale,
              }
            : row,
        ),
        effective: {
          ...before.effective,
          state: {
            ...before.effective.state,
            deliveries: [...before.effective.state.deliveries, ...notices].toSorted(),
            correspondence: [
              ...before.effective.state.correspondence,
              ...Array.from(
                { length: (revoke ? 1 : 0) + (input.jurisdiction === 'eu_dsa' ? 1 : 0) },
                () => 'decision_notice',
              ),
            ].toSorted(),
          },
        },
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    value:
      response.body[
        input.jurisdiction === 'eu_dsa'
          ? 'copyright_eu_redress_decision'
          : 'copyright_uk_redress_decision'
      ],
    state: after,
  })
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}
