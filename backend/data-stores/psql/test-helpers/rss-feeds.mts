import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// @data-stores/psql cannot depend on @voucha/test-helpers (see users.mts in this directory for why).
// Trimmed-down substitute for test-helpers' insertTestRssFeedDirect/insertTestRssFeed, scoped to
// exactly what rss-feed-crawl-tiers.test.mts needs to populate mv_rss_feed_crawl_tiers (see
// views/2026-05-07-rss-feed-crawl-inputs.sql): a topic (for votes_score_net) and an rss_feeds row
// with is_enabled = TRUE and deleted_at IS NULL. topics.created_by_id and rss_feeds' home-page URL
// are both skipped — the materialized view never reads them. is_enabled is trigger-maintained from
// rss_feed_enablement_changes (see rss_feeds.is_enabled in migrations/0080-00-00-rss-feeds-items.sql),
// never written directly. bedrock_nova_multimodal_v1_content_sha256 is NOT NULL with no column
// default (migrations/0060-00-00-topics-taxonomy.sql); test-helpers' insertTestTopic defaults it to
// an all-zero 32-byte value when the caller has no real embedding — reused verbatim here.
export async function insertLocalTestRssFeed(): Promise<{ id: string }> {
  const random = crypto.randomUUID()
  const embeddingSha256 = `\\x${'0'.repeat(64)}`

  const { rows: topicRows } = await write<{ id: string }>(sql`
    INSERT INTO topics (name, slug, bedrock_nova_multimodal_v1_content_sha256)
    VALUES (${`Test Feed Topic ${random}`}, ${`test-feed-topic-${random}`}, ${embeddingSha256})
    RETURNING id
  `)
  const topicId = topicRows[0]!.id

  const { rows: hostnameRows } = await write<{ id: string }>(sql`
    INSERT INTO url_hostnames (hostname)
    VALUES (${`feed-${random}.example.com`})
    RETURNING id
  `)
  const { rows: urlRows } = await write<{ id: string }>(sql`
    INSERT INTO urls (url, hostname_id, search_params)
    VALUES (${`https://feed-${random}.example.com/feed.xml`}, ${hostnameRows[0]!.id}, '{}'::jsonb)
    RETURNING id
  `)

  const { rows: feedRows } = await write<{ id: string }>(sql`
    INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title)
    VALUES (${urlRows[0]!.id}, ${topicId}, ${`Test Feed ${random}`})
    RETURNING id
  `)
  const feedId = feedRows[0]!.id

  await write(sql`
    INSERT INTO rss_feed_enablement_changes (rss_feed_id, enabled, reason)
    VALUES (${feedId}, TRUE, 'test helper initial state')
  `)

  return { id: feedId }
}

/**
 * Directly set votes_score_up/votes_score_down on the topic that owns the given RSS feed.
 * votes_score_net = votes_score_up - votes_score_down (generated column).
 */
export async function setLocalRssFeedOwningTopicVoteScore(
  feedId: string,
  scoreUp: number,
  scoreDown: number,
): Promise<void> {
  await write(sql`
    UPDATE topics
    SET votes_score_up = ${scoreUp}, votes_score_down = ${scoreDown}
    WHERE id = (SELECT topic_id FROM rss_feeds WHERE id = ${feedId})
  `)
}

export async function createLocalTestMembership(
  userId: string,
  options: {
    plan: 'plus' | 'pro'
    status?: 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired'
    expiresAt?: Date | null
    projectionEndedAt?: Date | null
  },
): Promise<void> {
  const status = options.status ?? 'active'
  const lifecycleTimestamp = new Date()
  const effectiveAt =
    options.expiresAt && options.expiresAt < lifecycleTimestamp
      ? options.expiresAt
      : lifecycleTimestamp
  const { rows: productRows } = await write<{ id: string }>(sql`
    INSERT INTO membership_products (plan, billing_interval)
    VALUES (${options.plan}, 'monthly')
    ON CONFLICT (plan, billing_interval) WHERE retired_at IS NULL
    DO UPDATE SET retired_at = NULL
    RETURNING id
  `)
  const { rows: sourceRows } = await write<{ id: string }>(sql`
    INSERT INTO membership_sources (user_id, source_kind)
    VALUES (${userId}, 'admin_grant')
    RETURNING id
  `)
  const sourceId = sourceRows[0]!.id
  const productId = productRows[0]!.id

  await write(sql`
    INSERT INTO membership_source_states (
      membership_source_id, source_kind, membership_product_id, effective_at, expires_at,
      cancelled_at, expired_at, past_due_at, paused_at
    ) VALUES (
      ${sourceId}, 'admin_grant', ${productId}, ${effectiveAt}, ${options.expiresAt ?? null},
      ${status === 'cancelled' ? lifecycleTimestamp : null},
      ${status === 'expired' ? lifecycleTimestamp : null},
      ${status === 'past_due' ? lifecycleTimestamp : null},
      ${status === 'paused' ? lifecycleTimestamp : null}
    )
  `)

  await write(sql`
    INSERT INTO memberships (
      user_id, membership_source_id, membership_product_id, effective_at, expires_at, projection_ended_at, cancelled_at, expired_at, past_due_at, paused_at
    ) VALUES (
      ${userId}, ${sourceId}, ${productId}, ${effectiveAt}, ${options.expiresAt ?? null},
      ${options.projectionEndedAt ?? null},
      ${status === 'cancelled' ? lifecycleTimestamp : null},
      ${status === 'expired' ? lifecycleTimestamp : null},
      ${status === 'past_due' ? lifecycleTimestamp : null},
      ${status === 'paused' ? lifecycleTimestamp : null}
    )
  `)
}
