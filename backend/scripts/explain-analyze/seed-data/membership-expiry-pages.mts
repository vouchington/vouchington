import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const EXPIRY_PAGE_USER_IDS = [seedUuid(19_998, '01'), seedUuid(19_999, '01')]
export const EXPIRY_PAGE_MEMBERSHIP_IDS = [seedUuid(950_000, '31'), seedUuid(950_001, '31')]
const OTHER_USER_QUEUED_GRANTS = 256
const OTHER_USER_RETIRED_PROJECTIONS = 2_000
export const EXPIRY_PAGE_CLOSED_ACTIVATIONS = 3 + OTHER_USER_RETIRED_PROJECTIONS

/** Terminal current grants and FIFO queued replacements for two otherwise unrelated users. */
export async function seedMembershipExpiryPages(): Promise<void> {
  // Unrelated queued grants make a whole-grant-table scan visible to the page contracts.
  const users = [
    ...EXPIRY_PAGE_USER_IDS,
    ...EXPIRY_PAGE_USER_IDS,
    ...Array.from({ length: OTHER_USER_QUEUED_GRANTS }, () => seedUuid(19_997, '01')),
    seedUuid(19_996, '01'),
  ]
  const sources = users.map((_, index) => seedUuid(950_000 + index, '32'))
  const grants = users.map((_, index) => seedUuid(950_000 + index, '33'))
  await write(
    `/* seedMembershipExpiryPages */ INSERT INTO membership_sources (id, user_id, source_kind)
     SELECT source_id, user_id, 'admin_grant' FROM unnest($1::uuid[], $2::uuid[]) item(source_id,user_id)
     ON CONFLICT DO NOTHING`,
    [sources, users],
  )
  const { rows } = await write<{ id: string }>(
    `/* seedMembershipExpiryPages:product */ SELECT id FROM membership_products ORDER BY id LIMIT 1`,
  )
  const productId = rows[0]?.id
  if (!productId) throw new Error('Membership expiry fixture requires a product')
  await write(
    `/* seedMembershipExpiryPages:states */ INSERT INTO membership_source_states
       (membership_source_id, source_kind, membership_product_id, effective_at, expires_at, expired_at)
     SELECT source_id, 'admin_grant', $2, CURRENT_TIMESTAMP - INTERVAL '2 days',
       CASE WHEN ordinal <= 2 OR ordinal = $3 THEN CURRENT_TIMESTAMP - INTERVAL '1 day' END,
       CASE WHEN ordinal <= 2 OR ordinal = $3 THEN CURRENT_TIMESTAMP - INTERVAL '1 day' END
     FROM unnest($1::uuid[]) WITH ORDINALITY item(source_id,ordinal) ON CONFLICT DO NOTHING`,
    [sources, productId, users.length],
  )
  await write(
    `/* seedMembershipExpiryPages:grants */ INSERT INTO membership_grants
       (id,membership_source_id,user_id,membership_product_id,calendar_days,issuer_snapshot)
     SELECT grant_id, source_id, user_id, $4, 1, 'explain expiry page'
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) item(grant_id,source_id,user_id)
     ON CONFLICT DO NOTHING`,
    [grants, sources, users, productId],
  )
  await write(
    `/* seedMembershipExpiryPages:activations */ INSERT INTO membership_grant_activation_periods
       (id,membership_grant_id,user_id,started_at,ended_at)
     SELECT id,grant_id,user_id,CURRENT_TIMESTAMP - INTERVAL '2 days',CURRENT_TIMESTAMP - INTERVAL '1 day'
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) item(id,grant_id,user_id) ON CONFLICT DO NOTHING`,
    [
      [seedUuid(950_000, '34'), seedUuid(950_001, '34'), seedUuid(950_002, '34')],
      [grants[0], grants[1], grants.at(-1)],
      [users[0], users[1], users.at(-1)],
    ],
  )
  await write(
    `/* seedMembershipExpiryPages:memberships */ INSERT INTO memberships
       (id,user_id,membership_source_id,membership_product_id,effective_at,expires_at,expired_at)
     SELECT id,user_id,source_id,$4,CURRENT_TIMESTAMP - INTERVAL '2 days',
       CURRENT_TIMESTAMP - INTERVAL '1 day',CURRENT_TIMESTAMP - INTERVAL '1 day'
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) item(id,user_id,source_id) ON CONFLICT DO NOTHING`,
    [EXPIRY_PAGE_MEMBERSHIP_IDS, users.slice(0, 2), sources.slice(0, 2), productId],
  )
  // Closed history for another user must not turn the open-period antijoin into a table walk.
  await write(
    `/* seedMembershipExpiryPages:closedHistory */ INSERT INTO membership_grant_activation_periods
       (id,membership_grant_id,user_id,started_at,ended_at)
     SELECT id,$2,$3,CURRENT_TIMESTAMP - INTERVAL '3 days',
       CURRENT_TIMESTAMP - INTERVAL '3 days' + INTERVAL '1 millisecond'
     FROM unnest($1::uuid[]) item(id) ON CONFLICT DO NOTHING`,
    [
      Array.from({ length: OTHER_USER_RETIRED_PROJECTIONS }, (_, index) =>
        seedUuid(960_000 + index, '34'),
      ),
      grants.at(-1),
      users.at(-1),
    ],
  )
  // Historical projections belong to another user and must not be read by a two-change page.
  await write(
    `/* seedMembershipExpiryPages:retired */ INSERT INTO memberships
       (id,user_id,membership_source_id,membership_product_id,effective_at,expires_at,expired_at,projection_ended_at)
     SELECT id,$2,$3,$4,CURRENT_TIMESTAMP - INTERVAL '2 days',CURRENT_TIMESTAMP - INTERVAL '1 day',
       CURRENT_TIMESTAMP - INTERVAL '1 day',CURRENT_TIMESTAMP - INTERVAL '1 day'
     FROM unnest($1::uuid[]) item(id) ON CONFLICT DO NOTHING`,
    [
      Array.from({ length: OTHER_USER_RETIRED_PROJECTIONS }, (_, index) =>
        seedUuid(960_000 + index, '31'),
      ),
      users.at(-1),
      sources.at(-1),
      productId,
    ],
  )
  await write(
    `/* seedMembershipExpiryPages:analyze */ ANALYZE memberships, membership_sources,
     membership_source_states, membership_grants, membership_grant_activation_periods,
     membership_changes, membership_entitlement_effects`,
  )
}
