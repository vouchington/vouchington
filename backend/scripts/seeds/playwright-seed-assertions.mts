import { query } from '@data-stores/psql/clients'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'

interface SeedAssertion {
  name: string
  query: string
  values?: unknown[]
}

const WEB_SEARCH_CONTENT_SNIPPET_FIXTURE = 'web search content snippet fixture'

const REQUIRED_SEED_DATA: SeedAssertion[] = [
  {
    name: 'test user',
    query: `SELECT 1 FROM users WHERE id = '019f0000-0000-7000-8000-000000000000' LIMIT 1`,
  },
  {
    name: 'admin role for test user',
    query: `
      SELECT 1
      FROM user_roles
      JOIN user_roles_types ON user_roles_types.id = user_roles.role_type_id
      WHERE user_roles.user_id = '019f0000-0000-7000-8000-000000000000'
        AND user_roles_types.slug = 'administrator'
      LIMIT 1
    `,
  },
  {
    name: 'active test membership',
    query: `
      SELECT 1
      FROM memberships
      WHERE user_id = '019f0000-0000-7000-8000-000000000000'
        AND projection_ended_at IS NULL
        AND cancelled_at IS NULL
        AND expired_at IS NULL
      LIMIT 1
    `,
  },
  {
    name: 'active Plus and Pro web Stripe provider products',
    query: `
      SELECT 1
      FROM (
        SELECT COUNT(*) AS product_count
        FROM (
          VALUES
            ('plus', 'monthly', 'price_playwright_plus_monthly', 'voucha_membership_v1_plus_monthly_usd', 500), ('plus', 'yearly', 'price_playwright_plus_yearly', 'voucha_membership_v1_plus_yearly_usd', 5000),
            ('pro', 'monthly', 'price_playwright_pro_monthly', 'voucha_membership_v1_pro_monthly_usd', 1000), ('pro', 'yearly', 'price_playwright_pro_yearly', 'voucha_membership_v1_pro_yearly_usd', 10000)
        ) AS fixture(plan, billing_interval, provider_product_id, sku_id, price_minor_units)
        INNER JOIN membership_products product
          ON product.plan::text = fixture.plan
          AND product.billing_interval::text = fixture.billing_interval
          AND product.retired_at IS NULL
        INNER JOIN LATERAL (
          SELECT provider_product.provider_product_id, provider_product.sku_id, provider_product.price_minor_units, provider_product.currency_code
          FROM membership_provider_products provider_product
          WHERE provider_product.membership_product_id = product.id
            AND provider_product.provider = 'stripe'
            AND provider_product.environment = $1::membership_provider_environments
            AND provider_product.application_id = 'voucha-web'
            AND provider_product.retired_at IS NULL
          ORDER BY provider_product.id DESC
          LIMIT 1
        ) selected_provider_product
          ON selected_provider_product.provider_product_id = fixture.provider_product_id
          AND selected_provider_product.sku_id = fixture.sku_id
          AND selected_provider_product.price_minor_units = fixture.price_minor_units
          AND selected_provider_product.currency_code = 'usd'
      ) plans
      CROSS JOIN (SELECT COUNT(*) AS mapping_count
        FROM membership_provider_products provider_product INNER JOIN membership_products product ON product.id = provider_product.membership_product_id
          AND product.retired_at IS NULL
        WHERE provider_product.provider = 'stripe'
          AND provider_product.environment = $1::membership_provider_environments
          AND provider_product.application_id = 'voucha-web'
          AND provider_product.retired_at IS NULL
      ) active_mappings
      WHERE plans.product_count = 4 AND active_mappings.mapping_count = 4
    `,
    values: [STRIPE_PROVIDER_ENVIRONMENT],
  },
  {
    name: 'discoverable news fixtures',
    query: `
      SELECT 1
      FROM (
        SELECT COUNT(DISTINCT rss_feed_items.id) AS item_count
        FROM rss_feed_items
        JOIN rss_feed_item_ids
          ON rss_feed_item_ids.id = rss_feed_items.id
        JOIN rss_feed_item_sources
          ON rss_feed_item_sources.rss_feed_item_id = rss_feed_items.id
        JOIN rss_feeds
          ON rss_feeds.id = rss_feed_item_sources.rss_feed_id
        JOIN view_rss_feed_current_states
          ON view_rss_feed_current_states.rss_feed_id = rss_feeds.id
        WHERE rss_feed_item_ids.url_hostname_id = '019c64e6-1000-7000-b000-000000000001'
          AND (
            (rss_feed_item_ids.guid = 'test-item-1' AND rss_feed_items.url_id = '019c64e6-f8b0-7000-b000-000000000003')
            OR (rss_feed_item_ids.guid = 'test-item-2' AND rss_feed_items.url_id = '019c64e6-f8b0-7000-b000-000000000004')
            OR (rss_feed_item_ids.guid = 'modal-story-primary' AND rss_feed_items.url_id = '019c64e6-f8b0-7000-b000-000000000007')
          )
          AND rss_feed_items.deleted_at IS NULL
          AND rss_feeds.deleted_at IS NULL
          AND view_rss_feed_current_states.is_enabled = TRUE
          AND view_rss_feed_current_states.is_discoverable = TRUE
      ) items
      WHERE items.item_count >= 3
    `,
  },
  {
    name: 'popular community fixture',
    query: `
      SELECT 1
      FROM communities
      WHERE slug = 'playwright-popular-community'
        AND visibility = 'public'
        AND deleted_at IS NULL
      LIMIT 1
    `,
  },
]

