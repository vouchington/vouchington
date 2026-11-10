import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { getTopicMetricsByAnyBatch } from '../run-services.mts'

const METRICS_ANCILLARY_ROW_ALLOWANCE = 1_000

export async function runTopicMetricsBatchScenario(seedAllTopicIds: string[]) {
  registerScenarioContract('topic-metrics-batch', {
    expectations: [
      { kind: 'queryBinds', token: 'requested_topic_ids' },
      { kind: 'forbidCorrelatedAggregates' },
      ...Object.entries({
        posts: 5_000,
        relation__post__category__topic: 5_000,
        relation__post__category__topic_alias: 5_000,
        post_review_topic_ratings: 5_000,
        post_data_point_topics: 5_000,
        // Category and feed-topic branches can each visit the RSS corpus.
        rss_feed_item_categories:
          SEEDED_ROWS_BY_RELATION.rss_feed_item_categories! + METRICS_ANCILLARY_ROW_ALLOWANCE,
        rss_feed_item_sources:
          (SEEDED_ROWS_BY_RELATION.rss_feed_item_sources! + METRICS_ANCILLARY_ROW_ALLOWANCE) * 2,
        rss_feed_items:
          SEEDED_ROWS_BY_RELATION.rss_feed_items! +
          SEEDED_ROWS_BY_RELATION.rss_feed_item_sources! +
          METRICS_ANCILLARY_ROW_ALLOWANCE * 2,
        rss_feeds: 6_000,
      }).map(([relation, max]) => ({ kind: 'maxProcessedRows' as const, relation, max })),
    ],
    crossPartition: {
      posts: 'Topic metrics aggregate posts for 100 requested topics across their id ranges.',
      relation__post__category__topic: 'Topic metrics aggregate category relations across posts.',
      post_review_topic_ratings: 'Topic metrics aggregate ratings across posts.',
      post_data_point_topics: 'Topic metrics aggregate data points across posts.',
      rss_feed_items: 'Topic metrics aggregate matching RSS items across the seed window.',
    },
  })
  await runAndCapture('topic-metrics-batch', async () => {
    const metrics = await getTopicMetricsByAnyBatch(seedAllTopicIds)
    if (metrics.length !== seedAllTopicIds.length || metrics.some(row => row === null))
      throw new Error('Every requested seeded topic must retain its metrics row')
  })
}
