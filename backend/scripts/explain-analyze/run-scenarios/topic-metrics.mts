import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { getTopicMetricsByAnyBatch } from '../run-services.mts'

export async function runTopicMetricsBatchScenario(seedAllTopicIds: string[]) {
  registerScenarioContract('topic-metrics-batch', {
    expectations: [
      { kind: 'queryBinds', token: 'combined_ids' },
      { kind: 'forbidCorrelatedAggregates' },
      {
        kind: 'usesIndexes',
        indexes: [
          // Partitioned relations expose the default leaf. These are the leaf names of
          // idx_relation__post__category__topic__positive_object and its alias twin,
          // plus the topic_id leaf indexes on the rating and data-point partitions.
          'relation__post__category__topic__default_case_subject_id_idx',
          'relation__post__category__topic_alias__defa_case_subject_id_idx',
          'post_review_topic_ratings__default_topic_id_post_id_rating_idx',
          'post_data_point_topics__default_topic_id_post_id_idx',
          'idx_rss_feed_item_categories__topic_id',
          'idx_topic_aliases__topic_id',
          'idx_rss_feed_item_sources__item_feed',
          'rss_feed_item_sources_pkey',
        ],
      },
      {
        kind: 'usesIndexes',
        indexes: ['idx_rss_feeds__topic_id', 'idx_rss_feeds__topic_id__unique'],
        anyOf: true,
      },
      ...Object.entries({
        posts: 5_000,
        relation__post__category__topic: 5_000,
        relation__post__category__topic_alias: 5_000,
        post_review_topic_ratings: 5_000,
        post_data_point_topics: 5_000,
        // 100 seeded topics own about 7,500 category rows. The walk stops at the probe.
        rss_feed_item_categories: 12_000,
        // News checks each category row's sources, and latest walks each topic feed to the probe.
        rss_feed_item_sources: 40_000,
        rss_feed_items: 30_000,
        // One feed probe per news source row plus one topic-feed lookup per requested topic.
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
