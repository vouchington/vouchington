import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { searchHostnameIdsNeedingCrawlerRefresh } from '@services/crawlers/refresh'
import { assertCommunityPostTopicsNotMuted } from '@services/communities/publications/muted-topics'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const hostnameId = seedUuid(880_000, 'ed')
const communityId = seedUuid(880_001, 'ed')
const postId = seedUuid(880_002, 'ed')
const crawlerId = seedUuid(880_003, 'ed')
const crawlerNoiseCount = 1000
const crawlerNoiseIds = Array.from({ length: crawlerNoiseCount }, (_, index) =>
  seedUuid(881_000 + index, 'ed'),
)
const crawlerNoiseHostnameIds = Array.from({ length: crawlerNoiseCount }, (_, index) =>
  seedUuid(index, '02'),
)
const topicId = seedUuid(0, '04')

async function seedExistenceFixtures(): Promise<void> {
  await write(
    `/* seedExistenceHostname */ INSERT INTO url_hostnames (id, hostname, is_crawlable)
    VALUES ($1::uuid, 'explain-existence-refresh.example.com', TRUE) ON CONFLICT (id) DO NOTHING`,
    [hostnameId],
  )
  await write(
    `/* seedExistenceCrawler */ INSERT INTO hostname_crawler_configurations (id, hostname_id, crawler_type)
    VALUES ($1::uuid, $2::uuid, 'fetch') ON CONFLICT (id) DO NOTHING`,
    [crawlerId, hostnameId],
  )
  await write(
    `/* seedExistenceCrawlerNoise */ INSERT INTO hostname_crawler_configurations
      (id, hostname_id, crawler_type)
    SELECT input.id, input.hostname_id, 'fetch'::crawler_types
    FROM unnest($1::uuid[], $2::uuid[]) AS input(id, hostname_id)
    ON CONFLICT (id) DO NOTHING`,
    [crawlerNoiseIds, crawlerNoiseHostnameIds],
  )
  await write(
    `/* seedExistenceCommunity */ INSERT INTO communities (id, name, slug, created_by_id, created_via)
    VALUES ($1::uuid, 'EXPLAIN existence', 'explain-existence-community', $2::uuid, 'system') ON CONFLICT (id) DO NOTHING`,
    [communityId, seedUser.id],
  )
  await write(
    `/* seedExistencePost */ INSERT INTO posts (id, created_by_id, post_type, title, markdown, created_via, gemini_embedding_2_content_sha256, llm_moderation_content_sha256, bedrock_nova_multimodal_v1_content_sha256)
    VALUES ($1::uuid, $2::uuid, 'review', 'EXPLAIN existence', 'Review text', 'system', decode(repeat('00',32),'hex'), decode(repeat('00',32),'hex'), decode(repeat('00',32),'hex'))
    ON CONFLICT (id) DO NOTHING`,
    [postId, seedUser.id],
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
    relation__post__category__topic, relation__post__category__topic_alias,
    relation__community__mute__topic, topic_aliases, post_explicit_topic_categories, post_topic_alias_sources`)
}

async function cleanupExistenceFixtures(): Promise<void> {
  await write(
    `/* cleanupExistenceMute */ DELETE FROM relation__community__mute__topic
    WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
    [communityId, topicId],
  )
  await write(
    `/* cleanupExistenceCategory */ DELETE FROM relation__post__category__topic
    WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
    [postId, topicId],
  )
  await write(`/* cleanupExistencePost */ DELETE FROM posts WHERE id = $1::uuid`, [postId])
  await write(`/* cleanupExistenceCommunity */ DELETE FROM communities WHERE id = $1::uuid`, [
    communityId,
  ])
  await write(
    `/* cleanupExistenceCrawlers */ DELETE FROM hostname_crawler_configurations
    WHERE id = $1::uuid OR id = ANY($2::uuid[])`,
    [crawlerId, crawlerNoiseIds],
  )
  await write(`/* cleanupExistenceHostname */ DELETE FROM url_hostnames WHERE id = $1::uuid`, [
    hostnameId,
  ])
  await write(`/* analyzeAfterExistenceCleanup */ ANALYZE url_hostnames, hostname_crawler_configurations,
    relation__post__category__topic, relation__community__mute__topic`)
}

export async function runAggregateExistenceScenarios(): Promise<void> {
  try {
    await seedExistenceFixtures()
    await captureExistenceScenarios()
  } finally {
    await cleanupExistenceFixtures()
  }
}

async function captureExistenceScenarios(): Promise<void> {
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
}
