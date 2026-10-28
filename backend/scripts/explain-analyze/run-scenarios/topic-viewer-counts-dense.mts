import { getTopicViewerCounts } from '@services/topics/metrics'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  DENSE_TOPIC_VIEWER_COUNTS,
  DENSE_TOPIC_VIEWER_TOPIC_ID,
  seedDenseTopicViewerCounts,
} from '../seed-data/topic-viewer-counts-dense.mts'

export async function runDenseTopicViewerCountsScenario(): Promise<void> {
  await seedDenseTopicViewerCounts()
  registerScenarioContract('topic-viewer-counts-dense', {
    expectations: [
      { kind: 'custom', name: 'topicViewerCandidateBind' },
      { kind: 'maxBitmapIndexRows', max: 5_000 },
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic', max: 1_500 },
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic_alias', max: 1_000 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 7_000 },
      { kind: 'maxProcessedRows', relation: 'post_review_topic_ratings', max: 1_000 },
      { kind: 'maxProcessedRows', relation: 'post_data_point_topics', max: 1_000 },
    ],
    seededRows: {
      relation__post__category__topic: 70_100,
      relation__post__category__topic_alias: 31_000,
      post_review_topic_ratings: 1_601,
      post_data_point_topics: 1_600,
    },
    crossPartition: {
      relation__post__category__topic:
        'Dense topic viewer counts follow candidate topic relations across posts.',
      posts: 'Dense topic attachments span the seeded post id ranges.',
    },
  })
  await runAndCapture('topic-viewer-counts-dense', async () => {
    const counts = await getTopicViewerCounts(seedUser, DENSE_TOPIC_VIEWER_TOPIC_ID)
    if (JSON.stringify(counts) !== JSON.stringify(DENSE_TOPIC_VIEWER_COUNTS)) {
      throw new Error(
        `Dense topic viewer counts returned ${JSON.stringify(counts)}; expected ${JSON.stringify(DENSE_TOPIC_VIEWER_COUNTS)}`,
      )
    }
  })
}
