import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import type { createRequest } from './api/server.mts'
import { readCopyrightApiRetentionState } from './copyright-api-preservation-outcome.mts'

/** Current legal parent, all decision facts and all child rows belong to the one owned EU case. */
export async function readCopyrightApiTerritorialState(noticeId: string) {
  const [
    state,
    { rows: parent },
    { rows: requests },
    { rows: decisions },
    { rows: acknowledgments },
  ] = await Promise.all([
    readCopyrightApiRetentionState(noticeId),
    write(sql`/* readApiTerritorial:parent */
      SELECT id, jurisdiction, current_territorial_decision_identity_id, territorial_decision_outcome,
        territorial_decided_at, territorial_decided_by_id, territorial_authorizing_assessment_identity_id,
        territorial_rationale_ciphertext, territorial_public_explanation_ciphertext
      FROM copyright_notices WHERE id = ${noticeId}`),
    write<{
      id: string
      idempotency_key: string
      explanation_ciphertext: string
    }>(sql`/* readApiTerritorial:requests */
      SELECT * FROM copyright_territorial_redress_requests WHERE copyright_notice_id = ${noticeId} ORDER BY id`),
    write(
      sql`/* readApiTerritorial:decisions */ SELECT * FROM copyright_territorial_decisions WHERE copyright_notice_id = ${noticeId} ORDER BY id`,
    ),
    write(sql`/* readApiTerritorial:acknowledgments */ SELECT acknowledgment.* FROM copyright_territorial_notice_acknowledgments acknowledgment
      JOIN copyright_territorial_notice_receipts receipt ON receipt.id = acknowledgment.copyright_territorial_notice_receipt_id
      WHERE receipt.copyright_notice_id = ${noticeId} ORDER BY acknowledgment.id`),
  ])
  return { ...state, parent, decisions, acknowledgments, requests }
}

type Request = ReturnType<typeof createRequest>
/** Invalid-body rejection cannot consume this key, including when the following real writer aborts. */
export async function assertCopyrightApiEuRedress(input: {
  request: Request
  noticeId: string
  actorId: string
  key: string
  explanation: string
}) {
  const before = await readCopyrightApiTerritorialState(input.noticeId)
  const response = await input.request
    .post(`/api/v1/copyright-eu-notices/${input.noticeId}/redress-requests`)
    .set('Idempotency-Key', input.key)
    .send({ explanation: input.explanation })
  const after = await readCopyrightApiTerritorialState(input.noticeId)
  const row = after.requests.find(request => request.idempotency_key === input.key)
  const id = row?.id
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      result: undefined,
      state: before,
    },
    {
      status: 201,
      code: undefined,
      message: undefined,
      result: { id, is_duplicate: false },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        requests: [
          ...before.requests,
          expect.objectContaining({
            id,
            copyright_notice_id: input.noticeId,
            jurisdiction: 'eu_dsa',
            copyright_territorial_decision_id:
              before.parent[0]!.current_territorial_decision_identity_id,
            challenged_decision_outcome: 'no_action',
            authorizing_assessment_identity_id: null,
            submitted_by_id: input.actorId,
            filed_by: 'notifier',
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
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    result: response.body.copyright_eu_redress_request,
    state: after,
  })
  if (row) {
    expect(row.explanation_ciphertext).not.toContain(input.explanation)
    expect(decryptSecret(row.explanation_ciphertext, `copyright-eu-redress:${input.key}`)).toBe(
      input.explanation,
    )
  }
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}

/** A supervised complaint and its escalation share one admission transaction. */
export async function assertCopyrightApiEuComplaint(input: {
  request: Request
  noticeId: string
  actorId: string
  key: string
  body: { authority_reference: string; explanation: string }
}) {
  const before = await readCopyrightApiTerritorialState(input.noticeId)
  const response = await input.request
    .post(`/api/v1/copyright-eu-notices/${input.noticeId}/supervised-complaints`)
    .set('Idempotency-Key', input.key)
    .send(input.body)
  const after = await readCopyrightApiTerritorialState(input.noticeId)
  const id = after.complaints.find(
    row => row.authority_reference === input.body.authority_reference,
  )?.id
  const escalationId = after.escalations.find(
    row => row.copyright_eu_supervised_complaint_id === id,
  )?.id
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      result: undefined,
      state: before,
    },
    {
      status: 201,
      code: undefined,
      message: undefined,
      result: { id, escalation_id: escalationId },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        complaints: [
          ...before.complaints,
          expect.objectContaining({
            id,
            copyright_notice_id: input.noticeId,
            jurisdiction: 'eu_dsa',
            recorded_by_id: input.actorId,
            idempotency_key: input.key,
            authority_reference: input.body.authority_reference,
            explanation_ciphertext: expect.any(String),
            resolved_at: null,
            resolved_by_id: null,
          }),
        ],
        escalations: [
          ...before.escalations,
          expect.objectContaining({
            id: escalationId,
            copyright_notice_id: input.noticeId,
            jurisdiction: 'eu_dsa',
            copyright_eu_supervised_complaint_id: id,
            copyright_territorial_notice_acknowledgment_id: null,
            closed_at: null,
            closed_by_id: null,
          }),
        ],
      },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    result: response.body.copyright_eu_supervised_complaint,
    state: after,
  })
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}
