import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { IDEMPOTENCY_KEY_REUSED } from '@modules/on-error/error-codes'
import sql from 'sql-template-strings'
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

type State = 'in_progress' | 'committed' | 'retryable_failed' | 'expired'

export type ContributionAdmissionAudit = Readonly<{
  route: string
  scope: string
  source: string
  postType: string
  policyRevision: string
}>

export async function claimContributionAdmission<T>(
  actorId: string,
  idempotencyKey: string,
  intent: unknown,
  audit: ContributionAdmissionAudit,
): Promise<
  | { kind: 'claimed'; reservationId: string; leaseId: string }
  | { kind: 'replay'; response: T }
  | { kind: 'in_progress'; retryAfterSeconds: number }
> {
  const intentSha256 = hashAdmissionIntent(intent)
  await using query = await beginTransaction()

  await query(sql`/* claimContributionAdmission.insert */
      INSERT INTO post_admission_reservations (actor_id, idempotency_key, intent_sha256, route, scope, source, post_type, policy_revision)
      VALUES (${actorId}, ${idempotencyKey}, ${intentSha256}, ${audit.route}, ${audit.scope}, ${audit.source}, ${audit.postType}, ${audit.policyRevision})
      ON CONFLICT (actor_id, idempotency_key) DO NOTHING`)
  const reservation = await query<{
    id: string
    intent_sha256: string
    state: State
    response: unknown
    finalization_pending: boolean
    category_finalization_pending: boolean
    expired: boolean
  }>(sql`/* claimContributionAdmission.reservation */
      SELECT id, intent_sha256, state, response,
        COALESCE(replay_metadata->>'finalization', 'pending') <> 'complete' AS finalization_pending,
        EXISTS (
          SELECT 1 FROM post_category_finalizations f
          WHERE f.post_id = post_admission_reservations.committed_post_id
        ) AS category_finalization_pending,
        COALESCE(expires_at <= clock_timestamp(), false) AS expired
      FROM post_admission_reservations
      WHERE actor_id = ${actorId} AND idempotency_key = ${idempotencyKey} FOR UPDATE`)
  const row = reservation.rows[0]
  if (!row) throw new Error('Contribution admission reservation was not returned')
  let reservationId = row.id
  if (row.expired) {
    // The quota ledger intentionally retains the old reservation ID. Replace the expired replay
    // record so a new committed request cannot collide with that immutable ledger entry.
    await query(sql`/* claimContributionAdmission.deleteExpired */
        DELETE FROM post_admission_reservations
        WHERE id = ${row.id}`)
    const replacement = await query<{
      id: string
    }>(sql`/* claimContributionAdmission.insertReplacement */
        INSERT INTO post_admission_reservations (actor_id, idempotency_key, intent_sha256, route, scope, source, post_type, policy_revision)
        VALUES (${actorId}, ${idempotencyKey}, ${intentSha256}, ${audit.route}, ${audit.scope}, ${audit.source}, ${audit.postType}, ${audit.policyRevision})
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
      SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - clock_timestamp())))::integer::text AS retry_after_seconds
      FROM post_admission_claims
      WHERE reservation_id = ${reservationId} AND expires_at > NOW()`,
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
    if (row.category_finalization_pending) {
      await extendContributionAdmissionReplay(query, reservationId)
      await query.commit()
      return { kind: 'in_progress', retryAfterSeconds: 1 }
    }
    await completeMarkerlessContributionAdmissionReplay(query, reservationId)
    await query.commit()
    return { kind: 'replay', response: row.response as T }
  }
  const leaseId = randomUUID()
  const claim = await query<{
    reservation_id: string
  }>(sql`/* claimContributionAdmission.claim */
      INSERT INTO post_admission_claims (reservation_id, lease_id, expires_at) VALUES (${reservationId}, ${leaseId}, NOW() + ${CONTRIBUTION_ADMISSION_CLAIM_SECONDS} * INTERVAL '1 second')
      ON CONFLICT (reservation_id) DO UPDATE SET lease_id = EXCLUDED.lease_id, expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      WHERE post_admission_claims.expires_at <= NOW() RETURNING reservation_id`)
  if (claim.rowCount !== 1) {
    const contendedClaim = await query<{ retry_after_seconds: string }>(
      sql`/* claimContributionAdmission.contendedClaim */
        SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - clock_timestamp())))::integer::text AS retry_after_seconds
        FROM post_admission_claims
        WHERE reservation_id = ${reservationId} AND expires_at > NOW()`,
    )
    await query.commit()
    return {
      kind: 'in_progress',
      retryAfterSeconds:
        parseClaimRetryAfterSeconds(contendedClaim.rows[0]?.retry_after_seconds) ?? 1,
    }
  }
  await query(sql`/* claimContributionAdmission.mark */
      UPDATE post_admission_reservations
      SET state = 'in_progress', route = ${audit.route}, scope = ${audit.scope}, source = ${audit.source},
        post_type = ${audit.postType}, policy_revision = ${audit.policyRevision}, retryable_failure = NULL,
        updated_at = NOW(), retention_expires_at = NOW() + INTERVAL '48 hours'
      WHERE id = ${reservationId}`)
  await query.commit()
  return { kind: 'claimed', reservationId, leaseId }
}

function parseClaimRetryAfterSeconds(retryAfterSecondsValue: string | undefined): number | null {
  const retryAfterSeconds = Number(retryAfterSecondsValue)
  return Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : null
}
