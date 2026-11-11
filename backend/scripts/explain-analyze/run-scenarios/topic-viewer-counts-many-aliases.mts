import { getTopicViewerCounts } from '@services/topics/metrics'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import {
  cleanupManyAliasTopicViewerCounts,
  manyAliasViewerInputCounts,
  MANY_ALIAS_VIEWER_TOPIC_ID,
  seedManyAliasTopicViewerCounts,
} from '../seed-data/topic-viewer-counts-many-aliases.mts'

const SCENARIO_ID = 'topic-viewer-counts-many-aliases'

export async function runManyAliasTopicViewerCountsScenario(): Promise<void> {
  const { aliasCount, positiveCount } = manyAliasViewerInputCounts()
  await cleanupManyAliasTopicViewerCounts()
  await seedManyAliasTopicViewerCounts()
  try {
    registerScenarioContract(SCENARIO_ID, {
      expectations: [
        { kind: 'maxBitmapIndexRows', max: 5_000 },
        { kind: 'maxProcessedRows', relation: 'relation__post__category__topic', max: 1_500 },
        {
          kind: 'maxProcessedRows',
          relation: 'relation__post__category__topic_alias',
          max: 1_000,
        },
        { kind: 'maxProcessedRows', relation: 'posts', max: 7_000 },
        { kind: 'maxProcessedRows', relation: 'post_review_topic_ratings', max: 1_000 },
        { kind: 'maxProcessedRows', relation: 'post_data_point_topics', max: 1_000 },
        { kind: 'custom', name: 'topicViewerBoundedInputs' },
      ],
      seededRows: {
        topic_aliases: (SEEDED_ROWS_BY_RELATION.topic_aliases ?? 0) + aliasCount,
        relation__post__category__topic: 70_100,
        relation__post__category__topic_alias:
          (SEEDED_ROWS_BY_RELATION.relation__post__category__topic_alias ?? 0) + positiveCount,
        post_review_topic_ratings: 1_601,
        post_data_point_topics: 1_600,
      },
      crossPartition: {
        relation__post__category__topic_alias:
          'The bounded alias walk probes one eligible post per matching alias and skips many empty aliases.',
        posts: 'Eligible alias hits span the seeded post id ranges.',
      },
    })

    await runAndCapture(SCENARIO_ID, async () => {
      const counts = await getTopicViewerCounts(seedUser, MANY_ALIAS_VIEWER_TOPIC_ID)
      if (
        counts.discussions !== positiveCount ||
        !counts.count_capped.discussions ||
        counts.reviews !== 0 ||
        counts['data-points'] !== 0 ||
        counts.count_capped.reviews ||
        counts.count_capped['data-points']
      ) {
        throw new Error(
          `Many-alias topic viewer counts returned ${JSON.stringify(counts)}; expected ${positiveCount} eligible discussions and an input lower-bound flag across ${aliasCount} aliases`,
        )
      }
    })
  } finally {
    await cleanupManyAliasTopicViewerCounts()
  }
}
