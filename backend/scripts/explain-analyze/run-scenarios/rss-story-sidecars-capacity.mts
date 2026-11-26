import assert from 'node:assert/strict'
import { getStoriesByIdBatch } from '@services/stories/get'
import { getVisiblePostStoryIdsByStoryIds } from '@services/stories/get-post-stories'
import { runAndCapture, seedUser } from '../run-support.mts'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'
import { STORY_POST_SPACING_MS } from '../seed-data/story-search-hidden-feeds.mts'

export async function runRssStorySidecarsCapacityScenarios(): Promise<void> {
  // Reverse the input order so the hydration check detects a database-order response.
  const indexes = [
    ...Array.from({ length: 39 }, (_, i) => i),
    ...Array.from({ length: 60 }, (_, i) => 180 + i),
  ].toReversed()
  const storyIds = [...indexes.map(i => seedUuid(i, 'bc')), seedUuid(999, 'bc')]
  const expectedStories = [
    ...indexes.map(i => ({ id: seedUuid(i, 'bc'), title: 'Story search seed' })),
    null,
  ]
  const expectedVisible = Object.fromEntries(
    indexes
      .filter(i => i >= 200)
      .map(i => [
        seedUuid(i, 'bc'),
        seedUuidAtTimestamp(
          postSeedTimestampMs(0) + (240 - i) * STORY_POST_SPACING_MS,
          910_000 + i,
        ),
      ]),
  )
  await runAndCapture(
    'rss-stories-by-id-batch-at-cap',
    async () => {
      const stories = await getStoriesByIdBatch(storyIds)
      assert.deepEqual(
        stories.map(story => story && { id: story.id, title: story.title }),
        expectedStories,
      )
    },
    undefined,
    'getStoriesByIdBatch',
    { exactCapturedNames: ['getStoriesByIdBatch'] },
  )
  await runAndCapture(
    'rss-visible-story-posts-batch-at-cap',
    async () => {
      assert.deepEqual(await getVisiblePostStoryIdsByStoryIds(seedUser, storyIds), expectedVisible)
    },
    undefined,
    'getVisiblePostStoryIdsByStoryIds',
    { exactCapturedNames: ['getVisiblePostStoryIdsByStoryIds'] },
  )
}
