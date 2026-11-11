import { getPostFeedIds, getPostIds } from '../run-services.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { partitionIndexLeavesOf } from '../partition-index-leaves.mts'
import { POST_TOPIC_SEMI_JOIN_FIXTURE } from '../seed-data/post-topic-semi-join-fixture.mts'
import { POST_TOPIC_FEED_POST_ID } from '../seed-data/post-topic-owned-posts.mts'
import { POST_TOPIC_FIXTURES_SEEDED_ROWS } from '../post-discovery-seeded-rows.mts'
import type { PostSearchOptions } from '@voucha/types/entities/post-search'

const PAGE_SIZE = 25
const POST_SEARCH_QUERY = 'buildPostSearchQuery'
const POST_FEED_QUERY = 'getPostFeedIds'
const MAX_POST_ROWS = 1200
const MAX_ALIAS_RELATION_ROWS = 1200
const MAX_FEED_POST_ROWS = 15_000
const MAX_FEED_MEMBERSHIP_ROWS = 30_000
const TOPIC_ALIAS_INDEX = 'idx_topic_aliases__topic_id'

type TopicFixture = 'sparse' | 'dense'

function optionsFor(topic: TopicFixture): PostSearchOptions {
  const topicId =
    topic === 'sparse'
      ? POST_TOPIC_SEMI_JOIN_FIXTURE.sparseTopicId
      : POST_TOPIC_SEMI_JOIN_FIXTURE.denseTopicId
  return {
    universal_topic_ids: [topicId],
    sort: 'new',
    time_range: 'all',
    limit: PAGE_SIZE,
  }
}

function registerTopicSemiJoinScenario(
  id: string,
  allowEmptyResult: boolean,
  aliasRelationLeaves: readonly string[],
): void {
  registerScenarioContract(id, {
    seededRows: POST_TOPIC_FIXTURES_SEEDED_ROWS,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: MAX_POST_ROWS },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__post__category__topic_alias',
        max: MAX_ALIAS_RELATION_ROWS,
      },
      { kind: 'usesIndexes', indexes: [TOPIC_ALIAS_INDEX] },
      { kind: 'usesIndexes', indexes: [...aliasRelationLeaves], anyOf: true },
    ],
    allowEmptyResult,
    crossPartition: {
      posts: 'A topic search walks matching posts in sort order.',
    },
  })
}

function registerMultiTopicFeedScenario(id: string): void {
  registerScenarioContract(id, {
    seededRows: POST_TOPIC_FIXTURES_SEEDED_ROWS,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: MAX_FEED_POST_ROWS },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__post__category__topic',
        max: MAX_FEED_MEMBERSHIP_ROWS,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__post__category__topic_alias',
        max: MAX_FEED_MEMBERSHIP_ROWS,
      },
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: MAX_FEED_MEMBERSHIP_ROWS },
      { kind: 'maxBitmapIndexRows', max: MAX_FEED_MEMBERSHIP_ROWS },
    ],
    forbidSequentialScans: [
      'relation__post__category__topic',
      'relation__post__category__topic_alias',
      'topic_aliases',
    ],
    crossPartition: {
      posts: 'A followed-post feed walks deliveries that match both topics.',
    },
  })
}

async function page(options: PostSearchOptions) {
  return getPostIds(seedUser, options)
}

async function capture(id: string, options: PostSearchOptions): Promise<void> {
  await runAndCapture(id, () => page(options), undefined, POST_SEARCH_QUERY)
}

