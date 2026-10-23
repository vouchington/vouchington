import type Stripe from 'stripe'
import {
  buildRecurringCatalogPriceParams,
  buildCatalogPriceLookupParams,
  pickCatalogPrice,
  validateRecurringCatalogPrice as validateCatalogPrice,
  isStripeResourceExistsError,
} from '@vouchington/stripe'
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
      buildRecurringCatalogPriceParams(catalogDescriptor(expected)),
      { idempotencyKey: `voucha-membership-${expected.lookupKey}` },
    )
    return await validateRecurringCatalogPrice(stripe, created, expected)
  } catch (err) {
    if (!isStripeResourceExistsError(err, 'lookup_key')) throw err
    const raced = await findRecurringCatalogPrice(stripe, expected.lookupKey)
    if (!raced) throw err
    return validateRecurringCatalogPrice(stripe, raced, expected)
  }
}

async function findRecurringCatalogPrice(
  stripe: Stripe,
  lookupKey: string,
): Promise<Stripe.Price | null> {
  const listed = await stripe.prices.list(buildCatalogPriceLookupParams(lookupKey))
  return pickCatalogPrice(listed.data, lookupKey)
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
  return validateCatalogPrice(price, product, catalogDescriptor(expected))
}

function catalogDescriptor(expected: StripeRecurringCatalogPrice) {
  return {
    ...expected,
    currency: 'usd',
    productMetadata: {
      voucha_catalog_lookup_key: expected.lookupKey,
      voucha_catalog_version: CATALOG_VERSION,
    },
  }
}
