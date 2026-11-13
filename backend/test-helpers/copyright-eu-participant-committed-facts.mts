import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  seedCommittedTerritorialRedress,
  seedCommittedTerritorialRedressDecision,
} from './copyright-territorial-committed-redress.mts'
import type { createTestEuParticipantComplaint } from './copyright-eu-participant-cases.mts'

/** Exact participant-owned request and staff decision are committed before audience/PII reads. */
export async function createCommittedEuParticipantComplaint(
  input: Parameters<typeof createTestEuParticipantComplaint>[0] & {
    filedBy?: 'notifier' | 'poster' | 'reviewer'
  },
) {
  const request = await seedCommittedTerritorialRedress(
    'eu_dsa',
    input.noticeId,
    input.actor,
    input.explanation,
    input.filedBy ?? 'notifier',
  )
  const decision = await seedCommittedTerritorialRedressDecision(
    'eu_dsa',
    input.noticeId,
    request.id,
    input.staff,
    { disposition: input.disposition ?? 'maintain', rationale: input.rationale },
  )
  return { request, decision }
}

/** Canonical one-attempt recipient sent facts, including real immutable delivery attempt results. */
export async function seedInformedEuParticipants(noticeId: string) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
  }>(sql`/* seedInformedEuParticipants:claim */ UPDATE copyright_notice_delivery_work_items
    SET lease_token = uuidv7(),leased_at = clock_timestamp(),lease_expires_at = clock_timestamp() + INTERVAL '5 minutes',
      delivery_attempted_at = CURRENT_TIMESTAMP,available_at = clock_timestamp(),attempt_count = attempt_count + 1,failure_ciphertext = NULL
    WHERE copyright_notice_id = ${noticeId} AND state = 'pending' AND attempt_count = 0
      AND ((recipient_role = 'claimant' AND delivery_kind = 'claimant_decision_notice')
        OR (recipient_role = 'poster' AND delivery_kind = 'poster_restriction_notice')) RETURNING id`)
  if (rows.length !== 4)
    throw new Error('Owned EU participants need both pending statement channels')
  const { rowCount } =
    await transaction(sql`/* seedInformedEuParticipants:sent */ UPDATE copyright_notice_delivery_work_items SET sent_at = clock_timestamp()
    WHERE id = ANY(${rows.map(row => row.id)}::uuid[]) AND state = 'claimed'`)
  if (rowCount !== rows.length) throw new Error('Owned participant delivery facts did not complete')
  await transaction.commit()
}
