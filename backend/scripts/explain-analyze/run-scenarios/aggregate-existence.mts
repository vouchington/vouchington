import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { searchHostnameIdsNeedingCrawlerRefresh } from '@services/crawlers/refresh'
import { assertCommunityPostTopicsNotMuted } from '@services/communities/publications/muted-topics'
import { updatePostRating } from '@services/posts/post-ratings'
import { getPostByAny } from '@services/posts/get'
import type { Post } from '@services/posts/types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const hostnameId = seedUuid(880_000, 'ed')
const communityId = seedUuid(880_001, 'ed')
const postId = seedUuid(880_002, 'ed')
const topicId = seedUuid(0, '04')
const secondTopicId = seedUuid(1, '04')

async function seedExistenceFixtures(): Promise<void> {
  await write(
    `/* seedExistenceHostname */ INSERT INTO url_hostnames (id, hostname, is_crawlable)
    VALUES ($1::uuid, 'explain-existence-refresh.example.com', TRUE) ON CONFLICT (id) DO NOTHING`,
    [hostnameId],
  )
  await write(
    `/* seedExistenceCrawler */ INSERT INTO hostname_crawler_configurations (id, hostname_id, crawler_type)
    VALUES ($1::uuid, $2::uuid, 'fetch') ON CONFLICT (id) DO NOTHING`,
    [seedUuid(880_003, 'ed'), hostnameId],
  )
  await write(
    `/* seedExistenceCommunity */ INSERT INTO communities (id, name, slug, created_by_id, created_via)
    VALUES ($1::uuid, 'EXPLAIN existence', 'explain-existence-community', $2::uuid, 'system') ON CONFLICT (id) DO NOTHING`,
    [communityId, seedUser.id],
  )
  await write(
    `/* seedExistencePost */ INSERT INTO posts (id, created_by_id, post_type, title, markdown, created_via, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    VALUES ($1::uuid, $2::uuid, 'review', 'EXPLAIN existence', 'Review text', 'system', decode(repeat('00',32),'hex'), decode(repeat('00',32),'hex'))
    ON CONFLICT (id) DO NOTHING`,
    [postId, seedUser.id],
  )
  await write(
    `/* seedExistenceRatings */ INSERT INTO post_review_topic_ratings (post_id, topic_id, rating, order_index)
    VALUES ($1::uuid, $2::uuid, 3, 0), ($1::uuid, $3::uuid, 4, 1) ON CONFLICT DO NOTHING`,
    [postId, topicId, secondTopicId],
  )
  await write(
    `/* seedExistenceCategory */ INSERT INTO relation__post__category__topic (subject_id, object_id, votes_score_up, votes_count_up)
    VALUES ($1::uuid, $2::uuid, 1, 1) ON CONFLICT DO NOTHING`,
    [postId, topicId],
  )
  await write(
    `/* seedExistenceMute */ INSERT INTO relation__community__mute__topic (subject_id, object_id)
    VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
    [communityId, topicId],
  )
  await write(`/* analyzeExistenceFixtures */ ANALYZE url_hostnames, hostname_crawler_configurations,
    post_review_topic_ratings, relation__post__category__topic, relation__post__category__topic_alias,
    relation__community__mute__topic, topic_aliases, post_explicit_topic_categories, post_topic_alias_sources`)
}

export async function runAggregateExistenceScenarios(): Promise<void> {
  await seedExistenceFixtures()
  registerScenarioContract('crawler-refresh-existing-stale', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 1 },
      { kind: 'maxProcessedRows', relation: 'hostname_crawler_configurations', max: 1 },
    ],
  })
  await runAndCapture(
    'crawler-refresh-existing-stale',
    async () => {
      assert.deepEqual(
        await searchHostnameIdsNeedingCrawlerRefresh(1, { readOnly: false }, hostnameId, {
          sweepStartedAt: '2090-01-03T12:00:00Z',
        }),
        [hostnameId],
      )
    },
    undefined,
    'searchHostnameIdsNeedingCrawlerRefresh',
  )

  registerScenarioContract('community-muted-topic-exists', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic', max: 1 },
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic_alias', max: 1 },
      { kind: 'maxProcessedRows', relation: 'relation__community__mute__topic', max: 1 },
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 1 },
    ],
  })
  await runAndCapture(
    'community-muted-topic-exists',
    async () => {
      await assert.rejects(
        () =>
          assertCommunityPostTopicsNotMuted(postId, communityId, { readOnly: false }, 'finalized'),
        { status: 422 },
      )
    },
    undefined,
    'assertCommunityPostTopicsNotMuted',
  )

  const post = (await getPostByAny(postId, { readOnly: false })) as Post | null
  assert.ok(post)
  registerScenarioContract('post-rating-variety-exists', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'post_review_topic_ratings', max: 6 }],
  })
  await runAndCapture(
    'post-rating-variety-exists',
    async () => {
      await assert.rejects(() => updatePostRating(seedUser, post, secondTopicId, { rating: 3 }), {
        status: 422,
      })
    },
    undefined,
    'assertRatingsNotAllSame',
  )
}
