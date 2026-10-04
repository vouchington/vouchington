import { createHash, randomUUID } from 'node:crypto'
import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getContributionAdmissionConsumptionModeForTest(input: {
  actorId: string
  idempotencyKey: string
}): Promise<string | null> {
  const { rows } = await write<{
    consumption_mode: string
  }>(sql`/* getContributionAdmissionConsumptionModeForTest */
    SELECT c.consumption_mode
    FROM post_admission_quota_consumptions c
    INNER JOIN post_admission_reservations r ON r.id = c.reservation_id
    WHERE r.actor_id = ${input.actorId} AND r.idempotency_key = ${input.idempotencyKey}`)
  return rows[0]?.consumption_mode ?? null
}

/**
 * Creates the reservation a quota consumption belongs to. A consumption row is keyed by its
 * reservation, so tests that record one directly need a real reservation to reference.
 */
export async function insertContributionAdmissionReservationForTest(input: {
  actorId: string
}): Promise<string> {
  const { rows } = await write<{
    id: string
  }>(sql`/* insertContributionAdmissionReservationForTest */
    INSERT INTO post_admission_reservations (actor_id, idempotency_key, intent_sha256, route, scope, source, post_type, policy_revision)
    VALUES (${input.actorId}, ${randomUUID()}, ${createHash('sha256').update(randomUUID()).digest('hex')}, 'internal', 'internal', 'discussion', 'discussion', 'test')
    RETURNING id`)
  const reservationId = rows[0]?.id
  if (!reservationId) throw new Error('Test contribution admission reservation was not created')
  return reservationId
}

export async function insertLegacyContributionAdmissionConsumptionForTest(input: {
  actorId: string
  source: string
}): Promise<void> {
  const reservationId = await insertContributionAdmissionReservationForTest(input)
  await write(sql`/* insertLegacyContributionAdmissionConsumptionForTest */
    INSERT INTO post_admission_quota_consumptions (reservation_id, actor_id, source)
    VALUES (${reservationId}, ${input.actorId}, ${input.source})`)
}

/**
 * Registers a post's retained identity inside the admission transaction, as the live post
 * insert does. A committed admission reservation references that identity, so an invented
 * post id needs it before the reservation commits.
 */
export async function ensureTestAdmittedPostIdentity(
  query: TransactionQuery,
  postId: string,
): Promise<void> {
  await query(
    "/* ensureTestAdmittedPostIdentity */ SELECT fn_ensure_retained_identity('post', $1)",
    [postId],
  )
}

/** Registers a post's retained identity outside any admission transaction. */
export async function ensureTestAdmittedPostIdentityDirect(postId: string): Promise<void> {
  await write(sql`/* ensureTestAdmittedPostIdentityDirect */
    SELECT fn_ensure_retained_identity('post', ${postId})`)
}

/** An admission `execute` that "creates" a post with a fresh id and responds with it. */
export async function executeTestAdmittedPost(
  query: TransactionQuery,
): Promise<{ post: { id: string } }> {
  const id = randomUUID()
  await ensureTestAdmittedPostIdentity(query, id)
  return { post: { id } }
}

/** Inserts a committed replay whose `committed_post_id` references the post's retained identity. */
export async function insertTestCommittedAdmissionReservation(input: {
  actorId: string
  postId: string
}): Promise<string> {
  const { rows } = await write<{
    id: string
  }>(sql`/* insertTestCommittedAdmissionReservation */
    INSERT INTO post_admission_reservations (
      actor_id, idempotency_key, intent_sha256, route, scope, source, post_type, policy_revision,
      state, response, replay_metadata, committed_post_id, committed_status, committed_at,
      expires_at, retention_expires_at
    )
    VALUES (
      ${input.actorId}, ${randomUUID()}, ${createHash('sha256').update(randomUUID()).digest('hex')},
      'internal', 'internal', 'discussion', 'discussion', 'test',
      'committed', ${JSON.stringify({ post: { id: input.postId } })}::jsonb,
      '{"route":"test","scope":"test"}'::jsonb, ${input.postId}, 'created', NOW(),
      NOW() + INTERVAL '48 hours', NOW() + INTERVAL '48 hours'
    )
    RETURNING id`)
  const reservationId = rows[0]?.id
  if (!reservationId) throw new Error('Test committed admission reservation was not created')
  return reservationId
}

export async function deleteTestAdmissionReservation(reservationId: string): Promise<void> {
  await write(sql`/* deleteTestAdmissionReservation */
    DELETE FROM post_admission_reservations WHERE id = ${reservationId}`)
}
