import { createHash, randomUUID } from 'node:crypto'
import { it, expect, beforeAll, describe } from 'vitest'
import {
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  insertTestStory,
  setTestItemStoryId,
  addCategoryToRssFeedItem,
  createTestTopic,
  getPostRelatedUrlIds,
  getPostCategoryTopicIds,
  createTestUserDirect,
  createReferralProgramFixture,
  getTestPostPublicationDirtyWorkForScope,
  getTestPenaltiesByUserId,
  insertTestUrl,
  insertTestUrlHostname,
  listTestPostPublicationImpactTopicIds,
  readAllQueueJobs,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import type { PrivateUser } from '@services/users/types'
import { ai_agents } from '@queues/ai-agents/queues'
import { upsertSystemAdministrator } from '@services/users/system-users'
import { createStoryPost } from '../story-posts.mts'
import { reconcileStoryPostRelatedUrlProjection } from '../story-post-related-url-projection.mts'

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

let feedId: string
let urlId: string
let testUser: PrivateUser

async function drainStoryPostRelatedUrlProjection(postId: string): Promise<void> {
  for (let page = 0; page < 10_000; page += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
    if (!result.continue) return
  }
  throw new Error('story post related URL projection did not drain')
}

describe('story-posts', () => {
  beforeAll(async () => {
    // Ensure @story-teller system user exists (same as seed script)
    await upsertSystemAdministrator('story-teller')

    feedId = (await createTestRssFeed({})).id
    urlId = await createTestUrlWithHostname()
    testUser = await createTestUserDirect()
  })

  it('createStoryPost — creates a story post and links via post__stories', async () => {
    const story = await insertTestStory({ title: 'Test Story Title' })
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `discussion-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
    await setTestItemStoryId(itemId, story.id)
    const random2 = Math.random().toString(36).slice(2, 10)
    const itemData2 = { title: `Item ${random2}`, link: `https://example.com/${random2}` }
    const itemId2 = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `discussion-test-2-${random2}`,
      itemData: itemData2,
      contentSha256: sha256(itemData2),
    })
    await setTestItemStoryId(itemId2, story.id)

    const result = await createStoryPost(story.id, testUser)
    await drainStoryPostRelatedUrlProjection(result.post.id)

    expect(result.post).toBeDefined()
    expect(result.post.post_type).toBe('story')
    // Multi-item: title comes from story.title
    expect(result.post.title).toBe('Test Story Title')
    // Agent has not run yet — summary is empty
    expect(result.post.ai_summary_markdown).toBe('')
    expect(result.postStory).toBeDefined()
    expect(result.postStory.post_id).toBe(result.post.id)
    expect(result.postStory.story_id).toBe(story.id)
    expect(result.postStory.initiated_by_id).toBe(testUser.id)
    await expect.poll(() => hasStoryPostAgentJob(result.post.id)).toBe(true)
  })

  it('createStoryPost — throws 409 if story already has a post', async () => {
    const story = await insertTestStory({ title: 'Already Has Discussion' })
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `dup-discussion-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
    await setTestItemStoryId(itemId, story.id)
    const random2 = Math.random().toString(36).slice(2, 10)
    const itemData2 = { title: `Item ${random2}`, link: `https://example.com/${random2}` }
    const itemId2 = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `dup-discussion-2-${random2}`,
      itemData: itemData2,
      contentSha256: sha256(itemData2),
    })
    await setTestItemStoryId(itemId2, story.id)

    // First call succeeds
    await createStoryPost(story.id, testUser)

    // Second call should throw 409
    await expect(createStoryPost(story.id, testUser)).rejects.toMatchObject({ status: 409 })
  })

  it('createStoryPost — throws 404 for unknown story', async () => {
    await expect(createStoryPost(randomUUID(), testUser)).rejects.toMatchObject({ status: 404 })
  })

  it('createStoryPost — creates post→related→url entity relations for all item URLs', async () => {
    const story = await insertTestStory({ title: 'URL Relations Test' })

    const random1 = Math.random().toString(36).slice(2, 10)
    const url1Id = await createTestUrlWithHostname()
    const item1Data = { title: `Item ${random1}`, link: `https://example.com/${random1}` }
    const item1Id = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: url1Id,
      guid: `url-rel-test-1-${random1}`,
      itemData: item1Data,
      contentSha256: sha256(item1Data),
    })

    const random2 = Math.random().toString(36).slice(2, 10)
    const url2Id = await createTestUrlWithHostname()
    const item2Data = { title: `Item ${random2}`, link: `https://example.com/${random2}` }
    const item2Id = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: url2Id,
      guid: `url-rel-test-2-${random2}`,
      itemData: item2Data,
      contentSha256: sha256(item2Data),
    })

    await setTestItemStoryId(item1Id, story.id)
    await setTestItemStoryId(item2Id, story.id)

    const result = await createStoryPost(story.id, testUser)

    // Multi-item: title falls back to story.title
    expect(result.post.title).toBe('URL Relations Test')

    await drainStoryPostRelatedUrlProjection(result.post.id)
    const linkedUrlIds = await getPostRelatedUrlIds(result.post.id)
    expect(linkedUrlIds).toContain(url1Id)
    expect(linkedUrlIds).toContain(url2Id)
  })

  it('createStoryPost — omits blocked and referral URLs already stored on story items without penalizing @story-teller', async () => {
    const suffix = randomUUID().slice(0, 8)
    const blockedHostnameId = await insertTestUrlHostname({
      hostname: `story-blocked-${suffix}.example.com`,
    })
    const blockedUrlId = await insertTestUrl({
      url: `https://story-blocked-${suffix}.example.com/article`,
      hostnameId: blockedHostnameId,
    })
    await updateUrlHostnameBlocked(blockedHostnameId, true)
    const referral = await createReferralProgramFixture({
      createdById: testUser.id,
      hostname: `story-referral-${suffix}.example.com`,
      pathname: '/ref/%',
    })
    const referralHostnameId = await insertTestUrlHostname({ hostname: referral.hostname })
    const referralUrlId = await insertTestUrl({
      url: `https://${referral.hostname}/ref/story`,
      hostnameId: referralHostnameId,
    })
    const allowedUrlId = await createTestUrlWithHostname()
    const story = await insertTestStory({ title: 'Stored unsafe story URLs' })

    for (const [index, itemUrlId] of [blockedUrlId, referralUrlId, allowedUrlId].entries()) {
      const itemData = {
        title: `Stored unsafe ${index}`,
        link: `https://example.com/${suffix}/${index}`,
      }
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: itemUrlId,
        guid: `stored-unsafe-${suffix}-${index}`,
        itemData,
        contentSha256: sha256(itemData),
      })
      await setTestItemStoryId(itemId, story.id)
    }
    const storyTeller = await upsertSystemAdministrator('story-teller')
    const penaltiesBeforeCreation = await getTestPenaltiesByUserId(storyTeller.id)

    const { post } = await createStoryPost(story.id, testUser)

    await drainStoryPostRelatedUrlProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([allowedUrlId])
    await expect(getTestPenaltiesByUserId(storyTeller.id)).resolves.toEqual(penaltiesBeforeCreation)
  })
  it('createStoryPost — forwards category topic_ids as post→category→topic entity relations', async () => {
    const story = await insertTestStory({ title: 'Category Forwarding Test' })
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `category-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
    await setTestItemStoryId(itemId, story.id)
    const random2 = Math.random().toString(36).slice(2, 10)
    const itemData2 = { title: `Item ${random2}`, link: `https://example.com/${random2}` }
    const itemId2 = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `category-test-2-${random2}`,
      itemData: itemData2,
      contentSha256: sha256(itemData2),
    })
    await setTestItemStoryId(itemId2, story.id)

    const topic = await createTestTopic({ name: `Category Topic ${random}` })
    await addCategoryToRssFeedItem(itemId, topic.id)

    const result = await createStoryPost(story.id, testUser)

    const linkedTopicIds = await getPostCategoryTopicIds(result.post.id)
    expect(linkedTopicIds).toContain(topic.id)
    const dirtyWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: result.post.id,
    })
    expect(dirtyWork).toBeDefined()
    await expect(listTestPostPublicationImpactTopicIds(dirtyWork!.id)).resolves.toContain(topic.id)
  })

  it('createStoryPost — throws 422 for story with fewer than 2 items', async () => {
    const story = await insertTestStory({})

    await expect(createStoryPost(story.id, testUser)).rejects.toMatchObject({ status: 422 })
  })

  it('createStoryPost — ai_summary_markdown option sets post content directly', async () => {
    const story = await insertTestStory({ title: 'AI Summary Override Test' })
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `ai-summary-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
    await setTestItemStoryId(itemId, story.id)
    const random2 = Math.random().toString(36).slice(2, 10)
    const itemData2 = { title: `Item ${random2}`, link: `https://example.com/${random2}` }
    const itemId2 = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `ai-summary-test-2-${random2}`,
      itemData: itemData2,
      contentSha256: sha256(itemData2),
    })
    await setTestItemStoryId(itemId2, story.id)

    const result = await createStoryPost(story.id, testUser, {
      ai_summary_markdown: 'Overridden summary.',
    })

    expect(result.post).toBeDefined()
    expect(result.post.ai_summary_markdown).toBe('Overridden summary.')
    await expect.poll(() => hasStoryPostAgentJob(result.post.id)).toBe(true)
  })
})

async function hasStoryPostAgentJob(postId: string): Promise<boolean> {
  const jobs = await readAllQueueJobs(ai_agents)
  return jobs.some(
    job => job.name === 'story-post' && (job.data as { post_id?: string }).post_id === postId,
  )
}
