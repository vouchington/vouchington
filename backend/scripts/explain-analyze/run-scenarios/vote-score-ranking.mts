import { getPostByAny } from '@services/posts/get'
import { getDominantPublisherTypeSlug } from '@services/topics/get-dominant-publisher-type'
import { searchUrlHostnames } from '@services/urls-hostnames/search'
import { searchRssFeeds } from '@services/rss-feeds/search'
import { getRssFeedItemFeedIds } from '@services/feeds/rss-feed-items/get-ids'
import { seedPostId, seedTopicId, seedUser, runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  seedVoteScoreHostnameFixture,
  seedVoteScorePublisherAndPostFixture,
} from '../seed-data/vote-score-ranking.mts'
import {
  prepareVoteScoreRankingCursors,
  runTrustHostnameContinuation,
  runZeroTrustContinuation,
  VOTE_SCORE_HOSTNAME_ROWS,
  VOTE_SCORE_PUBLISHER_ROWS,
  type VoteScoreRankingCursors,
} from './vote-score-ranking-cursors.mts'
import { runVoteScorePostHotScenarios } from './vote-score-post-hot.mts'

type RankingScenario = Readonly<{
  id: string
  run: () => Promise<unknown>
  queryName: string
  expectations: Parameters<typeof registerScenarioContract>[1]['expectations']
  seededRows: Readonly<Record<string, number>>
}>

export function getVoteScoreHostnameScenarios(
  cursors: VoteScoreRankingCursors,
): readonly RankingScenario[] {
  const hostnameIndex = (index: string) => [
    { kind: 'usesIndexes' as const, indexes: [index] },
    { kind: 'maxProcessedRows' as const, relation: 'url_hostnames', max: 100 },
  ]
  return [
    {
      id: 'vote-score-hostnames-trust-after',
      queryName: 'searchUrlHostnames',
      run: () => runTrustHostnameContinuation(cursors.top),
      expectations: hostnameIndex('idx_url_hostnames__public_votes_score_sort__id'),
      seededRows: VOTE_SCORE_HOSTNAME_ROWS,
    },
    {
      id: 'vote-score-hostnames-trust-by-topic-first',
      queryName: 'searchUrlHostnames',
      run: () =>
        searchUrlHostnames({
          sort: 'trust',
          is_blocked: false,
          topic_id: seedTopicId,
          limit: 25,
        }),
      expectations: hostnameIndex('idx_url_hostnames__topic_id__votes_score_sort__id'),
      seededRows: VOTE_SCORE_HOSTNAME_ROWS,
    },
    {
      id: 'vote-score-hostnames-trust-by-topic-after',
      queryName: 'searchUrlHostnames',
      run: () => runTrustHostnameContinuation(cursors.topicTop, seedTopicId),
      expectations: hostnameIndex('idx_url_hostnames__topic_id__votes_score_sort__id'),
      seededRows: VOTE_SCORE_HOSTNAME_ROWS,
    },
    {
      id: 'vote-score-hostnames-trust-first',
      queryName: 'searchUrlHostnames',
      run: () => searchUrlHostnames({ sort: 'trust', is_blocked: false, limit: 25 }),
      expectations: hostnameIndex('idx_url_hostnames__public_votes_score_sort__id'),
      seededRows: VOTE_SCORE_HOSTNAME_ROWS,
    },
    {
      id: 'vote-score-hostnames-trust-deep-zero-after',
      queryName: 'searchUrlHostnames',
      run: () => runZeroTrustContinuation(cursors.trustZero),
      expectations: hostnameIndex('idx_url_hostnames__public_votes_score_sort__id'),
      seededRows: VOTE_SCORE_HOSTNAME_ROWS,
    },
  ]
}

export function getVoteScorePublisherScenarios(): readonly RankingScenario[] {
  return [
    {
      id: 'vote-score-publisher-type-ranking',
      queryName: 'searchRssFeeds',
      run: () =>
        searchRssFeeds({
          publisher_type_ids: [seedTopicId, seedUuid(1, '04')],
          current_user_id: seedUser.id,
          limit: 25,
        }),
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_relation__topic__publisher_type__topic__subject__best'],
          queryContains: 'searchRssFeeds',
        },
        {
          kind: 'maxProcessedRows',
          relation: 'relation__topic__publisher_type__topic',
          max: 100,
        },
      ],
      seededRows: VOTE_SCORE_PUBLISHER_ROWS,
    },
    {
      id: 'vote-score-dominant-publisher-type',
      queryName: 'getDominantPublisherTypeSlug',
      run: () => getDominantPublisherTypeSlug(seedUuid(10, '04')),
      expectations: [
        {
          kind: 'usesIndexes',
          // The closed publisher-type slug list can drive the primary key
          // (subject_id, object_id) instead of a subject-wide index.
          indexes: [
            'idx_relation__topic__publisher_type__topic__subject__best',
            'idx_relation__topic__publisher_type__topic__reverse_index',
            'relation__topic__publisher_type__topic_pkey',
          ],
          anyOf: true,
        },
        { kind: 'maxProcessedRows', relation: 'relation__topic__publisher_type__topic', max: 100 },
      ],
      seededRows: VOTE_SCORE_PUBLISHER_ROWS,
    },
    {
      id: 'vote-score-viewer-publisher-type-eligibility',
      queryName: 'getRssFeedItemFeedIds',
      run: () => getRssFeedItemFeedIds(seedUser, { feed_type: 'follow_rss_feeds', limit: 25 }),
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_relation__topic__publisher_type__topic__subject__best'],
          queryContains: 'getRssFeedItemFeedIds',
        },
        {
          kind: 'maxProcessedRows',
          relation: 'relation__topic__publisher_type__topic',
          max: 100,
        },
      ],
      seededRows: VOTE_SCORE_PUBLISHER_ROWS,
    },
    {
      id: 'vote-score-post-related-topics',
      queryName: 'getPostByAny',
      run: () => getPostByAny(seedPostId),
      expectations: [
        {
          kind: 'singleLeaf',
          parent: 'relation__post__category__topic',
          key: 'id',
        },
        { kind: 'maxProcessedRows', relation: 'relation__post__category__topic', max: 100 },
      ],
      seededRows: VOTE_SCORE_PUBLISHER_ROWS,
    },
  ]
}

async function captureScenarios(scenarios: readonly RankingScenario[]): Promise<void> {
  for (const scenario of scenarios) {
    registerScenarioContract(scenario.id, {
      expectations: scenario.expectations,
      seededRows: scenario.seededRows,
    })
    // no-mistakes-disable-next-line query-reached-per-item: fixed plan scenarios need separate serialized captures and contracts.
    await runAndCapture(scenario.id, scenario.run, undefined, scenario.queryName)
  }
}

export async function runVoteScoreRankingScenarios(): Promise<void> {
  await runVoteScorePostHotScenarios()
  await seedVoteScorePublisherAndPostFixture()
  await captureScenarios(getVoteScorePublisherScenarios())
  await seedVoteScoreHostnameFixture()
  const cursors = await prepareVoteScoreRankingCursors()
  await captureScenarios(getVoteScoreHostnameScenarios(cursors))
}
