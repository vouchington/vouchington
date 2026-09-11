import { createHash, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  addCategoryToRssFeedItem,
  createTestTopic,
  createTestUrlWithHostname,
  createTestUserDirect,
  getEntityRelation,
  getPostClearanceStatus,
  insertTestUrlDirect,
  insertTestRssFeedItem,
  insertTestStory,
  readAllQueueJobs,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { crawlUrls } from '@queues/crawler/queues'
import { notifications } from '@queues/notifications/queues'
import {
  createEntityRelationElectionTarget,
  getEntityRelationElectionVote,
  updateEntityRelationElectionVoteStatsFromPrimary,
} from '@services/elections-votes/entity-relation'
import { getSystemUserByUsername, upsertSystemAdministrator } from '@services/users/system-users'
import { createStoryPost } from '../story-posts.mts'
import { reconcileStoryPostRelatedUrlProjection } from '../story-post-related-url-projection.mts'
import { elections } from '../../../queues/elections/queues.mts'
import type { PrivateUser } from '@services/users/types'

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

describe('story post projection', () => {
  let feedId: string
  let testUser: PrivateUser

  beforeAll(async () => {
    await upsertSystemAdministrator('story-teller')
    const feedHostname = `story-projection-${randomUUID()}.example.test`
    feedId = (
      await createTestRssFeed({
        topicHostname: feedHostname,
        rssFeedUrl: `https://${feedHostname}/feed.xml`,
      })
    ).id
    testUser = await createTestUserDirect()
  })

  it('commits positive relation votes and queue effects after its projection transaction', async () => {
    const story = await insertTestStory({ title: 'Projection side effects' })
    const [firstUrlId, secondUrlId] = await Promise.all([
      createStoryProjectionUrl(),
      createStoryProjectionUrl(),
    ])
    const topic = await createTestTopic({ name: `Story projection topic ${randomUUID()}` })
    const itemIds = await Promise.all(
      [firstUrlId, secondUrlId].map(async (itemUrlId, index) => {
        const random = Math.random().toString(36).slice(2, 10)
        const itemData = {
          title: `Side effect item ${random}`,
          link: `https://example.com/${random}`,
        }
        const itemId = await insertTestRssFeedItem({
          rssFeedId: feedId,
          urlId: itemUrlId,
          guid: `story-effects-${index}-${random}`,
          itemData,
          contentSha256: sha256(itemData),
        })
        await setTestItemStoryId(itemId, story.id)
        return itemId
      }),
    )
    await addCategoryToRssFeedItem(itemIds[0]!, topic.id)

    const result = await createStoryPost(story.id, testUser, {}, { enqueueOnPostCreated: () => {} })
    await drainStoryPostRelatedUrlProjection(result.post.id)
    const [relation] = (await getEntityRelation(
      'relation__post__category__topic',
      result.post.id,
      topic.id,
    )) as Array<{ id: string }>
    expect(relation).toBeDefined()
    const storyTeller = await getSystemUserByUsername('story-teller')
    expect(storyTeller).toBeDefined()
    await expect(
      getEntityRelationElectionVote(storyTeller!.id, relation!.id),
    ).resolves.toMatchObject({ choice: 'confirm' })
    await updateEntityRelationElectionVoteStatsFromPrimary(
      createEntityRelationElectionTarget(relation!.id, 'relation__post__category__topic'),
    )
    const [updatedRelation] = (await getEntityRelation(
      'relation__post__category__topic',
      result.post.id,
      topic.id,
    )) as Array<{ votes_score_net: number }>
    expect(updatedRelation!.votes_score_net).toBeGreaterThan(0)
    await expect(getPostClearanceStatus(result.post.id)).resolves.toBe('approved')
    await expect.poll(() => hasCrawlUrlJob(firstUrlId)).toBe(true)
    await expect(hasPostNotificationJob(result.post.id)).resolves.toBe(true)
    await expect(hasEntityRelationVoteStatsJob(relation!.id)).resolves.toBe(false)
  })

  it('returns the public result and continues post-commit delivery when relation dispatch fails', async () => {
    const story = await insertTestStory({ title: 'Projection delivery failure' })
    const urlIds = await Promise.all([createTestUrlWithHostname(), createTestUrlWithHostname()])
    await Promise.all(
      urlIds.map(async (urlId, index) => {
        const random = Math.random().toString(36).slice(2, 10)
        const itemData = { title: `Failure item ${random}`, link: `https://example.com/${random}` }
        const itemId = await insertTestRssFeedItem({
          rssFeedId: feedId,
          urlId,
          guid: `story-delivery-failure-${index}-${random}`,
          itemData,
          contentSha256: sha256(itemData),
        })
        await setTestItemStoryId(itemId, story.id)
      }),
    )
    const dispatchError = new Error('relation dispatch failed')
    const reportedErrors: Error[] = []
    const effects: string[] = []

    const result = await createStoryPost(
      story.id,
      testUser,
      {},
      {
        dispatchStoryPostRelationEffects: async () => {
          throw dispatchError
        },
        invalidateStories: async storyId => {
          effects.push(`invalidate:${storyId}`)
        },
        enqueueOnPostCreated: postId => {
          effects.push(`created:${postId}`)
        },
        enqueueStoryPostAgent: async postId => {
          effects.push(`agent:${postId}`)
        },
        onError: error => {
          reportedErrors.push(error)
        },
      },
    )

    expect(Object.keys(result).toSorted()).toEqual(['post', 'postStory', 'story'])
    expect(reportedErrors).toEqual([dispatchError])
    expect(effects).toEqual([
      `invalidate:${story.id}`,
      `created:${result.post.id}`,
      `agent:${result.post.id}`,
    ])
  })
})

async function hasCrawlUrlJob(urlId: string): Promise<boolean> {
  const jobs = await readAllQueueJobs(crawlUrls)
  return jobs.some(job => (job.data as { url_id?: string }).url_id === urlId)
}

async function hasPostNotificationJob(postId: string): Promise<boolean> {
  const jobs = await notifications.searchJobs({
    state: 'waiting',
    name: 'processReconcilePostNotifications',
    data: { postId },
  })
  return jobs.length > 0
}

async function hasEntityRelationVoteStatsJob(relationId: string): Promise<boolean> {
  // No `state` key: `elections` always has a worker attached, so a `'waiting'` filter goes
  // deterministically empty once the worker drains the job to a terminal state. The shim skips the
  // state filter entirely when it is omitted (glide-mq testing.js searchJobs), so this still narrows
  // by name + data and just stops caring which state the match is in.
  const jobs = await elections.searchJobs({
    name: 'processUpdateElectionVoteStats',
    data: {
      electionId: relationId,
      relationTable: 'relation__post__category__topic',
    },
  })
  return jobs.length > 0
}

async function createStoryProjectionUrl(): Promise<string> {
  const url = await insertTestUrlDirect(
    null,
    `https://story-projection-url-${randomUUID()}.example.test/path`,
  )
  if (!url) throw new Error('Expected a public story projection URL')
  return url.id
}

async function drainStoryPostRelatedUrlProjection(postId: string): Promise<void> {
  for (let page = 0; page < 10_000; page += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
    if (!result.continue) return
  }
  throw new Error('story post related URL projection did not drain')
}
