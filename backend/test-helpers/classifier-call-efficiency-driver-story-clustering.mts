import { STORY_CLUSTERING_CLASSIFIER_SLUG } from '@voucha/types/entities/story-clustering-classifier'
import { CLASSIFIER_RUN_ATTEMPTS } from '../queues/ai-agents/config.mts'
import { createTestRssFeed } from './rss-feed-create.mts'
import { createStoryClusteringRegistration } from '../workers/ai-agents/processors/classifier-run-story-clustering.mts'
import { executeLeasedRun, type EfficiencyDriver } from './classifier-call-efficiency-run.mts'
import {
  createStoryClusteringItem,
  makeStoryClusteringVectors,
  readItemStoryId,
  readStoryFacts,
} from './data-stores/psql/classifier-runs/story-clustering-fixture.mts'

/** C9: an incoming item with `neighborCount` standalone neighbors, decided in one call. */
export const storyClusteringEfficiencyDriver: EfficiencyDriver = {
  slug: STORY_CLUSTERING_CLASSIFIER_SLUG,
  scope: 'C9 story-clustering classifier',
  fanOuts: [1, 5],
  lateCandidates: true,
  /** The neighbors are the options of the one choice question. */
  questions: () => 1,
  async seed(neighborCount) {
    const { unit, near } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const neighbor = () => createStoryClusteringItem({ feedId: feed.id, embedding: near })
    await Promise.all(Array.from({ length: neighborCount }, neighbor))
    const incoming = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    return {
      subject: incoming.subject,
      inputSha256: incoming.inputSha256,
      candidates: neighborCount,
      async effects() {
        const storyId = await readItemStoryId(incoming.itemId)
        return { storyId, members: storyId ? (await readStoryFacts(storyId)).member_ids : [] }
      },
      addCandidate: async () => void (await neighbor()),
    }
  },
  executeWithoutCompleting: run =>
    executeLeasedRun(createStoryClusteringRegistration(), run, CLASSIFIER_RUN_ATTEMPTS),
}
