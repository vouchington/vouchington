import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { IDEMPOTENCY_KEY_REUSED } from '@modules/on-error/error-codes'
import sql from 'sql-template-strings'
import {
  contributionAdmissionScopeCategory,
  type ContributionAdmissionAudit,
} from './admission-audit.mts'
import { hashAdmissionIntent } from './admission-intent.mts'
import {
  completeMarkerlessContributionAdmissionReplay,
  extendContributionAdmissionReplay,
} from './admission-replay-retention.mts'
import { CONTRIBUTION_ADMISSION_CLAIM_SECONDS } from './config.mts'
export {
  discardRejectedContributionAdmission,
  markContributionAdmissionRetryableFailure,
  pruneExpiredContributionAdmissions,
} from './admission-reservation-maintenance.mts'

type State = 'in_progress' | 'committed'

export async function claimContributionAdmission<T>(
  actorId: string,
  idempotencyKey: string,
  intent: unknown,
  audit: ContributionAdmissionAudit,
): Promise<
  | { kind: 'claimed'; reservationId: string; leaseToken: string }
  | { kind: 'replay'; response: T }
  | { kind: 'in_progress'; retryAfterSeconds: number }
> {
  const intentSha256 = hashAdmissionIntent(intent)
  await using query = await beginTransaction()

  await query(sql`/* claimContributionAdmission.insert */
      INSERT INTO post_admission_reservations (actor_user_id, idempotency_key, intent_sha256, route, scope, source, post_type, policy_revision)
      VALUES (${actorId}, ${idempotencyKey}, ${intentSha256}, ${audit.route}, ${contributionAdmissionScopeCategory(audit.scope)}, ${audit.source}, ${audit.postType}, ${audit.policyRevision})
      ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING`)
  const reservation = await query<{
    id: string
    intent_sha256: string
    state: State
    response: unknown
    finalization_pending: boolean
    expired: boolean
  }>(sql`/* claimContributionAdmission.reservation */
      SELECT id, intent_sha256, state, response,
        COALESCE(replay_metadata->>'finalization', 'pending') <> 'complete' AS finalization_pending,
        COALESCE(expires_at <= clock_timestamp(), false) AS expired
      FROM post_admission_reservations
      WHERE actor_user_id = ${actorId} AND idempotency_key = ${idempotencyKey} FOR UPDATE`)
  const row = reservation.rows[0]
  if (!row) throw new Error('Contribution admission reservation was not returned')
  let reservationId = row.id
  if (row.expired) {
    // Replace the expired replay so the actor/key pair can be reused. Its quota consumption is
    // deleted with it (ON DELETE CASCADE); replay retention outlasts every policy window, so that
    // consumption can no longer count toward capacity.
    await query(sql`/* claimContributionAdmission.deleteExpired */
        DELETE FROM post_admission_reservations
        WHERE id = ${row.id}`)
    const replacement = await query<{
      id: string
    }>(sql`/* claimContributionAdmission.insertReplacement */
        INSERT INTO post_admission_reservations (actor_user_id, idempotency_key, intent_sha256, route, scope, source, post_type, policy_revision)
        VALUES (${actorId}, ${idempotencyKey}, ${intentSha256}, ${audit.route}, ${contributionAdmissionScopeCategory(audit.scope)}, ${audit.source}, ${audit.postType}, ${audit.policyRevision})
        RETURNING id`)
    reservationId = replacement.rows[0]?.id ?? ''
    if (!reservationId)
      throw new Error('Replacement contribution admission reservation was not returned')
  } else if (row.intent_sha256 !== intentSha256)
    throw createCodedError(
      409,
      'This Idempotency-Key was already used for a different request.',
      IDEMPOTENCY_KEY_REUSED,
    )
  if (!row.expired && row.state === 'committed' && !row.finalization_pending) {
    await extendContributionAdmissionReplay(query, reservationId)
    await query.commit()
    return { kind: 'replay', response: row.response as T }
  }
  const liveClaim = await query<{ retry_after_seconds: string }>(
    sql`/* claimContributionAdmission.liveClaim */
      SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM lease_expires_at - clock_timestamp())))::integer::text AS retry_after_seconds
      FROM post_admission_claims
      WHERE reservation_id = ${reservationId} AND lease_expires_at > clock_timestamp()`,
  )
  const liveClaimRetryAfterSeconds = parseClaimRetryAfterSeconds(
    liveClaim.rows[0]?.retry_after_seconds,
  )
  if (liveClaimRetryAfterSeconds !== null) {
    if (!row.expired && row.state === 'committed')
      await extendContributionAdmissionReplay(query, reservationId)
    await query.commit()
    return { kind: 'in_progress', retryAfterSeconds: liveClaimRetryAfterSeconds }
  }
  if (!row.expired && row.state === 'committed') {
    await completeMarkerlessContributionAdmissionReplay(query, reservationId)
    await query.commit()
    return { kind: 'replay', response: row.response as T }
  }
  await query(sql`/* claimContributionAdmission.abandonExpiredAttempt */
    INSERT INTO post_admission_attempt_results (post_admission_attempt_id, abandoned_at)
    SELECT attempt.id, clock_timestamp() FROM post_admission_attempts attempt
    JOIN post_admission_claims claim ON claim.reservation_id = attempt.reservation_id AND claim.lease_token = attempt.lease_token
    WHERE claim.reservation_id = ${reservationId} AND claim.lease_expires_at <= clock_timestamp()
    ORDER BY attempt.id ASC NULLS LAST
    ON CONFLICT (post_admission_attempt_id) DO NOTHING`)
  const leaseToken = randomUUID()
  const claim = await query<{
    reservation_id: string
  }>(sql`/* claimContributionAdmission.claim */
      INSERT INTO post_admission_claims (reservation_id, lease_token, leased_at, lease_expires_at) VALUES (${reservationId}, ${leaseToken}, clock_timestamp(), clock_timestamp() + ${CONTRIBUTION_ADMISSION_CLAIM_SECONDS} * INTERVAL '1 second')
      ON CONFLICT (reservation_id) DO UPDATE SET lease_token = EXCLUDED.lease_token, leased_at = EXCLUDED.leased_at, lease_expires_at = EXCLUDED.lease_expires_at
      WHERE post_admission_claims.lease_expires_at <= clock_timestamp() RETURNING reservation_id`)
  if (claim.rowCount !== 1) {
    const contendedClaim = await query<{ retry_after_seconds: string }>(
      sql`/* claimContributionAdmission.contendedClaim */
        SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM lease_expires_at - clock_timestamp())))::integer::text AS retry_after_seconds
        FROM post_admission_claims
        WHERE reservation_id = ${reservationId} AND lease_expires_at > clock_timestamp()`,
    )
    await query.commit()
    return {
      kind: 'in_progress',
      retryAfterSeconds:
        parseClaimRetryAfterSeconds(contendedClaim.rows[0]?.retry_after_seconds) ?? 1,
    }
  }
  await query(sql`/* claimContributionAdmission.recordAttempt */
    INSERT INTO post_admission_attempts (reservation_id, attempt_number, lease_token, started_at)
    SELECT ${reservationId}, COALESCE(MAX(attempt_number), 0) + 1, ${leaseToken}, clock_timestamp()
    FROM post_admission_attempts WHERE reservation_id = ${reservationId}`)
  await query(sql`/* claimContributionAdmission.mark */
      UPDATE post_admission_reservations
      SET route = ${audit.route}, scope = ${contributionAdmissionScopeCategory(audit.scope)}, source = ${audit.source},
        post_type = ${audit.postType}, policy_revision = ${audit.policyRevision}, retention_expires_at = NOW() + INTERVAL '48 hours'
      WHERE id = ${reservationId}`)
  await query.commit()
  return { kind: 'claimed', reservationId, leaseToken }
}

function parseClaimRetryAfterSeconds(retryAfterSecondsValue: string | undefined): number | null {
  const retryAfterSeconds = Number(retryAfterSecondsValue)
  return Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : null
}
