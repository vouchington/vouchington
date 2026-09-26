import { createHash, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { clusterRssFeedItem } from '../cluster.mts'
import { createStoryPost } from '../story-posts.mts'
import type { StoryPostRefreshResult } from '../refresh-story-post.mts'
import {
  addCategoryToRssFeedItem,
  createTestTopic,
  createTestUrlWithHostname,
  createTestUserDirect,
  getPostCategoryTopicIds,
  getTestPostPublicationDirtyWorkForScope,
  insertTestRssFeedItem,
  insertTestStory,
  listTestPostPublicationImpactTopicIds,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { upsertSystemAdministrator } from '@services/users/system-users'
import { settleStoryPostTopicVoteCapture } from '../../../test-helpers/services/stories/post-topic-vote-capture.mts'
import {
  acknowledgePostPublicationDirtyWork,
  claimPostPublicationDirtyWork,
} from '@services/post-publication/dirty-work'

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
    await upsertSystemAdministrator('story-teller')
  })

  it('replays post-commit completion when a committed assignment is retried', async () => {
    const story = await insertTestStory()
    const itemId = await makeAssignedItem(story.id)
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
      clusterRssFeedItem(itemId, randomUUID(), {
        refreshStoryPostForStory,
        completeClusteredStory,
      }),
    ).rejects.toThrow('post-commit effect failed')
    await expect(
      clusterRssFeedItem(itemId, randomUUID(), {
        refreshStoryPostForStory,
        completeClusteredStory,
      }),
    ).resolves.toEqual({ storyId: story.id, created: false })
    expect(refreshAttempts).toBe(2)
    expect(completionAttempts).toBe(2)
  })

  it('captures prior and current topics when an existing assignment is replayed', async () => {
    const user = await createTestUserDirect()
    const story = await insertTestStory()
    const priorItemId = await makeAssignedItem(story.id)
    const currentItemId = await makeAssignedItem(story.id)
    const priorTopic = await createTestTopic()
    const currentTopic = await createTestTopic()

    await addCategoryToRssFeedItem(priorItemId, priorTopic.id)
    const { post } = await createStoryPost(story.id, user)
    await settleStoryPostTopicVoteCapture(post.id, priorTopic.id)
    const initialWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: post.id,
    })
    expect(initialWork).toBeDefined()
    await acknowledgeCurrentPostPublicationWork(post.id)

    await Promise.all([
      setTestItemStoryId(priorItemId, null),
      addCategoryToRssFeedItem(currentItemId, currentTopic.id),
    ])
    await expect(clusterRssFeedItem(currentItemId, randomUUID())).resolves.toEqual({
      storyId: story.id,
      created: false,
    })

    const topicIds = await getPostCategoryTopicIds(post.id)
    expect(topicIds).toContain(currentTopic.id)
    expect(topicIds).not.toContain(priorTopic.id)
    const replayWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: post.id,
    })
    expect(replayWork).toBeDefined()
    await expect(listTestPostPublicationImpactTopicIds(replayWork!.id)).resolves.toEqual(
      expect.arrayContaining([priorTopic.id, currentTopic.id]),
    )
  })
})

async function acknowledgeCurrentPostPublicationWork(postId: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId })
    if (!work) return
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) continue
    const acknowledged = await acknowledgePostPublicationDirtyWork({
      id: claimed.id,
      generation: claimed.generation,
      leaseToken: claimed.lease_token,
    })
    if (acknowledged) return
  }
  throw new Error('Unable to acknowledge current post publication work')
}
