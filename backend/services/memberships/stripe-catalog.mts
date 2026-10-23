import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { resolveRecurringCatalogPrice } from '@modules/stripe/catalog'
import { DEFAULT_STRIPE_CATALOG_CONTEXT, type StripeCatalogContext } from './get-catalog.mts'
import { withStripeCatalogReconciliationLock } from './stripe-catalog-lock.mts'
import { publishStripeCatalogMapping } from './stripe-catalog-mappings.mts'
import { getOrCreateProviderContextId } from './provider-context.mts'
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
  await withStripeCatalogReconciliationLock(context, async () => {
    try {
      await reconcileLockedStripeMembershipCatalog(context, resolvePrice)
    } catch (err) {
      await retireStripeCatalogMappings(context, err)
      throw err
    }
  })
}

async function reconcileLockedStripeMembershipCatalog(
  context: StripeCatalogContext,
  resolvePrice: typeof resolveRecurringCatalogPrice,
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
  const contextId = await getOrCreateProviderContextId(
    { provider: 'stripe', ...context },
    transaction,
  )
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
      WHERE membership_provider_context_id = ${contextId}::UUID AND retired_at IS NULL
        AND provider_product_id NOT IN (${prices[0]!.id}, ${prices[1]!.id}, ${prices[2]!.id}, ${prices[3]!.id})`,
    { query: transaction },
  )
  await transaction.commit()
}

async function retireStripeCatalogMappings(
  context: StripeCatalogContext,
  providerError: unknown,
): Promise<void> {
  try {
    await using transaction = await beginTransaction()
    const contextId = await getOrCreateProviderContextId(
      { provider: 'stripe', ...context },
      transaction,
    )
    await write(
      sql`/* reconcileStripeMembershipCatalog: fail closed */
        UPDATE membership_provider_products SET retired_at = CURRENT_TIMESTAMP
        WHERE membership_provider_context_id = ${contextId}::UUID AND retired_at IS NULL`,
      { query: transaction },
    )
    await transaction.commit()
  } catch (err) {
    throw new AggregateError(
      [providerError, err],
      'Stripe catalog reconciliation failed and the active catalog could not be retired',
      { cause: err },
    )
  }
}
