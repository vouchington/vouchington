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
  getTestPenaltiesByUserId,
  insertTestUrl,
  insertTestUrlHostname,
  updateUrlHostnameBlocked,
  getEntityRelation,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import type { PrivateUser } from '@services/users/types'
import { upsertSystemAdministrator } from '@services/users/system-users'
import { elections } from '../../../queues/elections/queues.mts'
import { notifications } from '@queues/notifications/queues'
import { createStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { reconcileStoryPostRelatedUrlProjection } from '../story-post-related-url-projection.mts'
import { lockPostPublicationPostScopes } from '@services/post-publication'

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

let testUser: PrivateUser
let feedId: string
let urlId: string

async function drainStoryPostRelatedUrlProjection(postId: string): Promise<void> {
  for (let page = 0; page < 10_000; page += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
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
    await upsertSystemAdministrator('story-teller')
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
    const { post } = await createStoryPost(story.id, testUser)

    await expect(refreshStoryPostForStory(story.id)).resolves.toMatchObject({ postId: post.id })
    expect(post.post_type).toBe('story')
  })

  it('is idempotent when called multiple times', async () => {
    const story = await insertTestStory({ title: 'Idempotent Refresh Story' })
    await insertItem(story.id)
    await insertItem(story.id)
    const { post } = await createStoryPost(story.id, testUser)

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
    const { post } = await createStoryPost(story.id, testUser)
    await drainStoryPostRelatedUrlProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.toContain(blockedUrlId)
    await updateUrlHostnameBlocked(hostnameId, true)
    const storyTeller = await upsertSystemAdministrator('story-teller')
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
    const { post } = await createStoryPost(story.id, testUser)
    await drainStoryPostRelatedUrlProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.not.toContain(referralUrlId)
    const storyTeller = await upsertSystemAdministrator('story-teller')
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
    const { post } = await createStoryPost(story.id, testUser)

    await expect(refreshStoryPostForStory(story.id)).resolves.toMatchObject({ postId: post.id })
  })

  it('handles refresh relation votes in the transaction without skipping notification reconciliation', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const story = await insertTestStory({ title: `Synchronous refresh votes ${random}` })
    const itemId = await insertItem(story.id)
    await insertItem(story.id)
    const { post } = await createStoryPost(story.id, testUser)
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

    const electionJobs = await readAllQueueJobs(elections)
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
      notifications.searchJobs({
        name: 'processReconcilePostNotifications',
        data: { postId: post.id },
      }),
    ).resolves.toHaveLength(1)
  })

  it('takes the publication lock before waiting on story topic relation rows', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const story = await insertTestStory({ title: `Publication lock story ${random}` })
    const topicId = await insertTestTopic({
      name: `Publication lock topic ${random}`,
      slug: `publication-lock-topic-${random}`,
      createdById: testUser.id,
    })
    const categorizedItemId = await insertItem(story.id)
    await addCategoryToRssFeedItem(categorizedItemId, topicId)
    await insertItem(story.id)
    const { post } = await createStoryPost(story.id, testUser)
    const relationLocked = Promise.withResolvers<void>()
    const releaseRelation = Promise.withResolvers<void>()
    async function holdStoryTopicRelation(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* refreshStoryPost publication lock test */
        SELECT 1
        FROM relation__post__category__topic
        WHERE subject_id = $1::uuid
        FOR UPDATE`,
        [post.id],
      )
      relationLocked.resolve()
      await releaseRelation.promise
      await query.commit()
    }
    const holder = holdStoryTopicRelation()
    await relationLocked.promise

    const refreshing = refreshStoryPostForStory(story.id)
    try {
      await vi.waitFor(async () => {
        await expect(contendForStoryPublicationLock()).rejects.toMatchObject({ code: '55P03' })
      })
    } finally {
      releaseRelation.resolve()
    }
    await holder
    await refreshing

    async function contendForStoryPublicationLock(): Promise<void> {
      await using query = await beginTransaction()
      await query(`/* refreshStoryPost publication lock timeout */ SET LOCAL lock_timeout = '50ms'`)
      await lockPostPublicationPostScopes(query, [post.id])
      await query.commit()
    }
  })
})
