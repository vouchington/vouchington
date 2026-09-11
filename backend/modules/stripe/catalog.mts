import Stripe from 'stripe'
import { getStripeClient } from './client.mts'

const CATALOG_VERSION = 'v1'

export type StripeRecurringCatalogPrice = {
  lookupKey: string
  productName: string
  unitAmount: number
  interval: 'month' | 'year'
}

/* no-mistakes: integration=stripe */
export async function resolveRecurringCatalogPrice(
  expected: StripeRecurringCatalogPrice,
): Promise<Stripe.Price> {
  const stripe = getStripeClient()
  const existing = await findRecurringCatalogPrice(stripe, expected.lookupKey)
  if (existing) return validateRecurringCatalogPrice(stripe, existing, expected)
  try {
    const created = await stripe.prices.create(
      {
        currency: 'usd',
        unit_amount: expected.unitAmount,
        recurring: { interval: expected.interval, interval_count: 1 },
        lookup_key: expected.lookupKey,
        product_data: {
          name: expected.productName,
          metadata: {
            voucha_catalog_lookup_key: expected.lookupKey,
            voucha_catalog_version: CATALOG_VERSION,
          },
        },
      },
      { idempotencyKey: `voucha-membership-${expected.lookupKey}` },
    )
    return validateRecurringCatalogPrice(stripe, created, expected)
  } catch (error) {
    if (!isLookupKeyCreateRace(error)) throw error
    const raced = await findRecurringCatalogPrice(stripe, expected.lookupKey)
    if (!raced) throw error
    return validateRecurringCatalogPrice(stripe, raced, expected)
  }
}

async function findRecurringCatalogPrice(
  stripe: Stripe,
  lookupKey: string,
): Promise<Stripe.Price | null> {
  const listed = await stripe.prices.list({
    lookup_keys: [lookupKey],
    expand: ['data.product'],
    limit: 2,
  })
  if (listed.data.length > 1)
    throw new Error(`Stripe catalog lookup key ${lookupKey} resolves to multiple prices`)
  return listed.data[0] ?? null
}

async function validateRecurringCatalogPrice(
  stripe: Stripe,
  price: Stripe.Price,
  expected: StripeRecurringCatalogPrice,
): Promise<Stripe.Price> {
  const product =
    typeof price.product === 'string'
      ? await stripe.products.retrieve(price.product)
      : price.product
  if (!product || product.deleted || !price.active || !product.active)
    throw new Error(
      `Stripe catalog price ${expected.lookupKey} is inactive; create a new catalog version`,
    )
  if (
    price.lookup_key !== expected.lookupKey ||
    price.currency !== 'usd' ||
    price.unit_amount !== expected.unitAmount ||
    price.recurring?.interval !== expected.interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== 'licensed' ||
    price.billing_scheme !== 'per_unit' ||
    price.transform_quantity !== null ||
    product.name !== expected.productName ||
    product.metadata.voucha_catalog_version !== CATALOG_VERSION ||
    product.metadata.voucha_catalog_lookup_key !== expected.lookupKey
  )
    throw new Error(
      `Stripe catalog price ${expected.lookupKey} does not match the immutable v1 descriptor`,
    )
  return price
}

function isLookupKeyCreateRace(error: unknown): error is Stripe.errors.StripeInvalidRequestError {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    error.code === 'resource_already_exists' &&
    error.param === 'lookup_key'
  )
}
