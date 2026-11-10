import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedTopicId, seedUser } from '../run-support.mts'
import { getPostIds } from '../run-services.mts'

/** Review, data-point, and universal topic filters. Split from search-and-facets.mts for max-lines. */
export async function runPostSearchRelationshipFilterScenarios(): Promise<void> {
  registerScenarioContract('post-search-review-topic', {
    expectations: [],
    crossPartition: {
      posts: 'Review-topic search ranks matching posts across id ranges.',
      post_review_topic_ratings: 'The topic filter matches ratings across many posts.',
    },
  })
  await runAndCapture(
    'post-search-review-topic',
    () => getPostIds(seedUser, { review_topic_ids: [seedTopicId], limit: 25 }),
    'review-topic',
  )
  registerScenarioContract('post-search-data-point-topic', {
    expectations: [],
    crossPartition: {
      posts: 'Data-point-topic search ranks matching posts across id ranges.',
      post_data_point_topics: 'The topic filter matches data points across many posts.',
    },
  })
  await runAndCapture(
    'post-search-data-point-topic',
    () => getPostIds(seedUser, { data_point_topic_ids: [seedTopicId], limit: 25 }),
    'data-point-topic',
  )
  registerScenarioContract('post-search-universal-topic', {
    expectations: [
      { kind: 'custom', name: 'universalTopicCandidates' },
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic', max: 3010 },
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic_alias', max: 3010 },
      { kind: 'maxProcessedRows', relation: 'post_review_topic_ratings', max: 3010 },
      { kind: 'maxProcessedRows', relation: 'post_data_point_topics', max: 3010 },
    ],
    crossPartition: {
      posts: 'Universal-topic search ranks matching posts across id ranges.',
      relation__post__category__topic:
        'Universal-topic search reads category relations across posts.',
      post_review_topic_ratings: 'Universal-topic search reads ratings across posts.',
      post_data_point_topics: 'Universal-topic search reads data points across posts.',
    },
  })
  await runAndCapture(
    'post-search-universal-topic',
    () => getPostIds(seedUser, { universal_topic_ids: [seedTopicId], limit: 25 }),
    'universal-topic',
  )
  // Worst case: the whole history, for callers that pass time_range=all.
  registerScenarioContract('post-search-universal-topic-all', {
    expectations: [
      { kind: 'custom', name: 'universalTopicCandidates' },
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic', max: 3010 },
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic_alias', max: 3010 },
      { kind: 'maxProcessedRows', relation: 'post_review_topic_ratings', max: 3010 },
      { kind: 'maxProcessedRows', relation: 'post_data_point_topics', max: 3010 },
    ],
    crossPartition: {
      posts: 'Universal-topic search without a time bound ranks matching posts across id ranges.',
      relation__post__category__topic:
        'Universal-topic search reads category relations across posts.',
      post_review_topic_ratings: 'Universal-topic search reads ratings across posts.',
      post_data_point_topics: 'Universal-topic search reads data points across posts.',
    },
  })
  await runAndCapture(
    'post-search-universal-topic-all',
    () =>
      getPostIds(seedUser, { universal_topic_ids: [seedTopicId], limit: 25, time_range: 'all' }),
    'universal-topic-all',
  )
}
