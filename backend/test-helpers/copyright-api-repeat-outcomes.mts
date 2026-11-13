import { expect } from 'vitest'
import type { createRequest } from './api/server.mts'
import { readApiRepeatState } from './copyright-api-repeat-state.mts'

type Input = {
  staff: ReturnType<typeof createRequest>
  actorId: string
  accountId: string
  noticeIds: string[]
}
/** A SERIAL disposition either voids precisely its incident plus history/clock, or writes nothing. */
export async function assertApiRepeatDisposition(
  input: Input & { noticeId: string; incidentId: string; rationale: string },
) {
  const before = await readApiRepeatState(input.accountId, input.noticeIds)
  const response = await input.staff
    .post(`/api/v1/copyright-repeat-infringer-incidents/${input.incidentId}/dispositions`)
    .send({ disposition: 'abusive', rationale: input.rationale })
  const after = await readApiRepeatState(input.accountId, input.noticeIds)
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
      value: { incident_id: input.incidentId },
      state: {
        ...before,
        cases: before.cases.map(row =>
          row.aggregate.notice.id === input.noticeId
            ? { ...row, clock: { ...row.clock, at: expect.any(Date) } }
            : row,
        ),
        incidents: before.incidents.map(row =>
          row.id === input.incidentId
            ? {
                ...row,
                is_operative: false,
                current_disposition: 'abusive',
                current_disposition_recorded_at: expect.any(Date),
                current_disposition_recorded_by_id: input.actorId,
                updated_at: expect.any(Date),
              }
            : row,
        ),
        dispositions: [
          ...before.dispositions,
          {
            id: expect.any(String),
            copyright_repeat_infringer_incident_id: input.incidentId,
            disposition: 'abusive',
            rationale_ciphertext: input.rationale,
            recorded_at: expect.any(Date),
            recorded_by_id: input.actorId,
            created_at: expect.any(Date),
            matchesCurrent: true,
          },
        ],
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    value: response.body.copyright_repeat_infringer_disposition,
    state: after,
  })
  for (const [index, row] of after.cases.entries())
    expect(row.clock.at.getTime()).toBeGreaterThanOrEqual(before.cases[index]!.clock.at.getTime())
}

/** Review outcomes use a normal transaction; the no-action subject must succeed with its full current tip/history. */
export async function assertApiRepeatNoAction(
  input: Input & { reviewId: string; rationale: string },
) {
  const before = await readApiRepeatState(input.accountId, input.noticeIds)
  const identity = before.identities.find(row => row.id === input.reviewId)
  if (!identity) throw new Error('Owned repeat review identity missing')
  const response = await input.staff
    .post(`/api/v1/copyright-repeat-infringer-reviews/${input.reviewId}/outcomes`)
    .send({ outcome: 'no_action', rationale: input.rationale })
    .expect(200)
  const after = await readApiRepeatState(input.accountId, input.noticeIds)
  expect(response.body).toEqual({
    copyright_repeat_infringer_review: {
      id: input.reviewId,
      account_user_id: input.accountId,
      outcome: 'no_action',
    },
  })
  expect(after).toEqual({
    ...before,
    account: before.account.map(row => ({
      ...row,
      current_open_review_identity_id: null,
      current_decided_review_identity_id: input.reviewId,
      current_outcome: 'no_action',
      current_outcome_at: expect.any(Date),
      current_outcome_by_id: input.actorId,
      current_outcome_rationale_ciphertext: input.rationale,
    })),
    reviews: [
      ...before.reviews,
      {
        id: expect.any(String),
        account_user_id: input.accountId,
        copyright_repeat_infringer_review_identity_id: input.reviewId,
        opened_at: identity.created_at,
        outcome: 'no_action',
        outcome_at: expect.any(Date),
        outcome_by_id: input.actorId,
        rationale_ciphertext: input.rationale,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
        matchesCurrent: true,
      },
    ],
  })
}
