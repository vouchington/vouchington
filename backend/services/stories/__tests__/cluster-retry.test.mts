import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { replayClusteredStory } from '../cluster-retry.mts'
import { completeStoryClusteringRun } from '../clustering/completion.mts'
import { prepareStoryPost } from '../story-posts.mts'
import * as cacheInvalidation from '../cache-invalidation.mts'
import {
  addCategoryToRssFeedItem,
  createTestTopic,
  createTestUrlWithHostname,
  createTestUserDirect,
  getPostCategoryTopicIds,
  insertTestRssFeedItem,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'
import { upsertSystemUser } from '@services/users/system-users'
import { settleStoryPostTopicVoteCapture } from '../../../test-helpers/services/stories/post-topic-vote-capture.mts'

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

let feedId: string

async function makeAssignedItem(storyId: string): Promise<string> {
  const random = Math.random().toString(36).slice(2, 10)
  const itemData = { title: `Cluster retry item ${random}`, link: `https://example.com/${random}` }
  const embedding = Array<number>(1024).fill(0)
  embedding[0] = 1
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feedId,
    urlId: await createTestUrlWithHostname(),
    guid: `cluster-retry-${random}`,
    itemData,
    contentSha256: sha256(itemData),
    embedding,
    tokens: 10,
  })
  await setTestItemStoryId(itemId, storyId)
  return itemId
}

describe('story clustering retry', () => {
  beforeAll(async () => {
    const feed = await createTestRssFeed({})
    feedId = feed.id
    await upsertSystemUser('story-teller')
  })

  it('replays post-commit completion when a story refresh is retried', async () => {
    const story = await insertTestStory()
    await makeAssignedItem(story.id)
    const invalidate = vi
      .spyOn(cacheInvalidation, 'invalidateStories')
      .mockRejectedValueOnce(new Error('post-commit effect failed'))
    try {
      await expect(replayClusteredStory(story.id)).rejects.toThrow('post-commit effect failed')
      await expect(replayClusteredStory(story.id)).resolves.toBeUndefined()
      expect(invalidate.mock.calls.filter(([id]) => id === story.id)).toEqual([
        [story.id],
        [story.id],
      ])
    } finally {
      invalidate.mockRestore()
    }
  })

  it('captures prior and current topics when a completed run is replayed after commit', async () => {
    const user = await createTestUserDirect()
    const story = await insertTestStory()
    const priorItemId = await makeAssignedItem(story.id)
    const currentItemId = await makeAssignedItem(story.id)
    const priorTopic = await createTestTopic()
    const currentTopic = await createTestTopic()

    await addCategoryToRssFeedItem(priorItemId, priorTopic.id)
    const prepared = await prepareStoryPost(story.id, user)
    await prepared.finalize()
    const { post } = prepared.response
    await settleStoryPostTopicVoteCapture(post.id, priorTopic.id)
    await Promise.all([
      setTestItemStoryId(priorItemId, null),
      addCategoryToRssFeedItem(currentItemId, currentTopic.id),
    ])
    const jobs = await captureAddedPublicationEffectsForScope(post.id, () =>
      completeStoryClusteringRun({ postId: null, rssFeedItemId: currentItemId }),
    )

    const topicIds = await getPostCategoryTopicIds(post.id)
    expect(topicIds).toContain(currentTopic.id)
    expect(topicIds).not.toContain(priorTopic.id)
    expect(jobs.flatMap(job => job.keys)).toEqual(
      expect.arrayContaining([
        { kind: 'impact_topic', uuidValue: priorTopic.id },
        { kind: 'impact_topic', uuidValue: currentTopic.id },
      ]),
    )
  })
})
