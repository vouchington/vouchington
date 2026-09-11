import { read, type QueryExecutor, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '../create-types.mts'

export async function getMembershipSourceIdByMembershipId(
  membershipId: string,
): Promise<string | null> {
  const { rows } = await read(sql`/* getMembershipSourceIdByMembershipId */
    SELECT membership_source_id
    FROM memberships
    WHERE id = ${membershipId}
  `)
  const row = rows[0] as { membership_source_id: string } | undefined
  return row?.membership_source_id ?? null
}

export async function getStripeSubscriptionIdByMembershipSourceId(
  membershipSourceId: string,
): Promise<string | null> {
  const { rows } = await read(sql`/* getStripeSubscriptionIdByMembershipSourceId */
    SELECT lineage.provider_lineage_id AS stripe_subscription_id
    FROM membership_sources source
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    WHERE source.id = ${membershipSourceId}
      AND lineage.provider = 'stripe'
    LIMIT 1
  `)
  const row = rows[0] as { stripe_subscription_id: string } | undefined
  return row?.stripe_subscription_id ?? null
}

export async function getMembershipSourceCancelledAt(
  membershipSourceId: string,
  query: QueryExecutor = write,
): Promise<Date | null> {
  const { rows } = await query(sql`/* getMembershipSourceCancelledAt */
    SELECT cancelled_at
    FROM membership_source_states
    WHERE membership_source_id = ${membershipSourceId}
  `)
  const row = rows[0] as { cancelled_at: Date | null } | undefined
  return row?.cancelled_at ?? null
}

export async function getMembershipRefundTargetByStripeSubscriptionId(
  subscriptionId: string,
  providerEnvironment: 'test' | 'production',
  originatedAt: Date,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<{ membershipId: string; userId: string; membershipSourceId: string } | null> {
  const { rows } = await read(sql`/* getMembershipRefundTargetByStripeSubscriptionId */
    WITH refund_source AS MATERIALIZED (
      SELECT source.id AS membership_source_id,
        origin_binding.bound_at, origin_binding.released_at, origin_binding.user_id,
        uuidv7(
          origin_binding.bound_at - clock_timestamp() - INTERVAL '1 second'
        ) AS lower_change_id,
        CASE WHEN origin_binding.released_at IS NULL THEN NULL ELSE uuidv7(
          origin_binding.released_at - clock_timestamp() + INTERVAL '1 second'
        ) END AS upper_change_id
      FROM membership_provider_lineages lineage
      INNER JOIN membership_sources source
        ON source.membership_provider_lineage_id = lineage.id
        AND source.source_kind = 'direct'
      INNER JOIN LATERAL (
        SELECT binding.bound_at, binding.released_at, binding.user_id
        FROM membership_lineage_bindings binding
        WHERE binding.membership_provider_lineage_id = lineage.id
          AND binding.source_kind = 'direct'
          AND ${originatedAt} < COALESCE(binding.released_at, 'infinity'::timestamptz)
          AND (
            binding.bound_at <= ${originatedAt}
            OR NOT EXISTS (
              SELECT 1 FROM membership_lineage_bindings prior_binding
              WHERE prior_binding.membership_provider_lineage_id = lineage.id
                AND prior_binding.source_kind = 'direct'
                AND prior_binding.bound_at <= ${originatedAt}
            )
          )
        ORDER BY
          (binding.bound_at <= ${originatedAt}) DESC,
          CASE WHEN binding.bound_at <= ${originatedAt} THEN binding.bound_at END DESC,
          CASE WHEN binding.bound_at > ${originatedAt} THEN binding.bound_at END,
          binding.id DESC
        LIMIT 1
      ) origin_binding ON true
      WHERE lineage.provider = 'stripe'
        AND lineage.environment = ${providerEnvironment}
        AND lineage.application_id = ${applicationContext.applicationId}
        AND lineage.provider_lineage_id = ${subscriptionId}
    )
    SELECT membership_change.membership_id, membership_change.user_id,
      source.membership_source_id
    FROM refund_source source
    INNER JOIN LATERAL (
      SELECT membership_id, user_id, target_id
      FROM (
        SELECT membership.id AS membership_id, membership.user_id,
          membership.id AS target_id, 0 AS target_priority
        FROM memberships membership
        WHERE membership.membership_source_id = source.membership_source_id
          AND source.released_at IS NULL
          AND membership.user_id = source.user_id
        UNION ALL
        SELECT membership_change.membership_id, membership_change.user_id,
          membership_change.id AS target_id, 1 AS target_priority
        FROM membership_changes membership_change
        WHERE membership_change.membership_source_id = source.membership_source_id
          AND membership_change.id >= source.lower_change_id
          AND membership_change.id < COALESCE(
            source.upper_change_id,
            'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
          )
          AND uuid_extract_timestamp(membership_change.id) >= source.bound_at
          AND (
            source.released_at IS NULL
            OR uuid_extract_timestamp(membership_change.id) < source.released_at
          )
      ) source_target
      ORDER BY target_priority, target_id DESC
      LIMIT 1
    ) membership_change ON true
    ORDER BY membership_change.target_id DESC
    LIMIT 1
  `)
  const row = rows[0] as
    | { membership_id: string; user_id: string; membership_source_id: string }
    | undefined
  if (!row) return null
  return {
    membershipId: row.membership_id,
    userId: row.user_id,
    membershipSourceId: row.membership_source_id,
  }
}