export async function assertPlaywrightSeedData(): Promise<void> {
  const assertions = [
    ...REQUIRED_SEED_DATA,
    playwrightWebSearchSeedAssertion('pwwebsearchsnippet', new Date()),
    {
      name: 'current trending topic relation',
      query: `
        SELECT 1
        FROM relation__post__category__topic
        WHERE subject_id = '019c64e6-f720-7001-a001-000000000090'
          AND object_id = '019c64e6-f710-74cb-b36d-130af8ff1067'
          AND votes_score_net > 0
          AND deleted_at IS NULL
        LIMIT 1
      `,
    },
  ]

  const results = await Promise.all(
    assertions.map(async assertion => {
      return { assertion, found: await seedAssertionExists(assertion) }
    }),
  )
  const missing = results.flatMap(result => (!result.found ? [result.assertion.name] : []))

  if (missing.length > 0) {
    throw new Error(`Playwright seed data is incomplete: ${missing.join(', ')}`)
  }
}

export async function assertPlaywrightWebSearchSeedData(
  markdownToken: string,
  now: Date,
): Promise<void> {
  const assertion = playwrightWebSearchSeedAssertion(markdownToken, now)
  if (!(await seedAssertionExists(assertion))) {
    throw new Error(`Playwright seed data is incomplete: ${WEB_SEARCH_CONTENT_SNIPPET_FIXTURE}`)
  }
}

function playwrightWebSearchSeedAssertion(markdownToken: string, now: Date): SeedAssertion {
  return {
    name: WEB_SEARCH_CONTENT_SNIPPET_FIXTURE,
    query: `
      SELECT 1
      FROM crawl_chunks
      JOIN crawls ON crawls.id = crawl_chunks.crawl_id
      JOIN urls ON urls.id = crawls.url_id
      JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
      WHERE crawl_chunks.markdown LIKE $1
        AND crawls.response_status_code = 200
        AND crawls.completed_at IS NOT NULL
        AND crawls.embeddings_generated_at IS NOT NULL
        AND crawls.network_error IS NULL
        AND crawls.id >= $2
        AND url_hostnames.blocked = false
        AND url_hostnames.crawlable = true
      LIMIT 1
    `,
    values: [
      `%${markdownToken}%`,
      getMinUUIDv7ForDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
    ],
  }
}

async function seedAssertionExists(assertion: SeedAssertion): Promise<boolean> {
  // Global setup seeds immediately before this assertion, so query the writer
  // connection to avoid false negatives from read-replica lag.
  const { rows } = await query(
    `/* assertPlaywrightSeedData */ ${assertion.query}`,
    assertion.values,
  )
  return rows.length > 0
}
