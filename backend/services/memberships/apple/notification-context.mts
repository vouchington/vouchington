import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AppleMembershipProviderEnvironment } from './types.mts'

export type AppleProjectionContext = {
  applicationId: string
  providerContextId: string
  environment: AppleMembershipProviderEnvironment
  lineageId: string
  providerLineageId: string
}

export async function getAppleProjectionContext(
  evidenceId: string,
  query: QueryExecutor,
): Promise<AppleProjectionContext | null> {
  const { rows } = await query(sql`/* reconcileAppleNotification.context */
    SELECT provider_context.application_id AS "applicationId", provider_context.environment,
      evidence.membership_provider_context_id AS "providerContextId",
      evidence.membership_provider_lineage_id AS "lineageId", lineage.provider_lineage_id AS "providerLineageId"
    FROM membership_provider_evidence_records evidence
    INNER JOIN membership_provider_lineages lineage ON lineage.id = evidence.membership_provider_lineage_id
    INNER JOIN membership_provider_contexts provider_context
      ON provider_context.id = evidence.membership_provider_context_id
    WHERE evidence.id = ${evidenceId} AND evidence.verified_at IS NULL AND evidence.rejected_at IS NULL
    FOR UPDATE OF evidence`)
  return (rows[0] as AppleProjectionContext | undefined) ?? null
}

export async function getAppleProductMapping(
  context: AppleProjectionContext,
  productId: string | undefined,
  query: QueryExecutor,
) {
  const { rows } = await query(sql`/* reconcileAppleNotification.product */
    SELECT id AS "membershipProviderProductId", membership_product_id AS "membershipProductId",
      provider_product_id AS "providerProductId" FROM membership_provider_products
    WHERE membership_provider_context_id = ${context.providerContextId}
      AND provider_product_id = ${productId ?? null}
      AND retired_at IS NULL LIMIT 1`)
  return rows[0] as
    | {
        membershipProviderProductId: string
        membershipProductId: string
        providerProductId: string
      }
    | undefined
}

export async function getApplePurchaseIntent(
  token: string | undefined,
  context: AppleProjectionContext,
  membershipProviderProductId: string,
  query: QueryExecutor,
) {
  const { rows } = await query(sql`/* reconcileAppleNotification.purchaseIntent */
    SELECT id, user_id AS "userId" FROM membership_purchase_intents
    WHERE id = ${token ?? null} AND user_id IS NOT NULL
      AND membership_provider_context_id = ${context.providerContextId}
      AND membership_provider_product_id = ${membershipProviderProductId}
      AND launched_at IS NOT NULL AND failed_at IS NULL LIMIT 1`)
  return rows[0] as { id: string; userId: string } | undefined
}

export function getProjectionUserId(
  sourceKind: 'direct' | 'family',
  purchaseIntent: { id: string; userId: string } | undefined,
): string | null {
  if (sourceKind === 'direct') return purchaseIntent?.userId ?? null
  return null
}
