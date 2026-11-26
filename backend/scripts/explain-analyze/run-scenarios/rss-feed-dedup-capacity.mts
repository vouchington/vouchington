import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import {
  findExistingFeedByUrl,
  findExistingFeedByUrlId,
} from '@services/rss-feeds/find-existing-feed'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runRssFeedDedupCapacity(): Promise<void> {
  const cohort = `explain-feed-dedup-${randomUUID()}`
  const origin = 'https://seed-host-0.example.com'
  const hostnameId = seedUuid(0, '02')
  const scenarios = [
    { id: 'rss-feed-dedup-by-url', tag: 'findExistingFeedByUrl', read: findExistingFeedByUrl },
    {
      id: 'rss-feed-dedup-by-url-id',
      tag: 'findExistingFeedByUrlId',
      read: findExistingFeedByUrlId,
    },
  ]

  const { rows: feeds } = await seedFeedDedupRows(cohort, origin, hostnameId)
  const byRole = new Map(feeds.map(feed => [feed.title, feed]))
  const source = byRole.get('source')
  const destination = byRole.get('canonical')
  const retained = byRole.get('retained')
  assert.ok(source && destination && retained)
  try {
    for (const scenario of scenarios) {
      registerScenarioContract(scenario.id, {
        allowEmptyResult: true,
        expectations: [
          { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 2 },
          { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
          { kind: 'maxProcessedRows', relation: 'urls', max: 2 },
        ],
      })
      const byUrl = scenario.id === 'rss-feed-dedup-by-url'
      await runAndCapture(
        scenario.id,
        async () => {
          assert.deepEqual(
            await scenario.read(byUrl ? `${origin}/${source.slug}.xml` : source.url_id),
            {
              id: destination.id,
              topic_id: destination.topic_id,
              topic_slug: destination.slug,
              resolved_feed_url: `${origin}/${destination.slug}.xml`,
            },
          )
          const retainedUrl = `${origin}/${retained.slug}.xml`
          assert.deepEqual(await scenario.read(byUrl ? retainedUrl : retained.url_id), {
            id: retained.id,
            topic_id: retained.topic_id,
            topic_slug: retained.slug,
            resolved_feed_url: retainedUrl,
          })
          assert.equal(
            await scenario.read(
              byUrl ? `${origin}/${cohort}-missing.xml` : seedUuid(999_921, '03'),
            ),
            null,
          )
        },
        undefined,
        scenario.tag,
      )
    }
  } finally {
    await using query = await beginTransaction()
    await query(sql`/* cleanupExplainFeedDedupFeeds */
      DELETE FROM rss_feeds WHERE id = ANY(${feeds.map(feed => feed.id)}::uuid[])`)
    await query(sql`/* cleanupExplainFeedDedupIdentities */
      WITH removed_urls AS (
        DELETE FROM urls WHERE id = ANY(${feeds.map(feed => feed.url_id)}::uuid[])
      ), removed_topics AS (
        DELETE FROM topics WHERE id = ANY(${feeds.map(feed => feed.topic_id)}::uuid[]) RETURNING id
      )
      DELETE FROM retained_topic_identities identity USING removed_topics
      WHERE identity.id = removed_topics.id`)
    await query.commit()
  }
}

async function seedFeedDedupRows(cohort: string, origin: string, hostnameId: string) {
  await using query = await beginTransaction()
  const feeds = await query<{
    id: string
    topic_id: string
    url_id: string
    slug: string
    title: string
  }>(sql`/* seedExplainFeedDedup */
    WITH inputs AS (
      SELECT role, ${cohort} || '-' || role AS slug, uuidv7() AS topic_id, uuidv7() AS url_id
      FROM unnest(ARRAY['source', 'canonical', 'retained']) input(role)
    ), owners AS (
      INSERT INTO topics (id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
      SELECT topic_id, slug, slug, 'system', decode(repeat('00', 32), 'hex') FROM inputs RETURNING id
    ), feed_urls AS (
      INSERT INTO urls (id, url, hostname_id, search_params)
      SELECT url_id, ${origin} || '/' || slug || '.xml', ${hostnameId}, '{}'::jsonb
      FROM inputs RETURNING id
    ), inserted_feeds AS (
      INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title, created_via)
      SELECT feed_urls.id, owners.id, inputs.role, 'system'
      FROM inputs JOIN owners ON owners.id = inputs.topic_id JOIN feed_urls ON feed_urls.id = inputs.url_id
      RETURNING id, topic_id, rss_feed_url_id AS url_id, title
    )
    SELECT inserted_feeds.*, inputs.slug FROM inserted_feeds JOIN inputs USING (topic_id)`)
  await query(sql`/* seedExplainFeedDedupCanonical */
    UPDATE rss_feeds SET canonical_rss_feed_id = ${feeds.rows.find(feed => feed.title === 'canonical')!.id}
    WHERE id = ${feeds.rows.find(feed => feed.title === 'source')!.id}`)
  await query(sql`/* seedExplainFeedDedupRetainedOwner */
    UPDATE topics SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${feeds.rows.find(feed => feed.title === 'retained')!.topic_id}`)
  await query.commit()
  return feeds
}
