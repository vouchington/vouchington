import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { parsePostgresMoneyAmount } from '@vouchington/utils/money'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipSourceIdentity,
} from './create-types.mts'
import type { MembershipSku } from './types.mts'

export const DEFAULT_STRIPE_CATALOG_CONTEXT = {
  environment: STRIPE_PROVIDER_ENVIRONMENT,
  ...DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
} as const

export type StripeCatalogContext = {
  environment: 'test' | 'production'
  applicationId: string
}

/**
 * Resolves the price observed on a Stripe lifecycle event. Historical Stripe events remain
 * interpretable after a provider mapping or canonical product has retired.
 */
export async function getSkuByStripePriceIdForLifecycle(
  stripePriceId: string,
  sourceIdentity: StripeMembershipSourceIdentity,
): Promise<MembershipSku | null> {
  const { rows } = await read(sql`/* getSkuByStripePriceIdForLifecycle */
    SELECT
      p.id, p.plan, provider_product.price_minor_units, p.billing_interval AS interval, provider_product.currency_code,
      provider_product.provider_product_id AS stripe_price_id, p.retired_at, p.created_at, p.updated_at
    FROM membership_provider_products provider_product
    INNER JOIN membership_products p ON p.id = provider_product.membership_product_id
    INNER JOIN membership_provider_contexts context
      ON context.id = provider_product.membership_provider_context_id
    WHERE context.provider = ${sourceIdentity.provider}
      AND provider_product.provider_product_id = ${stripePriceId}
      AND context.environment = ${sourceIdentity.environment}
      AND context.application_id = ${sourceIdentity.applicationId}
      AND (
        (provider_product.retired_at IS NULL AND p.retired_at IS NULL)
        OR EXISTS (
          SELECT 1
          FROM membership_source_states source_state
          INNER JOIN membership_sources source ON source.id = source_state.membership_source_id
          INNER JOIN membership_provider_lineages lineage
            ON lineage.id = source.membership_provider_lineage_id
          WHERE source.user_id IS NOT NULL
            AND source.source_kind = 'direct'
            AND lineage.membership_provider_context_id = provider_product.membership_provider_context_id
            AND lineage.provider_lineage_id = ${sourceIdentity.providerLineageId}
        )
      )
    LIMIT 1
  `)
  return mapMembershipSku(rows[0])
}

type MembershipSkuRow = Omit<MembershipSku, 'price'> & {
  price_minor_units: string | null
  currency_code: MembershipSku['price']['currency'] | null
}

function mapMembershipSku(row: unknown): MembershipSku | null {
  if (!row) return null
  const { price_minor_units, currency_code, ...sku } = row as MembershipSkuRow
  if (price_minor_units === null || currency_code === null) return null
  return {
    ...sku,
    price: {
      amount: parsePostgresMoneyAmount(price_minor_units),
      currency: currency_code,
    },
  }
}
