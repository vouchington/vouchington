import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getStripeMembershipSourceIdentity,
  type MembershipProviderSourceIdentity,
  type MembershipProviderSourceKind,
} from './create-types.mts'
import type { MembershipPlanSlug } from './types.mts'
import { createGrantSource } from './grants/create-source.mts'
import { createProviderMembershipSource } from './provider-source.mts'

export { InvalidMembershipGrantUserError } from './grants/create-source.mts'
export { createProviderMembershipSource } from './provider-source.mts'

export class InvalidMembershipGrantSkuError extends Error {
  constructor() {
    super('The membership product is not active for the requested plan')
    this.name = 'InvalidMembershipGrantSkuError'
  }
}

export async function getMembershipProductIdForCreation(
  options: {
    userId: string
    plan: MembershipPlanSlug
    skuId: string
    stripeSubscriptionId?: string | null
    providerEnvironment?: 'test' | 'production'
    providerApplicationId?: string
  },
  query: QueryExecutor,
): Promise<string> {
  if (!options.stripeSubscriptionId) {
    const { rows } = await query(
      sql`/* getActiveMembershipProduct */ SELECT id FROM membership_products WHERE id = ${options.skuId} AND plan = ${options.plan} AND retired_at IS NULL FOR SHARE`,
    )
    if (rows[0]) return (rows[0] as { id: string }).id
    throw new InvalidMembershipGrantSkuError()
  }

  const sourceIdentity = getStripeMembershipSourceIdentity({
    stripeSubscriptionId: options.stripeSubscriptionId,
    providerEnvironment: options.providerEnvironment,
    providerApplicationId: options.providerApplicationId,
  })
  return getMembershipProductIdForProviderSourceCreation(
    { ...options, sourceIdentity, sourceKind: 'direct' },
    query,
  )
}

export async function getMembershipProductIdForProviderSourceCreation(
  options: {
    userId: string
    plan: MembershipPlanSlug
    skuId: string
    sourceKind: MembershipProviderSourceKind
    sourceIdentity: MembershipProviderSourceIdentity
  },
  query: QueryExecutor,
): Promise<string> {
  const { rows } = await query(
    sql`/* getActiveMembershipProduct */ SELECT id FROM membership_products WHERE id = ${options.skuId} AND plan = ${options.plan} AND retired_at IS NULL FOR SHARE`,
  )
  if (rows[0]) return (rows[0] as { id: string }).id
  const { rows: retainedRows } = await query(sql`/* getRetainedMembershipProduct */
    SELECT product.id
    FROM membership_products product
    INNER JOIN membership_source_states source_state
      ON source_state.membership_product_id = product.id
    INNER JOIN membership_sources source ON source.id = source_state.membership_source_id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    WHERE product.id = ${options.skuId}
      AND product.plan = ${options.plan}
      AND source.user_id = ${options.userId}
      AND source.source_kind = ${options.sourceKind}
      AND lineage.provider = ${options.sourceIdentity.provider}
      AND lineage.environment = ${options.sourceIdentity.environment}
      AND lineage.application_id = ${options.sourceIdentity.applicationId}
      AND lineage.provider_lineage_id = ${options.sourceIdentity.providerLineageId}
    FOR SHARE OF product`)
  if (!retainedRows[0]) throw new InvalidMembershipGrantSkuError()
  return (retainedRows[0] as { id: string }).id
}

export async function createSource(
  options: {
    userId: string
    stripeSubscriptionId?: string | null
    stripeOriginatingInvoiceId?: string
    stripeCustomerId?: string | null
    grantedById?: string | null
    providerEnvironment?: 'test' | 'production'
    providerApplicationId?: string
    expiresAt?: Date | null
    durationDays?: number
    note?: string
  },
  productId: string,
  query: QueryExecutor,
): Promise<{
  id: string
  kind: 'direct' | 'admin_grant'
  bindingId: string | null
  lineageId: string | null
  grantId: string | null
  queued: boolean
  expiresAt: Date | null
}> {
  if (!options.stripeSubscriptionId)
    return { ...(await createGrantSource(options, productId, query)), bindingId: null }

  const sourceIdentity = getStripeMembershipSourceIdentity({
    stripeSubscriptionId: options.stripeSubscriptionId,
    providerEnvironment: options.providerEnvironment,
    providerApplicationId: options.providerApplicationId,
    stripeCustomerId: options.stripeCustomerId,
  })
  return {
    ...(await createProviderMembershipSource(
      {
        userId: options.userId,
        sourceKind: 'direct',
        sourceIdentity,
        stripeOriginatingInvoiceId: options.stripeOriginatingInvoiceId,
      },
      query,
    )),
    grantId: null,
    queued: false,
    expiresAt: null,
  }
}
