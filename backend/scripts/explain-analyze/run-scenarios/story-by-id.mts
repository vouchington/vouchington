import { getStoryById } from '@services/feeds/rss-feed-items/get-story-by-id'
import { STORY_POST_RELATED_URL_PROJECTION_SEED } from '../seed-data/story-post-related-url-projection.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

// The projection seed already inserts this live story. A point read of that row is the
// representative shape for the shared stories fixture.
export async function runStoryByIdScenario(): Promise<void> {
  const { storyId } = STORY_POST_RELATED_URL_PROJECTION_SEED
  registerScenarioContract('story-by-id', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['stories_pkey', 'idx_stories__id_desc'],
        anyOf: true,
        queryContains: 'getStoryById',
      },
      // Both plan modes process one stories row; the budget adds 20%.
      { kind: 'maxProcessedRows', relation: 'stories', max: 2 },
    ],
  })
  await runAndCapture(
    'story-by-id',
    async () => {
      const story = await getStoryById(storyId)
      if (story?.id !== storyId) throw new Error('Seeded story must be readable by id')
    },
    undefined,
    'getStoryById',
  )
}