async function captureTopicPair(
  topic: TopicFixture,
  aliasRelationLeaves: readonly string[],
): Promise<void> {
  const prefix = `post-topic-semi-join-${topic}`
  const options = optionsFor(topic)
  const firstPage = await page(options)
  if (topic === 'dense' && firstPage.results.length !== PAGE_SIZE)
    throw new Error(`${prefix} dense first page must be full`)
  // Five alias members plus the direct feed post that both topics share.
  if (topic === 'sparse' && firstPage.results.length !== 6)
    throw new Error(`${prefix} sparse first page must return its five alias posts and feed post`)
  // The walk stops at its inspected-row cap, so a sparse topic's short page still continues.
  if (topic === 'sparse' && !firstPage.page_info.has_next_page)
    throw new Error(`${prefix} sparse page must keep a continuation cursor`)

  const firstId = `${prefix}-first`
  registerTopicSemiJoinScenario(firstId, false, aliasRelationLeaves)
  await capture(firstId, options)
  if (topic === 'sparse') return

  const cursor = firstPage.page_info.end_cursor
  if (!cursor || !firstPage.page_info.has_next_page)
    throw new Error(`${prefix} first page needs a continuation cursor`)
  const continuationOptions = { ...options, after: cursor }
  const continuationPage = await page(continuationOptions)
  if (!continuationPage.page_info.has_next_page)
    throw new Error(`${prefix} continuation must keep walking matching posts`)
  if (continuationPage.results.length === 0)
    throw new Error(`${prefix} continuation must return a matching post`)
  const continuationId = `${prefix}-continuation`
  registerTopicSemiJoinScenario(continuationId, false, aliasRelationLeaves)
  await capture(continuationId, continuationOptions)
}

export async function runPostTopicSemiJoinScenarios(): Promise<void> {
  // Each page probes the alias relation by post id: the key-led leaves, not a topic-side read.
  const aliasRelationLeaves = await partitionIndexLeavesOf([
    'relation__post__category__topic_alias_pkey',
    'relation__post__category__topic_alias_subject_id_id_key',
    'idx_relation__post__category__topic_alias__subject__newest',
  ])
  await captureTopicPair('sparse', aliasRelationLeaves)
  await captureTopicPair('dense', aliasRelationLeaves)

  const topicIds = [
    POST_TOPIC_SEMI_JOIN_FIXTURE.sparseTopicId,
    POST_TOPIC_SEMI_JOIN_FIXTURE.denseTopicId,
  ]
  const multiTopicOptions: PostSearchOptions = {
    universal_topic_ids: topicIds,
    sort: 'new',
    time_range: 'all',
    limit: PAGE_SIZE,
  }
  const multiTopicPage = await page(multiTopicOptions)
  if (multiTopicPage.results.length === 0)
    throw new Error('Two-topic post search omitted its seeded intersection')
  registerTopicSemiJoinScenario(
    'post-topic-semi-join-multi-topic-search',
    false,
    aliasRelationLeaves,
  )
  await capture('post-topic-semi-join-multi-topic-search', multiTopicOptions)

  const multiTopicFeedOptions = {
    universal_topic_ids: topicIds,
    feed_type: 'any' as const,
    time_range: '1w' as const,
    limit: PAGE_SIZE,
  }
  const feedPage = await getPostFeedIds(seedUser, multiTopicFeedOptions)
  if (feedPage.results.length === 0)
    throw new Error('Two-topic post feed omitted its owned, followed-topic raw-prefix post')
  if (
    !feedPage.results.some(
      row => row.entity_id === POST_TOPIC_FEED_POST_ID && row.delivery_type === 'direct',
    )
  )
    throw new Error('Two-topic post feed omitted its specific owned direct delivery')
  if (feedPage.results.length > PAGE_SIZE)
    throw new Error('Two-topic post feed page exceeded its limit')
  if (feedPage.page_info.has_next_page && !feedPage.page_info.end_cursor)
    throw new Error('Two-topic post feed continuation needs its inspected-row cursor')
  registerMultiTopicFeedScenario('post-topic-semi-join-multi-topic-feed')
  await runAndCapture(
    'post-topic-semi-join-multi-topic-feed',
    () => getPostFeedIds(seedUser, multiTopicFeedOptions),
    undefined,
    POST_FEED_QUERY,
  )
}
