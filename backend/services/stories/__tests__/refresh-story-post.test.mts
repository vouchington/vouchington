import { createHash } from 'node:crypto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  createReferralProgramFixture,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  insertTestStory,
  setTestItemStoryId,
  insertTestTopic,
  addCategoryToRssFeedItem,
  getPostRelatedUrlIds,
  getPostCategoryTopicIds,
  getTestPenaltiesByUserId,
  insertTestUrl,
  insertTestUrlHostname,
  updateUrlHostnameBlocked,
  getEntityRelation,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { setTestRssFeedItemCategoryTopicId } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import type { PrivateUser } from '@services/users/types'
import { upsertSystemUser } from '@services/users/system-users'
import { background } from '@queues/background/queues'
import { STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB } from '@queues/background/enqueues/story-post-related-url-projections-jobs'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { processOwnedStoryProjectionPage } from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

let testUser: PrivateUser
let feedId: string
let urlId: string

async function drainStoryPostRelatedUrlProjection(postId: string): Promise<void> {
  for (let page = 0; page < 10_000; page += 1) {
    const result = await processOwnedStoryProjectionPage(postId)
    if (!result.continue) return
  }
  throw new Error('story post related URL projection did not drain')
}

async function insertItem(storyId: string, itemUrlId = urlId) {
  const random = Math.random().toString(36).slice(2, 10)
  const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feedId,
    urlId: itemUrlId,
    guid: `refresh-story-post-test-${random}`,
    itemData,
    contentSha256: sha256(itemData),
  })
  await setTestItemStoryId(itemId, storyId)
  return itemId
}

