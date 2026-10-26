import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  beginTransaction,
  captureScopedTestQueries,
  countCapturedQueriesByAnnotation,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { captureAddedPublicationEffectsForScopes } from '@voucha/test-helpers/publication-effect-jobs'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { recordStoryTopicPublicationChanges } from './capture-story-topics.mts'
import { postPublicationWorkConfig } from './work-limits.mts'

describe('story publication capture pages', () => {
  it('captures every story and merges repeated impacts across bounded lock pages', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 2 }),
    )
    const storyIds = Array.from({ length: 3 }, () => randomUUID()).toSorted()
    const topicIds = storyIds.map(() => randomUUID())
    const postIds = storyIds.map(() => randomUUID())
    const extraTopicId = topicIds[0]!
    let jobs: PostPublicationEffectsJobData[] = []
    const queries = await captureScopedTestQueries(async () => {
      jobs = await captureAddedPublicationEffectsForScopes(storyIds, async () => {
        await using query = await beginTransaction()
        await recordStoryTopicPublicationChanges(query, [
          ...storyIds.map((storyId, index) => ({
            storyId,
            impactedPostIds: [postIds[index]!],
            impactedTopicIds: [topicIds[index]!],
          })),
          {
            storyId: storyIds[0]!,
            impactedPostIds: [postIds[0]!],
            impactedTopicIds: [extraTopicId],
          },
        ])
        await query.commit()
      })
    })
    expect(countCapturedQueriesByAnnotation(queries, 'lockStoryTopicPublicationCaptures')).toBe(2)
    expect(jobs).toHaveLength(3)
    for (const [index, storyId] of storyIds.entries()) {
      expect(jobs.find(job => job.scope.id === storyId)?.keys).toEqual(
        expect.arrayContaining([
          { kind: 'impact_post', uuidValue: postIds[index] },
          { kind: 'impact_topic', uuidValue: topicIds[index] },
        ]),
      )
    }
    expect(jobs.find(job => job.scope.id === storyIds[0])?.keys).toContainEqual({
      kind: 'impact_topic',
      uuidValue: extraTopicId,
    })
  })
})
