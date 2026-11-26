import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { getRssFeedFollowCount } from '@services/rss-feeds/get-follow-count'
import { getRssFeedWithTopicForDiscoverability } from '@services/rss-feeds/get-with-topic-for-discoverability'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runRssFeedDiscoverabilityCapacity(): Promise<void> {
  const scenario = 'rss-feed-discoverability-at-cap'
  const cohort = `explain-discoverability-${randomUUID()}`
  const activeFollowers = 1_000
  const removedFollowers = 100
  const { rows: feeds } = await write<{
    id: string
    topic_id: string
    url_id: string
    title: string
    votes_score_net: number
  }>(sql`/* seedExplainRssDiscoverabilityFeeds */
    WITH input AS (
      SELECT role, uuidv7() AS topic_id, uuidv7() AS url_id, ${cohort} || '-' || role AS label
      FROM unnest(ARRAY['target', 'unrelated', 'inactive-owner']) roles(role)
    ), topic_owner AS (
      INSERT INTO topics (id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
      SELECT topic_id, label, label, 'system', decode(repeat('00', 32), 'hex')
      FROM input RETURNING id, votes_score_net
    ), feed_url AS (
      INSERT INTO urls (id, url, hostname_id, search_params)
      SELECT url_id, 'https://seed-host-0.example.com/' || label || '.xml', ${seedUuid(0, '02')}, '{}'::jsonb
      FROM input RETURNING id
    ), feed AS (
      INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title, created_via)
      SELECT feed_url.id, topic_owner.id, input.role, 'system'
      FROM input JOIN topic_owner ON topic_owner.id = input.topic_id
      JOIN feed_url ON feed_url.id = input.url_id
      RETURNING id, topic_id, rss_feed_url_id AS url_id, title
    )
    SELECT feed.*, topic_owner.votes_score_net FROM feed JOIN topic_owner ON topic_owner.id = feed.topic_id`)
  const target = feeds.find(feed => feed.title === 'target')
  const other = feeds.find(feed => feed.title === 'unrelated')
  const inactiveOwner = feeds.find(feed => feed.title === 'inactive-owner')
  assert.ok(target && other && inactiveOwner)
  try {
    const followerIds = Array.from({ length: activeFollowers + removedFollowers }, (_, index) =>
      seedUuid(3_000 + index, '01'),
    )
    const unrelatedFollowerIds = Array.from({ length: 8_000 }, (_, index) =>
      seedUuid(5_000 + index, '01'),
    )
    await write(sql`/* seedExplainRssDiscoverabilityFollowers */
      INSERT INTO relation__user__follow__rss_feed (subject_id, object_id, created_by_id, deleted_at)
      SELECT users.id, ${target.id}::uuid, users.id,
        CASE WHEN users.ordinal > ${activeFollowers}::int THEN CURRENT_TIMESTAMP END
      FROM unnest(${followerIds}::uuid[]) WITH ORDINALITY AS users(id, ordinal)
      UNION ALL
      SELECT users.id, ${other.id}::uuid, users.id, NULL
      FROM unnest(${unrelatedFollowerIds}::uuid[]) AS users(id)`)
    await write(sql`/* seedExplainRssDiscoverabilityInactiveOwner */
      UPDATE topics SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${inactiveOwner.topic_id}`)
    await write(
      '/* analyzeExplainRssDiscoverabilityFollowers */ ANALYZE relation__user__follow__rss_feed',
    )

    registerScenarioContract(scenario, {
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 1 },
        { kind: 'maxProcessedRows', relation: 'topics', max: 1 },
        {
          kind: 'maxProcessedRows',
          relation: 'relation__user__follow__rss_feed',
          // The current count can visit all target follows, including removed rows.
          // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7190722786
          max: activeFollowers + removedFollowers,
        },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        assert.deepEqual(await getRssFeedWithTopicForDiscoverability(target.id), {
          id: target.id,
          topic_id: target.topic_id,
          deleted_at: null,
          topic_votes_score_net: target.votes_score_net,
        })
        assert.equal(await getRssFeedWithTopicForDiscoverability(inactiveOwner.id), null)
        assert.equal(await getRssFeedFollowCount(target.id), activeFollowers)
        assert.equal(await getRssFeedFollowCount(inactiveOwner.id), 0)
      },
      undefined,
      ['getRssFeedWithTopicForDiscoverability', 'getRssFeedFollowCount'],
    )
  } finally {
    await using query = await beginTransaction()
    await query(sql`/* cleanupExplainRssDiscoverabilityFeeds */
      DELETE FROM rss_feeds WHERE id = ANY(${feeds.map(feed => feed.id)}::uuid[])`)
    await query(sql`/* cleanupExplainRssDiscoverabilityIdentities */
      WITH removed_urls AS (DELETE FROM urls WHERE id = ANY(${feeds.map(feed => feed.url_id)}::uuid[])),
        removed_topics AS (
          DELETE FROM topics WHERE id = ANY(${feeds.map(feed => feed.topic_id)}::uuid[]) RETURNING id
        )
      DELETE FROM retained_topic_identities identity USING removed_topics
      WHERE identity.id = removed_topics.id`)
    await query.commit()
  }
}