describe('refreshStoryPostForStory', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
    const [user, feed, testUrlId] = await Promise.all([
      createTestUserDirect(),
      createTestRssFeed({}),
      createTestUrlWithHostname(),
    ])
    testUser = user!
    feedId = feed.id
    urlId = testUrlId
  })

  it('is a no-op when story has no post', async () => {
    const story = await insertTestStory({})
    await expect(refreshStoryPostForStory(story.id)).resolves.toBeNull()
  })

  it('re-enqueues story post agent when story has a post', async () => {
    const story = await insertTestStory({ title: 'Refresh Test Story' })
    await insertItem(story.id)
    await insertItem(story.id)
    const prepared = await prepareStoryPost(story.id, testUser)
    await prepared.finalize()
    const { post } = prepared.response

    await expect(refreshStoryPostForStory(story.id)).resolves.toMatchObject({ postId: post.id })
    expect(post.post_type).toBe('story')
  })

  it('enqueues URL projection reconciliation only when the refresh transaction commits', async () => {
    const story = await insertTestStory({})
    await insertItem(story.id)
    await insertItem(story.id)
    const {
      response: { post },
    } = await prepareStoryPost(story.id, testUser)

    const add = vi.spyOn(background, 'add')
    const reconcileCalls = () =>
      add.mock.calls.filter(
        ([name]) => name === STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB.name,
      )
    try {
      {
        await using query = await beginTransaction()
        await expect(refreshStoryPostForStory(story.id, { query })).resolves.toMatchObject({
          postId: post.id,
        })
        expect(reconcileCalls()).toHaveLength(0)
        await query.rollback()
      }
      expect(reconcileCalls()).toHaveLength(0)

      await using query = await beginTransaction()
      await expect(refreshStoryPostForStory(story.id, { query })).resolves.toMatchObject({
        postId: post.id,
      })
      expect(reconcileCalls()).toHaveLength(0)
      await query.commit()
      expect(reconcileCalls()).toHaveLength(1)
    } finally {
      add.mockRestore()
    }
  })

  it('uses item topics committed during refresh', async () => {
    const suffix = crypto.randomUUID()
    const story = await insertTestStory({ title: `Concurrent topic refresh ${suffix}` })
    const previousTopic = await insertTestTopic({
      name: `Previous topic ${suffix}`,
      slug: `story-previous-${suffix}`,
      createdById: testUser.id,
    })
    const currentTopic = await insertTestTopic({
      name: `Current topic ${suffix}`,
      slug: `story-current-${suffix}`,
      createdById: testUser.id,
    })
    const itemId = await insertItem(story.id)
    await insertItem(story.id)
    const category = `refresh-topic-${suffix}`
    await addCategoryToRssFeedItem(itemId, previousTopic, category)
    const prepared = await prepareStoryPost(story.id, testUser)
    await prepared.finalize()
    const { post } = prepared.response

    const restore = beforePostgresTransactionQueryForTest(
      '/* markStoryPostRelatedUrlProjection */',
      values => values.includes(post.id),
      () => setTestRssFeedItemCategoryTopicId(itemId, category, currentTopic),
    )
    try {
      await refreshStoryPostForStory(story.id)
    } finally {
      restore()
    }
    await expect(getPostCategoryTopicIds(post.id)).resolves.toEqual([currentTopic])
  })

  it('is idempotent when called multiple times', async () => {
    const story = await insertTestStory({ title: 'Idempotent Refresh Story' })
    await insertItem(story.id)
    await insertItem(story.id)
    const prepared = await prepareStoryPost(story.id, testUser)
    await prepared.finalize()
    const { post } = prepared.response

    await expect(refreshStoryPostForStory(story.id)).resolves.toMatchObject({ postId: post.id })
    await expect(refreshStoryPostForStory(story.id)).resolves.toMatchObject({ postId: post.id })
  })

  it('drops newly blocked historical URLs without penalizing @story-teller on refresh', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({ hostname: `blocked-${random}.example.com` })
    const blockedUrlId = await insertTestUrl({
      url: `https://blocked-${random}.example.com/story-item`,
      hostnameId,
    })
    const story = await insertTestStory({ title: 'Blocked URL Refresh Story' })
    await insertItem(story.id, blockedUrlId)
    await insertItem(story.id)
    const prepared = await prepareStoryPost(story.id, testUser)
    await prepared.finalize()
    const { post } = prepared.response
    await drainStoryPostRelatedUrlProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.toContain(blockedUrlId)
    await updateUrlHostnameBlocked(hostnameId, true)
    const storyTeller = await upsertSystemUser('story-teller')
    const penaltiesBeforeRefresh = await getTestPenaltiesByUserId(storyTeller.id)

    await expect(refreshStoryPostForStory(story.id)).resolves.toMatchObject({ postId: post.id })
    await drainStoryPostRelatedUrlProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.not.toContain(blockedUrlId)

    const penaltiesAfterRefresh = await getTestPenaltiesByUserId(storyTeller.id)
    expect(penaltiesAfterRefresh).toEqual(penaltiesBeforeRefresh)
  })

  it('omits referral URLs without penalizing @story-teller across refresh', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const referral = await createReferralProgramFixture({
      createdById: testUser.id,
      hostname: `story-refresh-referral-${suffix}.example.com`,
      pathname: '/ref/%',
    })
    const hostnameId = await insertTestUrlHostname({ hostname: referral.hostname })
    const referralUrlId = await insertTestUrl({
      url: `https://${referral.hostname}/ref/story`,
      hostnameId,
    })
    const story = await insertTestStory({ title: 'Referral URL Refresh Story' })
    await insertItem(story.id, referralUrlId)
    await insertItem(story.id)
    const prepared = await prepareStoryPost(story.id, testUser)
    await prepared.finalize()
    const { post } = prepared.response
    await drainStoryPostRelatedUrlProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.not.toContain(referralUrlId)
    const storyTeller = await upsertSystemUser('story-teller')
    const penaltiesBeforeRefresh = await getTestPenaltiesByUserId(storyTeller.id)

    await expect(refreshStoryPostForStory(story.id)).resolves.toMatchObject({ postId: post.id })
    await drainStoryPostRelatedUrlProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.not.toContain(referralUrlId)
    await expect(getTestPenaltiesByUserId(storyTeller.id)).resolves.toEqual(penaltiesBeforeRefresh)
  })

  it('upserts topic relations when story items have categories', async () => {
    const story = await insertTestStory({ title: 'Topic Refresh Story' })
    const random = Math.random().toString(36).slice(2, 10)
    const topicId = await insertTestTopic({
      name: `Refresh Topic ${random}`,
      slug: `refresh-topic-${random}`,
      createdById: testUser.id,
    })
    const itemId = await insertItem(story.id)
    await addCategoryToRssFeedItem(itemId, topicId)
    await insertItem(story.id)
    const prepared = await prepareStoryPost(story.id, testUser)
    await prepared.finalize()
    const { post } = prepared.response

    await expect(refreshStoryPostForStory(story.id)).resolves.toMatchObject({ postId: post.id })
  })

  it('handles refresh relation votes in the transaction without skipping notification reconciliation', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const story = await insertTestStory({ title: `Synchronous refresh votes ${random}` })
    const itemId = await insertItem(story.id)
    await insertItem(story.id)
    const prepared = await prepareStoryPost(story.id, testUser)
    await prepared.finalize()
    const { post } = prepared.response
    const topicId = await insertTestTopic({
      name: `Synchronous refresh topic ${random}`,
      slug: `synchronous-refresh-topic-${random}`,
      createdById: testUser.id,
    })
    await addCategoryToRssFeedItem(itemId, topicId)

    await using query = await beginTransaction()
    const result = await refreshStoryPostForStory(story.id, { query })
    await query.commit()
    expect(result).not.toBeNull()
    await result!.dispatchPostCommitEffects()

    const [relation] = (await getEntityRelation(
      'relation__post__category__topic',
      post.id,
      topicId,
    )) as Array<{ id: string }>
    expect(relation).toBeDefined()

    const electionJobs = await readAllQueueJobs(background)
    expect(
      electionJobs.some(job => {
        const data = job.data as { electionId?: string; relationTable?: string }
        return (
          data.electionId === relation!.id &&
          data.relationTable === 'relation__post__category__topic'
        )
      }),
    ).toBe(false)

    await expect(
      background.searchJobs({
        name: 'notifications.processReconcilePostNotifications',
        data: { postId: post.id },
      }),
    ).resolves.toHaveLength(1)
  })
})
