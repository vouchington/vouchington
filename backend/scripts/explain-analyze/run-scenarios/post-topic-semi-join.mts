import { getPostFeedIds, getPostIds } from '../run-services.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { POST_TOPIC_SEMI_JOIN_FIXTURE } from '../seed-data/post-topic-semi-join-fixture.mts'
import { POST_TOPIC_FIXTURES_SEEDED_ROWS } from '../post-discovery-seeded-rows.mts'
import type { PostSearchOptions } from '@voucha/types/entities/post-search'

const PAGE_SIZE = 25
const POST_SEARCH_QUERY = 'buildPostSearchQuery'
const POST_FEED_QUERY = 'getPostFeedIds'
const MAX_POST_ROWS = 3010
const MAX_BITMAP_INDEX_ROWS = 1050
const MAX_ALIAS_RELATION_ROWS = 3010
const MAX_FEED_POST_ROWS = 15_000
const MAX_FEED_MEMBERSHIP_ROWS = MAX_FEED_POST_ROWS * 2
const TOPIC_ALIAS_INDEX = 'idx_topic_aliases__topic_id'
const POSITIVE_ALIAS_RELATION_INDEX =
  'relation__post__category__topic_alias__defaul_subject_id_id_key'

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

function registerTopicSemiJoinScenario(id: string, allowEmptyResult: boolean): void {
  registerScenarioContract(id, {
    seededRows: POST_TOPIC_FIXTURES_SEEDED_ROWS,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: MAX_POST_ROWS },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__post__category__topic_alias',
        max: MAX_ALIAS_RELATION_ROWS,
      },
      { kind: 'maxBitmapIndexRows', max: MAX_BITMAP_INDEX_ROWS },
      {
        kind: 'usesIndexes',
        indexes: [TOPIC_ALIAS_INDEX, POSITIVE_ALIAS_RELATION_INDEX],
      },
    ],
    allowEmptyResult,
    crossPartition: {
      posts:
        'A topic search traverses retained post history through a bounded membership semijoin.',
    },
  })
}

async function page(options: PostSearchOptions) {
  return getPostIds(seedUser, options)
}

async function capture(id: string, options: PostSearchOptions): Promise<void> {
  await runAndCapture(id, () => page(options), undefined, POST_SEARCH_QUERY)
}

async function captureTopicPair(topic: TopicFixture): Promise<void> {
  const prefix = `post-topic-semi-join-${topic}`
  const options = optionsFor(topic)
  const firstPage = await page(options)
  const cursor = firstPage.page_info.end_cursor
  if (!cursor || !firstPage.page_info.has_next_page)
    throw new Error(`${prefix} first page needs an inspected-key continuation cursor`)
  if (topic === 'dense' && firstPage.results.length === 0)
    throw new Error(`${prefix} dense first page must return a matching post`)
  if (topic === 'sparse' && firstPage.results.length > 5)
    throw new Error(`${prefix} sparse first page exceeded its five seeded matches`)

  const firstId = `${prefix}-first`
  registerTopicSemiJoinScenario(firstId, topic === 'sparse')
  await capture(firstId, options)

  const continuationOptions = { ...options, after: cursor }
  const continuationPage = await page(continuationOptions)
  if (!continuationPage.page_info.end_cursor || !continuationPage.page_info.has_next_page)
    throw new Error(`${prefix} continuation must preserve inspected-key progress`)
  if (topic === 'dense' && continuationPage.results.length === 0)
    throw new Error(`${prefix} dense continuation must return a matching post`)
  if (topic === 'sparse' && continuationPage.results.length > 0)
    throw new Error(`${prefix} sparse continuation must not return unseeded matches`)
  const continuationId = `${prefix}-continuation`
  registerTopicSemiJoinScenario(continuationId, topic === 'sparse')
  await capture(continuationId, continuationOptions)
}

function registerMultiTopicFeedScenario(id: string): void {
  registerScenarioContract(id, {
    seededRows: POST_TOPIC_FIXTURES_SEEDED_ROWS,
    allowEmptyResult: true,
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
      posts: 'A followed-post feed applies the bounded two-topic filter after delivery selection.',
    },
  })
}

export async function runPostTopicSemiJoinScenarios(): Promise<void> {
  await captureTopicPair('sparse')
  await captureTopicPair('dense')

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
  registerTopicSemiJoinScenario('post-topic-semi-join-multi-topic-search', false)
  await capture('post-topic-semi-join-multi-topic-search', multiTopicOptions)

  const multiTopicFeedOptions = {
    universal_topic_ids: [
      POST_TOPIC_SEMI_JOIN_FIXTURE.sparseTopicId,
      POST_TOPIC_SEMI_JOIN_FIXTURE.denseTopicId,
    ],
    feed_type: 'any' as const,
    time_range: '1w' as const,
    limit: PAGE_SIZE,
  }
  const feedPage = await getPostFeedIds(seedUser, multiTopicFeedOptions)
  const feedCursor = feedPage.page_info.end_cursor
  if (feedPage.results.length > PAGE_SIZE || !feedPage.page_info.has_next_page || !feedCursor)
    throw new Error('Two-topic post feed must return a bounded page and usable continuation cursor')
  registerMultiTopicFeedScenario('post-topic-semi-join-multi-topic-feed')
  await runAndCapture(
    'post-topic-semi-join-multi-topic-feed',
    () => getPostFeedIds(seedUser, multiTopicFeedOptions),
    undefined,
    POST_FEED_QUERY,
  )

  const continuation = await getPostFeedIds(seedUser, {
    ...multiTopicFeedOptions,
    after: feedCursor,
  })
  if (
    continuation.results.length > PAGE_SIZE ||
    !continuation.page_info.has_next_page ||
    !continuation.page_info.end_cursor ||
    continuation.page_info.end_cursor === feedCursor
  )
    throw new Error('Two-topic post feed continuation must advance its bounded cursor')
  registerMultiTopicFeedScenario('post-topic-semi-join-multi-topic-feed-after')
  await runAndCapture(
    'post-topic-semi-join-multi-topic-feed-after',
    () => getPostFeedIds(seedUser, { ...multiTopicFeedOptions, after: feedCursor }),
    undefined,
    POST_FEED_QUERY,
  )
}
