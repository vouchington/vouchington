import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { getRssFeedByIdToFetch } from '@services/rss-feeds/get-by-id-to-fetch'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runRssCrawlFetchLookupCapacity(): Promise<void> {
  const scenario = 'rss-crawl-feed-lookup-at-cap'
  const cohort = `explain-fetch-lookup-${randomUUID()}`
  const hostnameId = seedUuid(0, '02')
  const due = `${cohort}-due`
  const recent = `${cohort}-recent`
  const disabled = `${cohort}-disabled`
  const base = 'https://seed-host-0.example.com/'
  await using seed = await beginTransaction()
  const { rows: feeds } = await seed<{
    id: string
    topic_id: string
    rss_feed_url_id: string
    title: string
  }>(sql`/* seedExplainFetchLookupFeeds */
    WITH owners AS (
      INSERT INTO topics (name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
      SELECT name, name, 'system', decode(repeat('00',32),'hex')
      FROM unnest(${[due, recent, disabled]}::text[]) AS fixture(name)
      RETURNING id, name
    ), feed_urls AS (
      INSERT INTO urls (url, hostname_id, search_params)
      SELECT ${base} || name, ${hostnameId}, '{}'::jsonb FROM owners RETURNING id, url
    )
    INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title, created_via)
    SELECT feed_urls.id, owners.id, owners.name, 'system'
    FROM owners JOIN feed_urls ON feed_urls.url = ${base} || owners.name
    RETURNING id, topic_id, rss_feed_url_id, title`)
  const dueFeed = feeds.find(feed => feed.title === due)
  const recentFeed = feeds.find(feed => feed.title === recent)
  const disabledFeed = feeds.find(feed => feed.title === disabled)
  assert.ok(dueFeed && recentFeed && disabledFeed)
  await seed(sql`/* enableExplainFetchLookupFeeds */
    INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, reason)
    SELECT 'enablement', id, TRUE, 'EXPLAIN fetch lookup fixture'
    FROM unnest(${[dueFeed.id, recentFeed.id]}::uuid[]) fixture(id)`)
  await seed(sql`/* stampExplainRecentFetchLookupFeed */
    UPDATE rss_feed_fetch_states
    SET last_fetch_succeeded_at = CURRENT_TIMESTAMP
    WHERE rss_feed_id = ${recentFeed.id}`)
  await seed.commit()
  try {
    registerScenarioContract(scenario, {
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 1 },
        { kind: 'maxProcessedRows', relation: 'rss_feed_fetch_states', max: 1 },
        { kind: 'maxProcessedRows', relation: 'urls', max: 1 },
        { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 1 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const fetchable = await getRssFeedByIdToFetch(dueFeed.id)
        assert.equal(fetchable?.id, dueFeed.id)
        assert.equal(fetchable.url, base + due)
        assert.equal(fetchable.url_hostname_id, hostnameId)
        assert.equal(await getRssFeedByIdToFetch(recentFeed.id), null)
        const manual = await getRssFeedByIdToFetch(recentFeed.id, { ttl: 0 })
        assert.equal(manual?.id, recentFeed.id)
        assert.equal(manual.url, base + recent)
        assert.equal(await getRssFeedByIdToFetch(disabledFeed.id, { ttl: 0 }), null)
      },
      undefined,
      'getRssFeedByIdToFetch',
    )
  } finally {
    await using cleanup = await beginTransaction()
    await cleanup(sql`/* cleanupExplainFetchLookupFeeds */
      DELETE FROM rss_feeds WHERE id = ANY(${feeds.map(feed => feed.id)}::uuid[])`)
    await cleanup(sql`/* cleanupExplainFetchLookupOwners */
      WITH removed_urls AS (
        DELETE FROM urls WHERE id = ANY(${feeds.map(feed => feed.rss_feed_url_id)}::uuid[])
      ), removed_topics AS (
        DELETE FROM topics WHERE id = ANY(${feeds.map(feed => feed.topic_id)}::uuid[]) RETURNING id
      )
      DELETE FROM retained_topic_identities identity USING removed_topics
      WHERE identity.id = removed_topics.id`)
    await cleanup.commit()
  }
}
