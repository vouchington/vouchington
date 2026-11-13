import { expect } from 'vitest'
import { decryptSecret } from '@modules/token-secrets'
import { recordEuCopyrightSupervisedComplaint } from '../services/copyright-notices/eu-supervised-complaint.mts'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** The real post-withdrawal supervisory request owns both complaint and escalation or neither. */
export async function assertWithdrawalSupervisedComplaint(actor: PrivateUser, noticeId: string) {
  const input = {
    idempotencyKey: crypto.randomUUID(),
    authorityReference: `DSC-${crypto.randomUUID()}`,
    explanation: 'The notified decision merits supervisory review.',
  }
  const before = await readCopyrightApiTerritorialState(noticeId)
  const [result] = await Promise.allSettled([
    recordEuCopyrightSupervisedComplaint(actor, noticeId, input),
  ])
  const after = await readCopyrightApiTerritorialState(noticeId)
  const complaint = after.complaints.find(
    row => row.authority_reference === input.authorityReference,
  )
  const escalation = after.escalations.find(
    row => row.copyright_eu_supervised_complaint_id === complaint?.id,
  )
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
      outcome: {
        status: 'fulfilled',
        value: { id: complaint?.id, escalation_id: escalation?.id, is_duplicate: false },
      },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        complaints: [
          ...before.complaints,
          {
            id: complaint?.id,
            copyright_notice_id: noticeId,
            jurisdiction: 'eu_dsa',
            recorded_by_id: actor.id,
            idempotency_key: input.idempotencyKey,
            authority_reference: input.authorityReference,
            explanation_ciphertext: expect.any(String),
            created_at: expect.any(Date),
            received_at: expect.any(Date),
            resolved_at: null,
            resolved_by_id: null,
          },
        ],
        escalations: [
          ...before.escalations,
          {
            id: escalation?.id,
            copyright_notice_id: noticeId,
            jurisdiction: 'eu_dsa',
            copyright_eu_supervised_complaint_id: complaint?.id,
            copyright_territorial_notice_acknowledgment_id: null,
            created_at: expect.any(Date),
            escalated_at: complaint?.received_at,
            closed_at: null,
            closed_by_id: null,
          },
        ],
      },
    },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
  if (complaint)
    expect(
      decryptSecret(
        String(complaint.explanation_ciphertext),
        `copyright-eu-supervised:${noticeId}:${input.authorityReference}`,
      ),
    ).toBe(input.explanation)
}
