import { expect } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret, decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'
import { insertTerritorialRedressRequest } from '../services/copyright-notices/territorial-redress-sql.mts'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'
import type { createRequest } from './api/server.mts'

/** Exact committed key/actor/decision binding for a separate HTTP replay subject. */
export async function seedApiTerritorialRedress(input: {
  jurisdiction: 'eu_dsa' | 'uk'
  noticeId: string
  actorId: string
  key: string
  explanation: string
  filedBy: 'notifier' | 'poster' | 'reviewer'
}) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
    outcome: 'no_action' | 'restrict'
    assessment: string | null
  }>(
    sql`/* seedApiTerritorialRedress:parent */ SELECT current_territorial_decision_identity_id AS id,territorial_decision_outcome AS outcome,territorial_authorizing_assessment_identity_id AS assessment FROM copyright_notices WHERE id = ${input.noticeId}`,
  )
  const parent = rows[0]
  if (!parent?.id) throw new Error('Owned API redress parent missing')
  const { rows: created } = await transaction<{ id: string }>(
    insertTerritorialRedressRequest(
      input.jurisdiction,
      input.noticeId,
      parent.id,
      parent.outcome,
      parent.assessment,
      input.actorId,
      input.filedBy,
      input.key,
      encryptSecret(
        input.explanation,
        `${territorialLabels(input.jurisdiction).redressPurpose}:${input.key}`,
      ),
    ),
  )
  if (!created[0]) throw new Error('Owned API redress prerequisite missing')
  await transaction(
    sql`/* seedApiTerritorialRedress:clock */ UPDATE copyright_notices SET last_legal_activity_at = GREATEST(last_legal_activity_at, clock_timestamp()) WHERE id = ${input.noticeId}`,
  )
  await transaction.commit()
  return created[0]
}

/** Invalid requests cannot consume a key; the following real writer still runs exactly once. */
export async function assertApiTerritorialRedress(input: {
  request: ReturnType<typeof createRequest>
  jurisdiction: 'eu_dsa' | 'uk'
  noticeId: string
  actorId: string
  key: string
  explanation: string
  filedBy: 'notifier' | 'poster' | 'reviewer'
  replay?: boolean
}) {
  const before = await readCopyrightApiTerritorialState(input.noticeId)
  const base =
    input.jurisdiction === 'eu_dsa'
      ? '/api/v1/copyright-eu-notices'
      : '/api/v1/copyright-uk-notices'
  const response = await input.request
    .post(`${base}/${input.noticeId}/redress-requests`)
    .set('Idempotency-Key', input.key)
    .send({ explanation: input.explanation })
  const after = await readCopyrightApiTerritorialState(input.noticeId)
  const row = after.requests.find(candidate => candidate.idempotency_key === input.key)
  const parent = before.parent[0]
  if (!parent) throw new Error('Owned API redress parent missing')
  const success = {
    status: input.replay ? 200 : 201,
    code: undefined,
    message: undefined,
    value: { id: row?.id, is_duplicate: input.replay ?? false },
    state: input.replay
      ? before
      : {
          ...before,
          clock: { ...before.clock, at: expect.any(Date) },
          requests: [
            ...before.requests,
            expect.objectContaining({
              id: expect.any(String),
              copyright_notice_id: input.noticeId,
              jurisdiction: input.jurisdiction,
              copyright_territorial_decision_id: parent.current_territorial_decision_identity_id,
              challenged_decision_outcome: parent.territorial_decision_outcome,
              authorizing_assessment_identity_id:
                parent.territorial_authorizing_assessment_identity_id,
              submitted_by_id: input.actorId,
              filed_by: input.filedBy,
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
  }
  expect([
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      value: undefined,
      state: before,
    },
    success,
  ]).toContainEqual({
    status: response.status,
    code: response.body.code,
    message: response.body.message,
    value:
      response.body[
        input.jurisdiction === 'eu_dsa'
          ? 'copyright_eu_redress_request'
          : 'copyright_uk_redress_request'
      ],
    state: after,
  })
  if (row)
    expect(
      decryptSecret(
        row.explanation_ciphertext,
        `${territorialLabels(input.jurisdiction).redressPurpose}:${input.key}`,
      ),
    ).toBe(input.explanation)
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}
