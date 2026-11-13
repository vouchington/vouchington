import { expect } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { createRequest } from './api/server.mts'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'

/** Complete committed complaint/escalation/key facts for an independent real replay endpoint. */
export async function seedApiEuComplaint(input: {
  noticeId: string
  actorId: string
  key: string
  authorityReference: string
  explanation: string
}) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
  }>(sql`/* seedApiEuComplaint:complaint */ INSERT INTO copyright_eu_supervised_complaints (copyright_notice_id,jurisdiction,recorded_by_id,idempotency_key,authority_reference,explanation_ciphertext)
    VALUES (${input.noticeId},'eu_dsa',${input.actorId},${input.key},${input.authorityReference},${encryptSecret(input.explanation, `copyright-eu-supervised:${input.noticeId}:${input.authorityReference}`)}) RETURNING id`)
  const complaint = rows[0]
  if (!complaint) throw new Error('Owned EU complaint prerequisite missing')
  const { rows: escalations } = await transaction<{ id: string }>(
    sql`/* seedApiEuComplaint:escalation */ INSERT INTO copyright_territorial_escalations (copyright_notice_id,jurisdiction,copyright_eu_supervised_complaint_id) VALUES (${input.noticeId},'eu_dsa',${complaint.id}) RETURNING id`,
  )
  if (!escalations[0]) throw new Error('Owned EU complaint escalation prerequisite missing')
  await transaction(
    sql`/* seedApiEuComplaint:clock */ UPDATE copyright_notices SET last_legal_activity_at = GREATEST(last_legal_activity_at,clock_timestamp()) WHERE id = ${input.noticeId}`,
  )
  await transaction.commit()
  return { id: complaint.id, escalation_id: escalations[0].id }
}

/** An exact replay returns the committed identities without a new escalation or clock mutation. */
export async function assertApiEuComplaintReplay(input: {
  request: ReturnType<typeof createRequest>
  noticeId: string
  key: string
  body: { authority_reference: string; explanation: string }
  expected: { id: string; escalation_id: string }
}) {
  const before = await readCopyrightApiTerritorialState(input.noticeId)
  const response = await input.request
    .post(`/api/v1/copyright-eu-notices/${input.noticeId}/supervised-complaints`)
    .set('Idempotency-Key', input.key)
    .send(input.body)
  const after = await readCopyrightApiTerritorialState(input.noticeId)
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      value: undefined,
      state: before,
    },
    { status: 200, code: undefined, message: undefined, value: input.expected, state: before },
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    value: response.body.copyright_eu_supervised_complaint,
    state: after,
  })
}
