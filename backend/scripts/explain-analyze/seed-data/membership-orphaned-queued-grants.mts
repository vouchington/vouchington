import { read, write } from '@data-stores/psql'

export const ORPHANED_QUEUED_GRANT_COUNT = 12
export const ORPHANED_QUEUED_GRANT_NOISE_COUNT = 8_000

export async function readOrphanedQueuedGrantProductId(): Promise<string> {
  const { rows } = await read<{ id: string }>(
    `/* readOrphanedQueuedGrantProduct */ SELECT id FROM membership_products WHERE retired_at IS NULL ORDER BY id LIMIT 1`,
  )
  const productId = rows[0]?.id
  if (!productId) throw new Error('Membership product fixture is missing')
  return productId
}

export async function seedOrphanedQueuedGrantFixture(
  userIds: readonly string[],
  productId: string,
): Promise<void> {
  await write(
    `/* seedOrphanedQueuedGrants */
     WITH inserted_users AS (
       INSERT INTO users (id, username)
       SELECT id, 'oq' || replace(id::text, '-', '') FROM unnest($1::uuid[]) AS id
       ON CONFLICT (id) DO NOTHING
       RETURNING id
     ), ended_activations AS (
       UPDATE membership_grant_activation_periods SET ended_at = CURRENT_TIMESTAMP
       WHERE user_id = ANY($1::uuid[]) AND ended_at IS NULL
       RETURNING id
     ), ended_live AS (
       UPDATE memberships SET projection_ended_at = CURRENT_TIMESTAMP
       WHERE user_id = ANY($1::uuid[]) AND projection_ended_at IS NULL
         AND cancelled_at IS NULL AND expired_at IS NULL
       RETURNING id
     )
     SELECT (SELECT count(*) FROM inserted_users)
       + (SELECT count(*) FROM ended_activations)
       + (SELECT count(*) FROM ended_live)`,
    [userIds],
  )
  await write(
    `/* seedOrphanedQueuedGrants */
     WITH requested AS (
       SELECT id AS user_id FROM unnest($1::uuid[]) AS id
     ), needs_projection AS (
       SELECT user_id FROM requested
       WHERE NOT EXISTS (
         SELECT 1 FROM memberships membership
         WHERE membership.user_id = requested.user_id AND membership.projection_ended_at IS NULL
           AND (membership.cancelled_at IS NOT NULL OR membership.expired_at IS NOT NULL)
       )
     ), closed_sources AS (
       INSERT INTO membership_sources (user_id, source_kind)
       SELECT user_id, 'admin_grant'::membership_source_kinds FROM needs_projection
       RETURNING id, user_id
     ), closed_states AS (
       INSERT INTO membership_source_states (
         membership_source_id, source_kind, membership_product_id, effective_at, cancelled_at,
         should_auto_renew
       )
       SELECT id, 'admin_grant'::membership_source_kinds, $2::uuid,
         CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '1 day', false
       FROM closed_sources
       RETURNING membership_source_id
     ), closed_memberships AS (
       INSERT INTO memberships (
         user_id, membership_source_id, membership_product_id, effective_at, cancelled_at,
         should_cancel_at_period_end
       )
       SELECT closed_sources.user_id, closed_sources.id, $2::uuid,
         CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '1 day', false
       FROM closed_sources
       INNER JOIN closed_states ON closed_states.membership_source_id = closed_sources.id
       RETURNING user_id
     ), needs_grant AS (
       SELECT user_id FROM requested
       WHERE NOT EXISTS (
         SELECT 1 FROM membership_grants grant_row
         INNER JOIN membership_source_states source_state
           ON source_state.membership_source_id = grant_row.membership_source_id
         WHERE grant_row.user_id = requested.user_id AND grant_row.revoked_at IS NULL
           AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
           AND source_state.paused_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM membership_grant_activation_periods activation
             WHERE activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL
           )
       )
     ), queued_sources AS (
       INSERT INTO membership_sources (user_id, source_kind)
       SELECT user_id, 'admin_grant'::membership_source_kinds FROM needs_grant
       RETURNING id, user_id
     ), queued_grants AS (
       INSERT INTO membership_grants (
         membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot
       )
       SELECT id, user_id, $2::uuid, 30, 'explain issuer' FROM queued_sources
       RETURNING membership_source_id
     ), queued_states AS (
       INSERT INTO membership_source_states (
         membership_source_id, source_kind, membership_product_id, effective_at, should_auto_renew
       )
       SELECT membership_source_id, 'admin_grant'::membership_source_kinds, $2::uuid,
         CURRENT_TIMESTAMP, false
       FROM queued_grants
       RETURNING membership_source_id
     )
     SELECT (SELECT count(*) FROM closed_memberships) + (SELECT count(*) FROM queued_states)`,
    [userIds, productId],
  )
}

export async function seedUnmatchedQueuedGrantTail(
  userId: string,
  productId: string,
): Promise<void> {
  await write(
    `/* seedUnmatchedQueuedGrantTail */
     WITH inserted_user AS (
       INSERT INTO users (id, username)
       VALUES ($1::uuid, 'oq' || replace($1::text, '-', ''))
       ON CONFLICT (id) DO NOTHING
       RETURNING id
     ), already AS (
       SELECT 1 FROM membership_grants
       WHERE user_id = $1::uuid AND issuer_snapshot = 'explain noise'
       LIMIT 1
     ), sources AS (
       INSERT INTO membership_sources (user_id, source_kind)
       SELECT $1::uuid, 'admin_grant'::membership_source_kinds
       FROM generate_series(1, $2::integer)
       WHERE NOT EXISTS (SELECT 1 FROM already)
       RETURNING id, user_id
     ), grants AS (
       INSERT INTO membership_grants (
         membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot
       )
       SELECT id, user_id, $3::uuid, 30, 'explain noise' FROM sources
       RETURNING membership_source_id
     ), states AS (
       INSERT INTO membership_source_states (
         membership_source_id, source_kind, membership_product_id, effective_at, cancelled_at,
         should_auto_renew
       )
       SELECT membership_source_id, 'admin_grant'::membership_source_kinds, $3::uuid,
         CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '1 day', false
       FROM grants
       RETURNING membership_source_id
     )
     SELECT (SELECT count(*) FROM inserted_user) + (SELECT count(*) FROM states)`,
    [userId, ORPHANED_QUEUED_GRANT_NOISE_COUNT, productId],
  )
}
