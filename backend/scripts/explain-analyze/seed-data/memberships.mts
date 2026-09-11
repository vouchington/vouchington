import { beginTransaction, write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const MEMBERSHIP_SEED_COUNT = 300
export const MEMBERSHIP_REFUND_SEED_COUNT = 2000

// Rows deliberately pinned to one stripe_charge_id / stripe_payment_intent_id so the
// EXPLAIN scenarios (run-scenarios/memberships.mts) have a small, selective result set.
export const SEED_MEMBERSHIP_REFUND_CHARGE_ID = 'ch_seed_explain_target'
export const SEED_MEMBERSHIP_REFUND_PAYMENT_INTENT_ID = 'pi_seed_explain_target'

const MEMBERSHIP_REFUND_CHARGE_TARGET_ROWS = 8
const MEMBERSHIP_REFUND_PAYMENT_INTENT_TARGET_ROWS = 8

const MEMBERSHIP_PRODUCTS = [
  {
    plan: 'plus',
    priceMinorUnits: 500,
    interval: 'monthly',
    stripePriceId: 'price_seed_explain_plus_monthly',
  },
  {
    plan: 'plus',
    priceMinorUnits: 5000,
    interval: 'yearly',
    stripePriceId: 'price_seed_explain_plus_yearly',
  },
  {
    plan: 'pro',
    priceMinorUnits: 1000,
    interval: 'monthly',
    stripePriceId: 'price_seed_explain_pro_monthly',
  },
  {
    plan: 'pro',
    priceMinorUnits: 10_000,
    interval: 'yearly',
    stripePriceId: 'price_seed_explain_pro_yearly',
  },
] as const

export async function seedMembershipProducts(): Promise<void> {
  console.log(`Seeding ${MEMBERSHIP_PRODUCTS.length} membership products...`)
  await using transaction = await beginTransaction()
  const values: unknown[] = []
  const rows: string[] = []
  for (const [i, product] of MEMBERSHIP_PRODUCTS.entries()) {
    const id = seedUuid(i, '30')
    values.push(id, product.plan, product.interval, product.stripePriceId, product.priceMinorUnits)
    const base = values.length - 4
    rows.push(
      `($${base}::uuid, $${base + 1}::membership_plan_slugs, $${base + 2}::membership_billing_intervals, $${base + 3}, $${base + 4}::bigint)`,
    )
  }
  await transaction(
    `/* seedExplainData */ WITH mapping_rows (id, plan, billing_interval, provider_product_id, price_minor_units) AS (
         VALUES ${rows.join(', ')}
       )
       INSERT INTO membership_provider_products (
         id, membership_product_id, provider, environment, application_id,
         provider_product_id, price_minor_units, currency_code
       )
       SELECT mapping.id, product.id, 'stripe', 'production', 'voucha-web',
         mapping.provider_product_id, mapping.price_minor_units, 'usd'
       FROM mapping_rows mapping
       INNER JOIN membership_products product
         ON product.plan = mapping.plan AND product.billing_interval = mapping.billing_interval
         AND product.retired_at IS NULL
       ON CONFLICT (id) DO UPDATE SET
         membership_product_id = EXCLUDED.membership_product_id,
         provider_product_id = EXCLUDED.provider_product_id,
         price_minor_units = EXCLUDED.price_minor_units,
         retired_at = NULL`,
    values,
  )

  await transaction.commit()
}

// One active membership per seeded user: idx_memberships__user_active is a unique
// partial index on user_id, so each row here must use a distinct user_id.
export async function seedMemberships(count = MEMBERSHIP_SEED_COUNT): Promise<void> {
  console.log(`Seeding ${count} memberships...`)
  await using transaction = await beginTransaction()
  for (let i = 0; i < count; i += 500) {
    const batch = Math.min(500, count - i)
    const values: unknown[] = []
    const rows: string[] = []
    for (let j = 0; j < batch; j++) {
      const idx = i + j
      const id = seedUuid(idx, '31')
      const sourceId = seedUuid(idx, '33')
      const userId = seedUuid(idx, '01')
      const productIndex = idx % MEMBERSHIP_PRODUCTS.length
      const product = MEMBERSHIP_PRODUCTS[productIndex]!
      values.push(id, sourceId, userId, product.plan, product.interval)
      const base = values.length - 4
      rows.push(
        `($${base}::uuid, $${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}::membership_plan_slugs, $${base + 4}::membership_billing_intervals)`,
      )
    }
    await transaction(
      `/* seedExplainData */ WITH requested_rows (membership_id, source_id, user_id, plan, billing_interval) AS (
           VALUES ${rows.join(', ')}
         ), source_rows AS (
           SELECT requested.*, product.id AS product_id
           FROM requested_rows requested
           INNER JOIN membership_products product
             ON product.plan = requested.plan AND product.billing_interval = requested.billing_interval
             AND product.retired_at IS NULL
         ), inserted_sources AS (
           INSERT INTO membership_sources (id, user_id, source_kind)
           SELECT source_id, user_id, 'admin_grant' FROM source_rows
           ON CONFLICT DO NOTHING
         ), inserted_states AS (
           INSERT INTO membership_source_states (membership_source_id, source_kind, membership_product_id, effective_at)
           SELECT source_id, 'admin_grant', product_id, CURRENT_TIMESTAMP FROM source_rows
           ON CONFLICT (membership_source_id) DO NOTHING
         )
         INSERT INTO memberships (id, user_id, membership_source_id, membership_product_id, effective_at)
         SELECT membership_id, user_id, source_id, product_id, CURRENT_TIMESTAMP FROM source_rows
         ON CONFLICT DO NOTHING`,
      values,
    )
  }

  await transaction.commit()
}

// Bulk ledger rows spread across many distinct stripe_charge_id/stripe_payment_intent_id
// values, plus a handful pinned to the exported SEED_MEMBERSHIP_REFUND_* constants, so an
// index scan on that one value is measurably cheaper than a sequential scan.
export async function seedMembershipRefunds(count = MEMBERSHIP_REFUND_SEED_COUNT): Promise<void> {
  console.log(`Seeding ${count} membership refunds...`)
  await using transaction = await beginTransaction()
  for (let i = 0; i < count; i += 500) {
    const batch = Math.min(500, count - i)
    const values: unknown[] = []
    const rows: string[] = []
    for (let j = 0; j < batch; j++) {
      const idx = i + j
      const id = seedUuid(idx, '32')
      const membershipIndex = idx % MEMBERSHIP_SEED_COUNT
      const membershipId = seedUuid(membershipIndex, '31')
      const membershipSourceId = seedUuid(membershipIndex, '33')
      const userId = seedUuid(membershipIndex, '01')

      const isChargeTarget = idx < MEMBERSHIP_REFUND_CHARGE_TARGET_ROWS
      const isPaymentIntentTarget =
        !isChargeTarget &&
        idx < MEMBERSHIP_REFUND_CHARGE_TARGET_ROWS + MEMBERSHIP_REFUND_PAYMENT_INTENT_TARGET_ROWS

      const stripeRefundId = `re_seed_explain_${idx}`
      const stripeChargeId = isChargeTarget
        ? SEED_MEMBERSHIP_REFUND_CHARGE_ID
        : `ch_seed_explain_${idx}`
      const stripePaymentIntentId = isPaymentIntentTarget
        ? SEED_MEMBERSHIP_REFUND_PAYMENT_INTENT_ID
        : idx % 3 === 0
          ? `pi_seed_explain_${idx}`
          : null
      const amountMinorUnits = 500 + (idx % 50) * 100

      values.push(
        id,
        membershipId,
        membershipSourceId,
        userId,
        stripeRefundId,
        stripeChargeId,
        stripePaymentIntentId,
        amountMinorUnits,
      )
      const base = values.length - 7
      rows.push(
        `($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, 'usd', 'goodwill', 'stripe_dashboard')`,
      )
    }
    await transaction(
      `/* seedExplainData */ INSERT INTO membership_refunds
           (id, membership_id, membership_source_id, user_id, stripe_refund_id, stripe_charge_id, stripe_payment_intent_id, amount_minor_units, currency_code, reason, source)
         VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )
  }

  await transaction.commit()
  // Not covered by maintenance.mts's ANALYZE_TARGETS; analyze locally so the planner's
  // index-vs-seqscan choice reflects the seeded distribution.
  await write(
    '/* seedExplainData */ ANALYZE membership_products, membership_sources, membership_source_states, memberships, membership_refunds',
  ).catch(error => console.error('seedExplainData: ANALYZE membership tables failed', error))
}
