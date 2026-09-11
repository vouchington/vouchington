import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { DEFAULT_STRIPE_CATALOG_CONTEXT, type StripeCatalogContext } from '../get-catalog.mts'

export type ManageableStripeSubscription = {
  membershipId: string
  membershipSourceId: string
  subscriptionId: string
  customerId: string
  retainedWhileGrantActive: boolean
}

export async function getManageableStripeSubscriptionByUserId(
  userId: string,
  context: StripeCatalogContext = DEFAULT_STRIPE_CATALOG_CONTEXT,
): Promise<ManageableStripeSubscription | null> {
  const { rows } = await read(sql`/* getManageableStripeSubscriptionByUserId */
    SELECT membership.id AS membership_id,
      source.id AS membership_source_id,
      lineage.provider_lineage_id AS subscription_id,
      lineage.provider_account_id AS customer_id,
      membership.projection_ended_at IS NOT NULL AS retained_while_grant_active
    FROM membership_sources source
    INNER JOIN membership_source_states state ON state.membership_source_id = source.id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    INNER JOIN membership_lineage_bindings binding
      ON binding.membership_provider_lineage_id = lineage.id
      AND binding.source_kind = 'direct'
      AND binding.user_id = ${userId}
      AND binding.released_at IS NULL
    INNER JOIN LATERAL (
      SELECT id, projection_ended_at
      FROM memberships
      WHERE membership_source_id = source.id
        AND user_id = ${userId}
      ORDER BY projection_ended_at DESC NULLS FIRST, created_at DESC, id DESC
      LIMIT 1
    ) membership ON true
    WHERE source.user_id = ${userId}
      AND source.source_kind = 'direct'
      AND state.cancelled_at IS NULL
      AND state.expired_at IS NULL
      AND (membership.projection_ended_at IS NULL OR state.paused_at IS NOT NULL)
      AND lineage.provider = 'stripe'
      AND lineage.environment = ${context.environment}
      AND lineage.application_id = ${context.applicationId}
      AND lineage.provider_account_id IS NOT NULL
    ORDER BY membership.projection_ended_at DESC NULLS FIRST, membership.id DESC, source.id DESC
    LIMIT 1
  `)
  const row = rows[0] as
    | {
        membership_id: string
        membership_source_id: string
        subscription_id: string
        customer_id: string
        retained_while_grant_active: boolean
      }
    | undefined
  if (!row) return null
  return {
    membershipId: row.membership_id,
    membershipSourceId: row.membership_source_id,
    subscriptionId: row.subscription_id,
    customerId: row.customer_id,
    retainedWhileGrantActive: row.retained_while_grant_active,
  }
}
