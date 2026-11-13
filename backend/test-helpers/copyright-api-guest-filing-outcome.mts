import { expect } from 'vitest'
import { decryptSecret } from '@modules/token-secrets'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { createRequest } from './api/server.mts'
import { readApiGuestState } from './copyright-api-guest-state.mts'

/** A real guest filing commits submission, capability provenance, urgent classification and audit together. */
export async function assertApiGuestFiling(input: {
  noticeId: string
  capability: { id: string; token: string }
  kind: 'supplement' | 'court_or_ccb_hold'
  statement: string
  captcha?: string
}) {
  const before = await readApiGuestState(input.noticeId)
  expect(before.aggregate.actionIntents).toEqual([])
  const response = await createRequest()
    .post(`/api/v1/copyright-notices/${input.noticeId}/guest-filings`)
    .set('Copyright-Guest-Capability', input.capability.token)
    .send({
      kind: input.kind,
      statement: input.statement,
      ...(input.captcha ? { cf_turnstile_response: input.captcha } : {}),
    })
  const after = await readApiGuestState(input.noticeId)
  const filing = after.aggregate.submissions.find(
    row => !before.aggregate.submissions.some(prior => prior.id === row.id),
  )
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
      value: { id: filing?.id, kind: input.kind, received_at: expect.any(String) },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        activity: { ...before.activity, lifecycle: expect.any(Date) },
        urgent:
          input.kind === 'court_or_ccb_hold'
            ? [...before.urgent, { submission: filing?.id, at: expect.any(Date) }]
            : before.urgent,
        aggregate: {
          ...before.aggregate,
          submissions: [
            ...before.aggregate.submissions,
            expect.objectContaining({
              id: filing?.id,
              copyright_notice_id: input.noticeId,
              kind: input.kind,
              source_kind: 'guest_form',
              submitted_by_id: null,
              copyright_notice_guest_capability_id: input.capability.id,
              received_at: expect.any(Date),
              body_ciphertext: expect.any(String),
              current_assessment_identity_id: null,
              current_assessment_is_substantially_compliant: null,
              current_assessed_at: null,
              current_assessed_by_id: null,
              current_assessment_form_screening_id: null,
            }),
          ],
          lifecycleEvents: [
            ...before.aggregate.lifecycleEvents,
            expect.objectContaining({
              copyright_notice_id: input.noticeId,
              change_type: `${input.kind}_received`,
              changed_by_id: null,
              copyright_notice_submission_id: filing?.id,
            }),
          ],
        },
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    value: response.body.copyright_submission,
    state: after,
  })
  if (filing) {
    const body = decryptSecret(filing.body_ciphertext, copyrightSubmissionPurpose(filing.id))
    expect(body).toBe(
      input.kind === 'court_or_ccb_hold'
        ? JSON.stringify({ summary: input.statement })
        : input.statement,
    )
    expect(response.body.copyright_submission.received_at).toBe(filing.received_at.toISOString())
    if (input.kind === 'court_or_ccb_hold')
      expect(after.urgent).toEqual([{ submission: filing.id, at: filing.received_at }])
  }
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}
