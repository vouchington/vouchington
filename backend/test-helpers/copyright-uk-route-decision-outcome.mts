import { expect } from 'vitest'
import type { createRequest } from './api/server.mts'
import { readTerritorialReviewState } from './copyright-territorial-review-state.mts'
import {
  observeCopyrightOwnedHttp,
  copyrightHttpSerializationAbort,
} from './copyright-owned-http-serialization.mts'

/** Maintaining a no-action review atomically appends history and advances only its owned request. */
export async function assertUkRouteRedressDecision(input: {
  request: ReturnType<typeof createRequest>
  noticeId: string
  redressId: string
  staffId: string
}) {
  const before = await readTerritorialReviewState('uk', input.noticeId, [])
  const rationale = 'Staff kept the recorded review'
  const { response, nativeCodes } = await observeCopyrightOwnedHttp(input.noticeId, async () =>
    input.request
      .post(
        `/api/v1/copyright-uk-notices/${input.noticeId}/redress-requests/${input.redressId}/decisions`,
      )
      .send({ staff_disposition: 'maintain', rationale }),
  )
  const after = await readTerritorialReviewState('uk', input.noticeId, [])
  const created = after.history.find(row => row.request === input.redressId)
  expect([
    { outcome: copyrightHttpSerializationAbort, state: before },
    {
      outcome: {
        status: 201,
        code: undefined,
        message: undefined,
        nativeCodes: [],
        value: { id: created?.id, decided_at: expect.any(String), staff_disposition: 'maintain' },
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
            actor: input.staffId,
            disposition: 'maintain',
            at: expect.any(Date),
            rationale,
          },
        ],
        requests: before.requests.map(row =>
          row.id === input.redressId
            ? {
                ...row,
                current_staff_decision_identity_id: created?.id,
                staff_disposition: 'maintain',
                decided_at: expect.any(Date),
                decided_by_id: input.staffId,
                rationale_ciphertext: expect.any(String),
                decodedRationale: rationale,
              }
            : row,
        ),
      },
    },
  ]).toContainEqual({
    outcome: {
      status: response.status,
      code: response.body.code,
      message: response.body.message,
      value: response.body.copyright_uk_redress_decision,
      nativeCodes,
    },
    state: after,
  })
}
