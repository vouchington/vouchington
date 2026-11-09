import assert from 'node:assert/strict'
import { searchRssFeeds } from '@services/rss-feeds/search'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedParentTopicId, seedTopicId, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { VOTE_SCORE_PUBLISHER_ROWS } from './vote-score-ranking-cursors.mts'

/** Run after the publisher-ranking fixture has seeded a dominant muted type. */
export async function runRssFeedExistenceScenarios(): Promise<void> {
  const publisherOptions = {
    publisher_type_ids: [seedTopicId, seedUuid(1, '04')],
    topic_ids: [seedUuid(1, '04'), seedUuid(2, '04')],
    limit: 1,
  }
  const cases = [
    {
      id: 'rss-feed-search-publisher-page-first',
      options: publisherOptions,
      expected: [seedUuid(2, '08')],
    },
    {
      id: 'rss-feed-search-publisher-page-after',
      options: { ...publisherOptions, cursorId: seedUuid(2, '08') },
      expected: [seedUuid(1, '08')],
    },
    {
      id: 'rss-feed-search-muted-dominant-publisher',
      options: { ...publisherOptions, current_user_id: seedUser.id, limit: 25 },
      expected: [seedUuid(2, '08')],
    },
    {
      id: 'rss-feed-search-overlapping-descendants-first',
      options: { topic_ids: [seedParentTopicId, seedTopicId], include_descendants: true, limit: 1 },
      expected: [seedUuid(500, '08')],
    },
    {
      id: 'rss-feed-search-overlapping-descendants-after',
      options: {
        topic_ids: [seedParentTopicId, seedTopicId],
        include_descendants: true,
        cursorId: seedUuid(500, '08'),
        limit: 1,
      },
      expected: [seedUuid(0, '08')],
    },
    {
      id: 'rss-feed-search-five-descendant-roots',
      options: {
        topic_ids: Array.from({ length: 5 }, (_, index) => seedUuid(500 + index, '04')),
        include_descendants: true,
        limit: 25,
      },
      expected: [504, 503, 502, 501, 500, 4, 3, 2, 1, 0].map(index => seedUuid(index, '08')),
    },
  ]
  for (const scenario of cases) {
    registerScenarioContract(scenario.id, {
      seededRows: {
        relation__topic__publisher_type__topic:
          VOTE_SCORE_PUBLISHER_ROWS.relation__topic__publisher_type__topic,
      },
      expectations: [
        { kind: 'custom', name: 'rssStateProjection' },
        {
          kind: 'maxProcessedRows',
          relation: 'rss_feeds',
          max: scenario.id === 'rss-feed-search-five-descendant-roots' ? 36 : 16,
        },
        {
          kind: 'maxProcessedRows',
          relation: 'topics',
          max: scenario.id === 'rss-feed-search-five-descendant-roots' ? 30 : 16,
        },
        { kind: 'maxProcessedRows', relation: 'relation__topic__publisher_type__topic', max: 16 },
        { kind: 'maxProcessedRows', relation: 'relation__user__mute__topic', max: 8 },
      ],
    })
  }
  await captureCase(cases[0]!)
  await captureCase(cases[1]!)
  await captureCase(cases[2]!)
  await captureCase(cases[3]!)
  await captureCase(cases[4]!)
  await captureCase(cases[5]!)

  async function captureCase(scenario: (typeof cases)[number]): Promise<void> {
    await runAndCapture(scenario.id, async () => {
      const feeds = await searchRssFeeds(scenario.options)
      assert.deepEqual(
        feeds.map(feed => feed.id),
        scenario.expected,
      )
    })
  }
}
