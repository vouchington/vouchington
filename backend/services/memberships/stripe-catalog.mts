import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { resolveRecurringCatalogPrice } from '@modules/stripe/catalog'
import {
  DEFAULT_STRIPE_CATALOG_CONTEXT,
  invalidateMembershipProductCaches,
  type StripeCatalogContext,
} from './get-catalog.mts'
import { withStripeCatalogReconciliationLock } from './stripe-catalog-lock.mts'
import { publishStripeCatalogMapping } from './stripe-catalog-mappings.mts'
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
  invalidateCaches = invalidateMembershipProductCaches,
}: {
  context?: StripeCatalogContext
  resolvePrice?: typeof resolveRecurringCatalogPrice
  invalidateCaches?: typeof invalidateMembershipProductCaches
} = {}): Promise<void> {
  await withStripeCatalogReconciliationLock(context, async () => {
    try {
      await reconcileLockedStripeMembershipCatalog(context, resolvePrice, invalidateCaches)
    } catch (error) {
      await retireStripeCatalogMappings(context, invalidateCaches, error)
      throw error
    }
  })
}

async function reconcileLockedStripeMembershipCatalog(
  context: StripeCatalogContext,
  resolvePrice: typeof resolveRecurringCatalogPrice,
  invalidateCaches: typeof invalidateMembershipProductCaches,
): Promise<void> {
  let prices: Awaited<ReturnType<typeof resolveRecurringCatalogPrice>>[]
  prices = await Promise.all(
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
  const { rows } = await write(
    sql`/* reconcileStripeMembershipCatalog: lock canonical products */
      SELECT id, plan, billing_interval FROM membership_products
      WHERE retired_at IS NULL ORDER BY plan, billing_interval FOR NO KEY UPDATE`,
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
    // eslint-disable-next-line no-await-in-loop -- one transaction serializes canonical mapping publication.
    await publishStripeCatalogMapping({
      membershipProductId: product.id,
      providerProductId: price.id,
      skuId: descriptor.lookupKey,
      amount: descriptor.amount,
      context,
      query: transaction,
    })
  }
  await write(
    sql`/* reconcileStripeMembershipCatalog: retire superseded mappings */
      UPDATE membership_provider_products SET retired_at = CURRENT_TIMESTAMP
      WHERE provider = 'stripe' AND environment = ${context.environment}
        AND application_id = ${context.applicationId} AND retired_at IS NULL
        AND provider_product_id NOT IN (${prices[0]!.id}, ${prices[1]!.id}, ${prices[2]!.id}, ${prices[3]!.id})`,
    { query: transaction },
  )
  await transaction.commit()
  await invalidateCaches()
}

async function retireStripeCatalogMappings(
  context: StripeCatalogContext,
  invalidateCaches: typeof invalidateMembershipProductCaches,
  providerError: unknown,
): Promise<void> {
  try {
    await using transaction = await beginTransaction()
    await write(
      sql`/* reconcileStripeMembershipCatalog: fail closed */
        UPDATE membership_provider_products SET retired_at = CURRENT_TIMESTAMP
        WHERE provider = 'stripe' AND environment = ${context.environment}
          AND application_id = ${context.applicationId} AND retired_at IS NULL`,
      { query: transaction },
    )
    await transaction.commit()
    await invalidateCaches()
  } catch (disableError) {
    throw new AggregateError(
      [providerError, disableError],
      'Stripe catalog reconciliation failed and the active catalog could not be retired',
      { cause: disableError },
    )
  }
}
export async function isStripeMembershipCatalogReady(
  context: StripeCatalogContext = DEFAULT_STRIPE_CATALOG_CONTEXT,
): Promise<boolean> {
  const { rows } = await write(
    sql`/* isStripeMembershipCatalogReady */
      SELECT product.plan, product.billing_interval, mapping.sku_id, mapping.price_minor_units, mapping.currency_code
      FROM membership_provider_products mapping
      INNER JOIN membership_products product ON product.id = mapping.membership_product_id
      WHERE mapping.provider = 'stripe' AND mapping.environment = ${context.environment}
        AND mapping.application_id = ${context.applicationId} AND mapping.retired_at IS NULL
        AND product.retired_at IS NULL`,
  )
  return (
    rows.length === CATALOG.length &&
    CATALOG.every(item =>
      rows.some(
        row =>
          row.plan === item.plan &&
          row.billing_interval === item.interval &&
          row.sku_id === item.lookupKey &&
          Number(row.price_minor_units) === item.amount &&
          row.currency_code === 'usd',
      ),
    )
  )
}
