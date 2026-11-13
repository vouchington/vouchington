import { expect } from 'vitest'
import { decryptSecret } from '@modules/token-secrets'
import type { createRequest } from './api/server.mts'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'
import {
  observeCopyrightOwnedHttp,
  copyrightHttpSerializationAbort,
} from './copyright-owned-http-serialization.mts'

type Request = ReturnType<typeof createRequest>

/** One failed-delivery route changes only its receipt attempt and legal clock, or nothing. */
export async function assertUkRouteAcknowledgmentFailure(request: Request, noticeId: string) {
  const before = await readCopyrightApiTerritorialState(noticeId)
  const receipt = before.acknowledgments[0]
  if (!receipt) throw new Error('Owned UK acknowledgment missing')
  const { response, nativeCodes } = await observeCopyrightOwnedHttp(noticeId, async () =>
    request.post(`/api/v1/copyright-uk-notices/${noticeId}/acknowledgment-failures`),
  )
  const after = await readCopyrightApiTerritorialState(noticeId)
  const at = after.acknowledgments[0]?.last_attempt_at
  if (at !== null && !(at instanceof Date))
    throw new Error('Owned UK acknowledgment has an invalid attempt timestamp')
  expect([
    { outcome: copyrightHttpSerializationAbort, state: before },
    {
      outcome: {
        status: 200,
        code: undefined,
        message: undefined,
        nativeCodes: [],
        value: {
          id: receipt.id,
          attempt_count: 1,
          last_attempt_at: at?.toISOString(),
          acknowledged_at: null,
          exhausted_at: null,
          escalated: false,
        },
      },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        acknowledgments: [
          {
            ...receipt,
            attempt_count: 1,
            last_attempt_at: expect.any(Date),
            acknowledged_at: null,
            updated_at: expect.any(Date),
          },
        ],
      },
    },
  ]).toContainEqual({
    outcome: {
      status: response.status,
      code: response.body.code,
      message: response.body.message,
      value: response.body.acknowledgment,
      nativeCodes,
    },
    state: after,
  })
}

/** Staff-recorded redress retains its exact current-decision authority and encrypted explanation. */
export async function assertUkRouteRedress(input: {
  request: Request
  noticeId: string
  staffId: string
  key: string
}) {
  const before = await readCopyrightApiTerritorialState(input.noticeId)
  const { response, nativeCodes } = await observeCopyrightOwnedHttp(input.noticeId, async () =>
    input.request
      .post(`/api/v1/copyright-uk-notices/${input.noticeId}/redress-requests`)
      .set('Idempotency-Key', input.key)
      .send({ explanation: 'Please review this notice' }),
  )
  const after = await readCopyrightApiTerritorialState(input.noticeId)
  const row = after.requests.find(item => item.idempotency_key === input.key)
  const parent = before.parent[0]
  if (!parent) throw new Error('Owned UK redress parent missing')
  expect([
    { outcome: copyrightHttpSerializationAbort, state: before },
    {
      outcome: {
        status: 201,
        code: undefined,
        message: undefined,
        nativeCodes: [],
        value: { id: row?.id, is_duplicate: false },
      },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        requests: [
          ...before.requests,
          expect.objectContaining({
            id: expect.any(String),
            copyright_notice_id: input.noticeId,
            jurisdiction: 'uk',
            copyright_territorial_decision_id: parent.current_territorial_decision_identity_id,
            challenged_decision_outcome: 'no_action',
            authorizing_assessment_identity_id: null,
            submitted_by_id: input.staffId,
            filed_by: 'reviewer',
            idempotency_key: input.key,
            explanation_ciphertext: expect.any(String),
            current_staff_decision_identity_id: null,
            staff_disposition: null,
            decided_at: null,
            decided_by_id: null,
            rationale_ciphertext: null,
          }),
        ],
      },
    },
  ]).toContainEqual({
    outcome: {
      status: response.status,
      code: response.body.code,
      message: response.body.message,
      value: response.body.copyright_uk_redress_request,
      nativeCodes,
    },
    state: after,
  })
  if (row) {
    expect(row.explanation_ciphertext).not.toContain('Please review this notice')
    expect(decryptSecret(row.explanation_ciphertext, `copyright-uk-redress:${input.key}`)).toBe(
      'Please review this notice',
    )
  }
}

/** Replays and cross-notice key guards do not change any owned case fact. */
export async function assertUkRouteRedressReplay(input: {
  request: Request
  noticeId: string
  key: string
  redressId: string
  crossNotice?: boolean
}) {
  const before = await readCopyrightApiTerritorialState(input.noticeId)
  const { response, nativeCodes } = await observeCopyrightOwnedHttp(input.noticeId, async () =>
    input.request
      .post(`/api/v1/copyright-uk-notices/${input.noticeId}/redress-requests`)
      .set('Idempotency-Key', input.key)
      .send({
        explanation: input.crossNotice ? 'Reuse the first key' : 'Please review this notice',
      }),
  )
  const after = await readCopyrightApiTerritorialState(input.noticeId)
  expect([
    copyrightHttpSerializationAbort,
    input.crossNotice
      ? {
          status: 409,
          code: undefined,
          message: 'Idempotency-Key was reused',
          value: undefined,
          nativeCodes: [],
        }
      : {
          status: 200,
          code: undefined,
          message: undefined,
          value: { id: input.redressId, is_duplicate: true },
          nativeCodes: [],
        },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    value: response.body.copyright_uk_redress_request,
    nativeCodes,
  })
  expect(after).toEqual(before)
}
