import type { TransactionQuery } from '@data-stores/psql'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'

async function seedPlaywrightMembershipsAndCommunities(
  query: TransactionQuery,
  _testUserEmail: string,
): Promise<void> {
  await query(
    `UPDATE membership_provider_products provider_product
     SET retired_at = CURRENT_TIMESTAMP
     FROM membership_products product
     WHERE provider_product.membership_product_id = product.id
       AND product.plan IN ('plus', 'pro')
       AND product.billing_interval IN ('monthly', 'yearly')
       AND product.retired_at IS NULL
       AND provider_product.provider = 'stripe'
       AND provider_product.environment = $1::membership_provider_environments
       AND provider_product.application_id = 'voucha-web'
       AND provider_product.retired_at IS NULL`,
    [STRIPE_PROVIDER_ENVIRONMENT],
  )
  await query(
    `UPDATE membership_provider_products provider_product
     SET membership_product_id = product.id,
       sku_id = fixture.sku_id,
       price_minor_units = fixture.price_minor_units,
       currency_code = 'usd',
       retired_at = NULL
     FROM (
       VALUES
         ('plus', 'monthly', 'price_playwright_plus_monthly', 'voucha_membership_v1_plus_monthly_usd', 500),
         ('plus', 'yearly', 'price_playwright_plus_yearly', 'voucha_membership_v1_plus_yearly_usd', 5000),
         ('pro', 'monthly', 'price_playwright_pro_monthly', 'voucha_membership_v1_pro_monthly_usd', 1000),
         ('pro', 'yearly', 'price_playwright_pro_yearly', 'voucha_membership_v1_pro_yearly_usd', 10000)
     ) AS fixture(plan, billing_interval, provider_product_id, sku_id, price_minor_units)
     INNER JOIN membership_products product
       ON product.plan::text = fixture.plan
       AND product.billing_interval::text = fixture.billing_interval
       AND product.retired_at IS NULL
     WHERE provider_product.provider = 'stripe'
       AND provider_product.environment = $1::membership_provider_environments
       AND provider_product.application_id = 'voucha-web'
       AND provider_product.provider_product_id = fixture.provider_product_id
       AND provider_product.base_plan_id IS NULL
       AND provider_product.offer_id IS NULL`,
    [STRIPE_PROVIDER_ENVIRONMENT],
  )
  await query(
    `INSERT INTO membership_provider_products (id, membership_product_id, provider, environment, application_id, provider_product_id, sku_id, price_minor_units, currency_code)
     SELECT fixture.id::uuid, product.id, 'stripe', $1::membership_provider_environments, 'voucha-web', fixture.provider_product_id, fixture.sku_id, fixture.price_minor_units, 'usd'
     FROM (
       VALUES
         ('019c0000-0000-7000-8000-000000000004', 'plus', 'monthly', 'price_playwright_plus_monthly', 'voucha_membership_v1_plus_monthly_usd', 500),
         ('019c0000-0000-7000-8000-000000000005', 'plus', 'yearly', 'price_playwright_plus_yearly', 'voucha_membership_v1_plus_yearly_usd', 5000),
         ('019c0000-0000-7000-8000-000000000001', 'pro', 'monthly', 'price_playwright_pro_monthly', 'voucha_membership_v1_pro_monthly_usd', 1000),
         ('019c0000-0000-7000-8000-000000000006', 'pro', 'yearly', 'price_playwright_pro_yearly', 'voucha_membership_v1_pro_yearly_usd', 10000)
     ) AS fixture(id, plan, billing_interval, provider_product_id, sku_id, price_minor_units)
     INNER JOIN membership_products product
       ON product.plan::text = fixture.plan
       AND product.billing_interval::text = fixture.billing_interval
       AND product.retired_at IS NULL
     WHERE NOT EXISTS (
       SELECT 1
       FROM membership_provider_products provider_product
       WHERE provider_product.provider = 'stripe'
         AND provider_product.environment = $1::membership_provider_environments
         AND provider_product.application_id = 'voucha-web'
         AND provider_product.provider_product_id = fixture.provider_product_id
         AND provider_product.base_plan_id IS NULL
         AND provider_product.offer_id IS NULL
         AND provider_product.sku_id = fixture.sku_id
     )
     ON CONFLICT (id) DO UPDATE SET
       membership_product_id = EXCLUDED.membership_product_id,
       provider = EXCLUDED.provider,
       environment = EXCLUDED.environment,
       application_id = EXCLUDED.application_id,
       provider_product_id = EXCLUDED.provider_product_id,
       base_plan_id = NULL,
       offer_id = NULL,
       sku_id = EXCLUDED.sku_id,
       price_minor_units = EXCLUDED.price_minor_units,
       currency_code = EXCLUDED.currency_code,
       retired_at = NULL`,
    [STRIPE_PROVIDER_ENVIRONMENT],
  )
  await query(
    `INSERT INTO membership_sources (id, user_id, source_kind) VALUES ( '019c0000-0000-7000-8000-000000000002', '019f0000-0000-7000-8000-000000000000', 'admin_grant' ) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id`,
  )
  await query(
    `INSERT INTO membership_source_states (membership_source_id, source_kind, membership_product_id, effective_at)
     SELECT '019c0000-0000-7000-8000-000000000002', 'admin_grant', id, CURRENT_TIMESTAMP
     FROM membership_products WHERE plan = 'pro' AND billing_interval = 'monthly' AND retired_at IS NULL
     ON CONFLICT (membership_source_id) DO UPDATE SET source_kind = EXCLUDED.source_kind, membership_product_id = EXCLUDED.membership_product_id, effective_at = EXCLUDED.effective_at, expires_at = NULL, cancelled_at = NULL, past_due_at = NULL`,
  )
  await query(
    `INSERT INTO memberships (id, user_id, membership_source_id, membership_product_id, effective_at)
     SELECT '019c0000-0000-7000-8000-000000000003', '019f0000-0000-7000-8000-000000000000', '019c0000-0000-7000-8000-000000000002', id, CURRENT_TIMESTAMP
     FROM membership_products WHERE plan = 'pro' AND billing_interval = 'monthly' AND retired_at IS NULL
     ON CONFLICT (user_id) WHERE projection_ended_at IS NULL DO UPDATE SET membership_source_id = EXCLUDED.membership_source_id, membership_product_id = EXCLUDED.membership_product_id, effective_at = EXCLUDED.effective_at, cancelled_at = NULL, expired_at = NULL, past_due_at = NULL, paused_at = NULL, cancel_at_period_end = false, projection_ended_at = NULL`,
  )
  /* v8 ignore start -- exercised by Playwright global setup, not Vitest coverage */
  await query(
    `INSERT INTO communities ( id, name, slug, markdown, visibility, created_by_id ) VALUES ( '019c0000-0000-7000-8000-000000000010', '000 Playwright Popular Community', 'playwright-popular-community', 'Seed community used by Playwright aside coverage.', 'public', '019f0000-0000-7000-8000-000000000000' ) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, markdown = EXCLUDED.markdown, visibility = EXCLUDED.visibility, created_by_id = EXCLUDED.created_by_id, deleted_at = NULL, archived_at = NULL`,
  )
  await query(
    `DELETE FROM community_members WHERE community_id = '019c0000-0000-7000-8000-000000000010' AND user_id = '00000000-0000-0000-0000-000000000000'`,
  )
  await query(
    `INSERT INTO community_members (community_id, user_id, role) VALUES ( '019c0000-0000-7000-8000-000000000010', '019f0000-0000-7000-8000-000000000000', 'owner' ) ON CONFLICT DO NOTHING`,
  )
}

export { seedPlaywrightMembershipsAndCommunities }
