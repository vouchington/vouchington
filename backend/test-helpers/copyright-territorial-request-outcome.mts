import { expect } from 'vitest'
import { decryptSecret } from '@modules/token-secrets'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'
import { submitTerritorialCopyrightRedress } from '../services/copyright-notices/territorial-redress-submission.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** A real scoped participant/staff complaint either commits its entire source fact or writes nothing. */
export async function assertTerritorialRequestOutcome(
  jurisdiction: 'eu_dsa' | 'uk',
  noticeId: string,
  actor: PrivateUser,
  explanation: string,
  filedBy: 'notifier' | 'poster' | 'reviewer',
) {
  const before = await readCopyrightApiTerritorialState(noticeId)
  const key = crypto.randomUUID()
  const [result] = await Promise.allSettled([
    submitTerritorialCopyrightRedress(actor, noticeId, key, explanation, jurisdiction),
  ])
  const after = await readCopyrightApiTerritorialState(noticeId)
  const request = after.requests.find(row => row.idempotency_key === key)
  const parent = before.parent[0]
  if (!parent) throw new Error('Owned complaint parent missing')
  expect([
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Conflicting copyright case change',
        causeCode: '40001',
      },
      state: before,
    },
    {
      outcome: { status: 'fulfilled', value: { id: request?.id, is_duplicate: false } },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        requests: [
          ...before.requests,
          expect.objectContaining({
            id: expect.any(String),
            copyright_notice_id: noticeId,
            jurisdiction,
            copyright_territorial_decision_id: parent.current_territorial_decision_identity_id,
            challenged_decision_outcome: parent.territorial_decision_outcome,
            authorizing_assessment_identity_id:
              parent.territorial_authorizing_assessment_identity_id,
            submitted_by_id: actor.id,
            filed_by: filedBy,
            idempotency_key: key,
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
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
  if (request)
    expect(
      decryptSecret(
        request.explanation_ciphertext,
        `${territorialLabels(jurisdiction).redressPurpose}:${key}`,
      ),
    ).toBe(explanation)
  expect(after.clock.at.getTime()).toBeGreaterThanOrEqual(before.clock.at.getTime())
}
