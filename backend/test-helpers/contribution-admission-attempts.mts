import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getContributionAdmissionAttemptsForTest(input: {
  actorId: string
  idempotencyKey: string
}) {
  const { rows } = await read<{
    attempt_number: number
    failure: { message: string } | null
    committed: boolean
    abandoned: boolean
  }>(sql`/* getContributionAdmissionAttemptsForTest */
    SELECT attempt.attempt_number, result.failure, result.committed_at IS NOT NULL AS committed,
      result.abandoned_at IS NOT NULL AS abandoned
    FROM post_admission_reservations reservation
    JOIN post_admission_attempts attempt ON attempt.reservation_id = reservation.id
    LEFT JOIN post_admission_attempt_results result ON result.post_admission_attempt_id = attempt.id
    WHERE reservation.actor_user_id = ${input.actorId} AND reservation.idempotency_key = ${input.idempotencyKey}
    ORDER BY attempt.attempt_number
  `)
  return rows
}
