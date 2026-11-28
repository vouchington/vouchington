import createHttpError from 'http-errors'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { resolveRecurringCatalogPrice } from '@modules/stripe/catalog'
import { DEFAULT_STRIPE_CATALOG_CONTEXT, type StripeCatalogContext } from './get-catalog.mts'
import { publishStripeCatalogMapping } from './stripe-catalog-mappings.mts'
import { getOrCreateProviderContextId } from './provider-context.mts'
import { getMembershipWorkLimits } from './work-limits.mts'
const CATALOG = [
  {
    plan: 'plus',
    interval: 'monthly',
    amount: 500,
    lookupKey: 'voucha_membership_v1_plus_monthly_usd',
    productName: 'Voucha Plus Monthly',
    stripeInterval: 'month',
  },
  {
    plan: 'plus',
    interval: 'yearly',
    amount: 5000,
    lookupKey: 'voucha_membership_v1_plus_yearly_usd',
    productName: 'Voucha Plus Yearly',
    stripeInterval: 'year',
  },
  {
    plan: 'pro',
    interval: 'monthly',
    amount: 1000,
    lookupKey: 'voucha_membership_v1_pro_monthly_usd',
    productName: 'Voucha Pro Monthly',
    stripeInterval: 'month',
  },
  {
    plan: 'pro',
    interval: 'yearly',
    amount: 10000,
    lookupKey: 'voucha_membership_v1_pro_yearly_usd',
    productName: 'Voucha Pro Yearly',
    stripeInterval: 'year',
  },
] as const
export async function reconcileStripeMembershipCatalog({
  context = DEFAULT_STRIPE_CATALOG_CONTEXT,
  resolvePrice = resolveRecurringCatalogPrice,
}: {
  context?: StripeCatalogContext
  resolvePrice?: typeof resolveRecurringCatalogPrice
} = {}): Promise<void> {
  const { rows: startedRows } = await write<{ started_at: Date }>(
    sql`/* reconcileStripeMembershipCatalog: attempt start */ SELECT clock_timestamp() AS started_at`,
  )
  const startedAt = startedRows[0]!.started_at
  try {
    await reconcileStripeMembershipCatalogBody(context, resolvePrice)
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      err.code === '23505' &&
      'constraint' in err &&
      (err.constraint === 'idx_membership_provider_products__active_sku' ||
        err.constraint === 'idx_membership_provider_products__provider_identity')
    )
      throw createHttpError(409, 'Concurrent membership catalog publication', {
        code: 'MEMBERSHIP_CATALOG_CONFLICT',
        cause: err,
      })
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      err.code === 'MEMBERSHIP_CATALOG_MAPPING_LIMIT_REACHED'
    )
      throw err
    await retireStripeCatalogMappings(context, err, startedAt)
    throw err
  }
}

async function reconcileStripeMembershipCatalogBody(
  context: StripeCatalogContext,
  resolvePrice: typeof resolveRecurringCatalogPrice,
): Promise<void> {
  const prices = await Promise.all(
    CATALOG.map(item =>
      resolvePrice({
        lookupKey: item.lookupKey,
        productName: item.productName,
        unitAmount: item.amount,
        interval: item.stripeInterval,
      }),
    ),
  )
  await using transaction = await beginTransaction()
  const contextId = await getOrCreateProviderContextId(
    { provider: 'stripe', ...context },
    transaction,
  )
  const { rows } = await write(
    sql`/* reconcileStripeMembershipCatalog: read canonical products */
      SELECT id, plan, billing_interval FROM membership_products
      WHERE retired_at IS NULL ORDER BY plan, billing_interval`,
    { query: transaction },
  )
  /* v8 ignore next -- defensive: the seeded canonical product set is structurally fixed. */
  if (rows.length !== CATALOG.length)
    throw new Error('Stripe catalog requires exactly four active canonical membership products')
  for (const [index, descriptor] of CATALOG.entries()) {
    const product = rows.find(
      row => row.plan === descriptor.plan && row.billing_interval === descriptor.interval,
    ) as { id: string } | undefined
    /* v8 ignore next -- defensive: row count plus canonical uniqueness covers every descriptor. */
    if (!product)
      throw new Error(
        `Missing canonical membership product ${descriptor.plan}/${descriptor.interval}`,
      )
    const price = prices[index]!
    // eslint-disable-next-line no-await-in-loop -- publish the selected canonical mappings in a consistent order.
    await publishStripeCatalogMapping({
      membershipProductId: product.id,
      providerProductId: price.id,
      skuId: descriptor.lookupKey,
      amount: descriptor.amount,
      context,
      query: transaction,
    })
  }
  const { batchSize } = getMembershipWorkLimits()
  while (true) {
    // oxlint-disable no-await-in-loop -- bounded batch UPDATE retires superseded active Stripe mappings
    // no-mistakes-disable-next-line query-reached-per-item: batched UPDATE retiring superseded Stripe catalog mappings in DynamicConfig batchSize pages (hard max 5000)
    const { rowCount } = await write(
      sql`/* reconcileStripeMembershipCatalog: retire superseded mappings */
        WITH target AS (
          SELECT id
          FROM membership_provider_products
          WHERE membership_provider_context_id = ${contextId}::UUID AND retired_at IS NULL
            AND updated_at < CURRENT_TIMESTAMP
            AND provider_product_id NOT IN (${prices[0]!.id}, ${prices[1]!.id}, ${prices[2]!.id}, ${prices[3]!.id})
          ORDER BY id
          LIMIT ${batchSize}
        )
        UPDATE membership_provider_products mapping
        SET retired_at = CURRENT_TIMESTAMP
        FROM target
        WHERE mapping.id = target.id`,
      { query: transaction },
    )
    // oxlint-enable no-await-in-loop
    if ((rowCount ?? 0) < batchSize) break
  }
  await transaction.commit()
}

async function retireStripeCatalogMappings(
  context: StripeCatalogContext,
  providerError: unknown,
  startedAt: Date,
): Promise<void> {
  try {
    await using transaction = await beginTransaction()
    const contextId = await getOrCreateProviderContextId(
      { provider: 'stripe', ...context },
      transaction,
    )
    const { batchSize } = getMembershipWorkLimits()
    while (true) {
      // oxlint-disable no-await-in-loop -- bounded batch UPDATE retires active Stripe mappings on reconciliation failure
      // no-mistakes-disable-next-line query-reached-per-item: batched UPDATE retiring active Stripe catalog mappings on failure in DynamicConfig batchSize pages (hard max 5000)
      const { rowCount } = await write(
        sql`/* reconcileStripeMembershipCatalog: fail closed */
          UPDATE membership_provider_products
          SET retired_at = CURRENT_TIMESTAMP
          WHERE id IN (
            SELECT id
            FROM membership_provider_products
            WHERE membership_provider_context_id = ${contextId}::UUID AND retired_at IS NULL
              AND updated_at < ${startedAt}
            ORDER BY id
            LIMIT ${batchSize}
          )`,
        { query: transaction },
      )
      // oxlint-enable no-await-in-loop
      if ((rowCount ?? 0) < batchSize) break
    }
    await transaction.commit()
  } catch (err) {
    throw new AggregateError(
      [providerError, err],
      'Stripe catalog reconciliation failed and the active catalog could not be retired',
      { cause: err },
    )
  }
}
