import { createHash, randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Creates a durable admission record whose crashed worker lease is already reclaimable. */
export async function createExpiredContributionAdmissionClaimForTest(input: {
  actorId: string
  idempotencyKey: string
  intent: unknown
}): Promise<void> {
  const reservation = await write<{
    id: string
  }>(sql`/* createExpiredContributionAdmissionClaimForTest.reservation */
    INSERT INTO post_admission_reservations (actor_id, idempotency_key, intent_sha256, route, scope, source, post_type, policy_revision)
    VALUES (${input.actorId}, ${input.idempotencyKey}, ${hashTestContributionAdmissionIntent(input.intent)}, 'test', 'test', 'discussion', 'discussion', 'test')
    RETURNING id`)
  const reservationId = reservation.rows[0]?.id
  if (!reservationId) throw new Error('Test contribution admission reservation was not created')
  await write(sql`/* createExpiredContributionAdmissionClaimForTest.claim */
    INSERT INTO post_admission_claims (reservation_id, lease_id, expires_at)
    VALUES (${reservationId}, ${randomUUID()}, NOW() - INTERVAL '1 second')`)
}

export async function expireContributionAdmissionClaimForTest(input: {
  actorId: string
  idempotencyKey: string
}): Promise<void> {
  await write(sql`/* expireContributionAdmissionClaimForTest */
    UPDATE post_admission_claims c
    SET expires_at = NOW() - INTERVAL '1 second'
    FROM post_admission_reservations r
    WHERE c.reservation_id = r.id
      AND r.actor_id = ${input.actorId}
      AND r.idempotency_key = ${input.idempotencyKey}`)
}

export async function getContributionAdmissionReservationStateForTest(input: {
  actorId: string
  idempotencyKey: string
}): Promise<string | null> {
  const result = await write<{
    state: string
  }>(sql`/* getContributionAdmissionReservationStateForTest */
    SELECT state FROM post_admission_reservations
    WHERE actor_id = ${input.actorId} AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1`)
  return result.rows[0]?.state ?? null
}

export async function getContributionAdmissionPolicyRevisionForTest(input: {
  actorId: string
  idempotencyKey: string
}): Promise<string | null> {
  const result = await write<{
    policy_revision: string
  }>(sql`/* getContributionAdmissionPolicyRevisionForTest */
    SELECT policy_revision FROM post_admission_reservations
    WHERE actor_id = ${input.actorId} AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1`)
  return result.rows[0]?.policy_revision ?? null
}

export async function getContributionAdmissionAuditForTest(input: {
  actorId: string
  idempotencyKey: string
}): Promise<{
  route: string
  scope: string
  source: string
  postType: string
  policyRevision: string
} | null> {
  const result = await write<{
    route: string
    scope: string
    source: string
    post_type: string
    policy_revision: string
  }>(sql`/* getContributionAdmissionAuditForTest */
    SELECT route, scope, source, post_type, policy_revision
    FROM post_admission_reservations
    WHERE actor_id = ${input.actorId} AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1`)
  const row = result.rows[0]
  if (!row) return null
  return {
    route: row.route,
    scope: row.scope,
    source: row.source,
    postType: row.post_type,
    policyRevision: row.policy_revision,
  }
}

/** Simulates a durable post-commit finalizer publishing before its caller resumes. */
export async function completeContributionAdmissionResponseForTest(input: {
  actorId: string
  idempotencyKey: string
  response: unknown
}): Promise<void> {
  await write(sql`/* completeContributionAdmissionResponseForTest */
    UPDATE post_admission_reservations
    SET response = ${JSON.stringify(input.response)}::jsonb,
      replay_metadata = replay_metadata || '{"finalization":"complete"}'::jsonb,
      updated_at = NOW()
    WHERE actor_id = ${input.actorId}
      AND idempotency_key = ${input.idempotencyKey}
      AND state = 'committed'`)
}

export async function setContributionAdmissionReplayMetadataForTest(input: {
  actorId: string
  idempotencyKey: string
  replayMetadata: unknown
}): Promise<void> {
  await write(sql`/* setContributionAdmissionReplayMetadataForTest */
    UPDATE post_admission_reservations
    SET replay_metadata = ${JSON.stringify(input.replayMetadata)}::jsonb,
      updated_at = NOW()
    WHERE actor_id = ${input.actorId}
      AND idempotency_key = ${input.idempotencyKey}
      AND state = 'committed'`)
}

/** Expires exactly one randomized test reservation without disturbing shared dirty-database rows. */
export async function expireContributionAdmissionForTest(input: {
  actorId: string
  idempotencyKey: string
}): Promise<void> {
  await write(sql`/* expireContributionAdmissionForTest */
    UPDATE post_admission_reservations
    SET expires_at = NOW() - INTERVAL '1 second',
      retention_expires_at = NOW() - INTERVAL '1 second'
    WHERE actor_id = ${input.actorId} AND idempotency_key = ${input.idempotencyKey}`)
}

/** Sets a randomized test reservation's replay expiry relative to the authoritative DB clock. */
export async function setContributionAdmissionExpiryForTest(input: {
  actorId: string
  idempotencyKey: string
  expiresInSeconds: number
}): Promise<void> {
  await write(sql`/* setContributionAdmissionExpiryForTest */
    UPDATE post_admission_reservations
    SET expires_at = NOW() + (${input.expiresInSeconds} * INTERVAL '1 second'),
      retention_expires_at = NOW() + (${input.expiresInSeconds} * INTERVAL '1 second')
    WHERE actor_id = ${input.actorId} AND idempotency_key = ${input.idempotencyKey}`)
}

export async function getContributionAdmissionReplayRetentionForTest(input: {
  actorId: string
  idempotencyKey: string
}): Promise<{
  expiresAt: Date
  retentionExpiresAt: Date
  secondsUntilExpiry: number
} | null> {
  const result = await write<{
    expires_at: Date
    retention_expires_at: Date
    seconds_until_expiry: string
  }>(sql`/* getContributionAdmissionReplayRetentionForTest */
    SELECT expires_at, retention_expires_at,
      EXTRACT(EPOCH FROM expires_at - clock_timestamp())::text AS seconds_until_expiry
    FROM post_admission_reservations
    WHERE actor_id = ${input.actorId} AND idempotency_key = ${input.idempotencyKey}
      AND state = 'committed'`)
  const row = result.rows[0]
  if (!row) return null
  return {
    expiresAt: row.expires_at,
    retentionExpiresAt: row.retention_expires_at,
    secondsUntilExpiry: Number(row.seconds_until_expiry),
  }
}

export async function getContributionAdmissionConsumptionCountForTest(
  actorId: string,
  source: string,
): Promise<number> {
  const { rows } = await write<{
    count: string
  }>(sql`/* getContributionAdmissionConsumptionCountForTest */
    SELECT COUNT(*)::text AS count FROM post_admission_quota_consumptions
    WHERE actor_id = ${actorId} AND source = ${source}`)
  return Number(rows[0]?.count ?? 0)
}

function hashTestContributionAdmissionIntent(intent: unknown): string {
  return createHash('sha256').update(JSON.stringify(intent)).digest('hex')
}
