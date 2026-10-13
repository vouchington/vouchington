import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { DEFAULT_STRIPE_CATALOG_CONTEXT, type StripeCatalogContext } from '../get-catalog.mts'

/**
 * Reads the manageable direct subscription from the primary.
 * A replica miss would delete the only work row and leave collection running.
 */
export async function loadPauseCollectionDirectSubscriptionId(
  userId: string,
  context: StripeCatalogContext = DEFAULT_STRIPE_CATALOG_CONTEXT,
): Promise<string | null> {
  const { rows } = await write<{ subscriptionId: string }>(
    sql`/* loadPauseCollectionDirectSubscriptionId */
      SELECT lineage.provider_lineage_id AS "subscriptionId"
      FROM membership_sources source
      INNER JOIN membership_source_states state ON state.membership_source_id = source.id
      INNER JOIN membership_provider_lineages lineage
        ON lineage.id = source.membership_provider_lineage_id
      INNER JOIN membership_provider_contexts provider_context
        ON provider_context.id = lineage.membership_provider_context_id
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
        ORDER BY projection_ended_at DESC NULLS FIRST, id DESC
        LIMIT 1
      ) membership ON true
      WHERE source.user_id = ${userId}
        AND source.source_kind = 'direct'
        AND state.cancelled_at IS NULL
        AND state.expired_at IS NULL
        AND (membership.projection_ended_at IS NULL OR state.paused_at IS NOT NULL)
        AND provider_context.provider = 'stripe'
        AND provider_context.environment = ${context.environment}
        AND provider_context.application_id = ${context.applicationId}
        AND lineage.provider_account_id IS NOT NULL
      ORDER BY membership.projection_ended_at DESC NULLS FIRST, membership.id DESC, source.id DESC
      LIMIT 1
    `,
  )
  return rows[0]?.subscriptionId ?? null
}
