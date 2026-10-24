import { write } from '@data-stores/psql'

/** Due grant projections are sparse among 10k live admin-grant memberships. */
export async function seedMembershipExpirySelection3511(): Promise<void> {
  console.log('Seeding 10000 admin-grant memberships with 100 due...')
  await write(`/* seedMembershipExpirySelection3511:sources */
    WITH owners AS (
      SELECT id, row_number() OVER (ORDER BY id DESC) AS ordinal
      FROM users user_row
      WHERE user_row.id::text LIKE '019e0000-0100-%'
        AND NOT EXISTS (SELECT 1 FROM memberships membership
          WHERE membership.user_id = user_row.id AND membership.projection_ended_at IS NULL)
      ORDER BY id DESC LIMIT 10000
    )
    INSERT INTO membership_sources (id, user_id, source_kind)
    SELECT ('019e0000-b500-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      id, 'admin_grant'
    FROM owners ON CONFLICT DO NOTHING`)
  await write(`/* seedMembershipExpirySelection3511:grants */
    INSERT INTO membership_grants
      (id, membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot)
    SELECT ('019e0000-b600-7000-8000-' || right(source.id::text, 12))::uuid,
      source.id, source.user_id,
      (SELECT id FROM membership_products ORDER BY id LIMIT 1),
      100, 'Synthetic EXPLAIN grant'
    FROM membership_sources source WHERE source.id::text LIKE '019e0000-b500-%'
    ON CONFLICT DO NOTHING`)
  await write(`/* seedMembershipExpirySelection3511:states */
    INSERT INTO membership_source_states
      (membership_source_id, source_kind, membership_product_id, effective_at, expires_at)
    SELECT source.id, 'admin_grant',
      (SELECT id FROM membership_products ORDER BY id LIMIT 1),
      NOW() - INTERVAL '100 days',
      CASE WHEN (('x' || right(source.id::text, 12))::bit(48)::bigint % 100) = 0
        THEN NOW() - INTERVAL '1 day'
        ELSE NOW() + INTERVAL '1 day' END
    FROM membership_sources source WHERE source.id::text LIKE '019e0000-b500-%'
    ON CONFLICT DO NOTHING`)
  await write(`/* seedMembershipExpirySelection3511:memberships */
    INSERT INTO memberships
      (id, user_id, membership_source_id, source_kind, membership_product_id, effective_at, expires_at)
    SELECT ('019e0000-b700-7000-8000-' || right(source.id::text, 12))::uuid,
      source.user_id, source.id, 'admin_grant',
      (SELECT id FROM membership_products ORDER BY id LIMIT 1),
      NOW() - INTERVAL '100 days',
      CASE WHEN (('x' || right(source.id::text, 12))::bit(48)::bigint % 100) = 0
        THEN NOW() - INTERVAL '1 day' ELSE NOW() + INTERVAL '1 day' END
    FROM membership_sources source WHERE source.id::text LIKE '019e0000-b500-%'
    ON CONFLICT DO NOTHING`)
}
