import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { replayClusteredStory } from '../cluster-retry.mts'
import { completeStoryClusteringRun } from '../clustering/completion.mts'
import { prepareStoryPost } from '../story-posts.mts'
import type { StoryPostRefreshResult } from '../refresh-story-post.mts'
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
    let refreshAttempts = 0
    let completionAttempts = 0
    const refreshStoryPostForStory = async () => {
      refreshAttempts += 1
      return null
    }
    const completeClusteredStory = async (
      _storyId: string,
      refreshResult: StoryPostRefreshResult | null,
    ) => {
      expect(refreshResult).toBeNull()
      completionAttempts += 1
      if (completionAttempts === 1) throw new Error('post-commit effect failed')
    }

    await expect(
      replayClusteredStory(story.id, refreshStoryPostForStory, completeClusteredStory),
    ).rejects.toThrow('post-commit effect failed')
    await expect(
      replayClusteredStory(story.id, refreshStoryPostForStory, completeClusteredStory),
    ).resolves.toBeUndefined()
    expect(refreshAttempts).toBe(2)
    expect(completionAttempts).toBe(2)
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
