import { createHash } from 'node:crypto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import {
  createTestUserDirect,
  createSystemUser,
  restoreUser,
  softDeleteTestUserAndWaitBeforeCommit,
  isTestAuthorPublicationLifecycleLockWaiting,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import type { PrivateUser } from '@services/users/types'
import { upsertSystemAdministrator } from '@services/users/system-users'
import { createStoryPost } from '../story-posts.mts'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { canViewPost } from '@services/posts/check-privacy-access'
import { getPostStoryByStoryId } from '../get-post-stories.mts'

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

let testUser: PrivateUser
let otherUser: PrivateUser
let feedId: string
let urlId: string

async function insertItem(storyId: string, titlePrefix = 'Test Article', itemUrlId = urlId) {
  const random = Math.random().toString(36).slice(2, 10)
  const itemTitle = `${titlePrefix} ${random}`
  const itemData = { title: itemTitle, link: `https://example.com/${random}` }
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feedId,
    urlId: itemUrlId,
    guid: `story-posts-test-${random}`,
    itemData,
    contentSha256: sha256(itemData),
  })
  await setTestItemStoryId(itemId, storyId)
  return { itemId, itemTitle }
}

describe('story posts', () => {
  beforeAll(async () => {
    await upsertSystemAdministrator('story-teller')
    const [user, other, feed, testUrlId] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestRssFeed({}),
      createTestUrlWithHostname(),
    ])
    testUser = user!
    otherUser = other!
    feedId = feed.id
    urlId = testUrlId
  })

  it('createStoryPost — single-item story throws 422', async () => {
    const story = await insertTestStory({})
    await insertItem(story.id)

    await expect(createStoryPost(story.id, testUser)).rejects.toMatchObject({ status: 422 })
  })

  it('createStoryPost — multi-item story uses story.title', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const storyTitle = `Multi Story ${random}`
    const story = await insertTestStory({ title: storyTitle })
    await insertItem(story.id)
    await insertItem(story.id)

    const result = await createStoryPost(story.id, testUser)
    expect(result.post.title).toBe(storyTitle)
  })

  it('createStoryPost — post is approved on creation and visible to initiator and others', async () => {
    const story = await insertTestStory({ title: 'Visibility Test' })
    await insertItem(story.id)
    await insertItem(story.id)

    const result = await createStoryPost(story.id, testUser)

    expect(result.post.clearance_status).toBe('approved')
    expect(await canViewPost(testUser, result.post)).toBe(true)
    expect(await canViewPost(otherUser, result.post)).toBe(true)
    expect(await canViewPost(null, result.post)).toBe(true)
  })

  it('createStoryPost — ai_summary_markdown is empty (agent has not run)', async () => {
    const story = await insertTestStory({ title: 'No Summary Yet' })
    await insertItem(story.id)
    await insertItem(story.id)

    const result = await createStoryPost(story.id, testUser)
    expect(result.post.ai_summary_markdown).toBe('')
  })

  it('createStoryPost — ai_summary_markdown option sets post content directly', async () => {
    const story = await insertTestStory({ title: 'Summary Override Test' })
    await insertItem(story.id)
    await insertItem(story.id)

    const result = await createStoryPost(story.id, testUser, {
      ai_summary_markdown: 'Admin-provided summary.',
    })
    expect(result.post.ai_summary_markdown).toBe('Admin-provided summary.')
  })

  it('does not create a story post after a concurrent story-teller deletion commits', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const storyTeller = await createSystemUser(`story-teller-${random}`)
    const story = await insertTestStory({ title: 'Story-teller lifecycle lock' })
    await insertItem(story.id)
    await insertItem(story.id)
    const releaseDeletion = Promise.withResolvers<void>()
    const deletionHoldsAuthorLifecycle = Promise.withResolvers<void>()
    let deleting: Promise<void> | undefined
    let creationOutcome: Promise<unknown> | undefined

    try {
      deleting = softDeleteTestUserAndWaitBeforeCommit(
        storyTeller.id,
        releaseDeletion.promise,
        deletionHoldsAuthorLifecycle.resolve,
        async query => {
          await lockAuthorPublicationLifecycle(query, storyTeller.id)
        },
      )
      await deletionHoldsAuthorLifecycle.promise

      const creating = createStoryPost(
        story.id,
        testUser,
        {},
        { getStoryTeller: async () => storyTeller },
      )
      creationOutcome = creating.catch((error: unknown) => error)
      await vi.waitFor(async () => {
        await expect(isTestAuthorPublicationLifecycleLockWaiting(storyTeller.id)).resolves.toBe(
          true,
        )
      })
      releaseDeletion.resolve()

      await expect(deleting).resolves.toBeUndefined()
      await expect(creationOutcome).resolves.toMatchObject({
        status: 409,
        message: 'System user @story-teller is not active',
      })
      await expect(getPostStoryByStoryId(story.id)).resolves.toBeNull()
    } finally {
      releaseDeletion.resolve()
      await deleting?.catch(() => undefined)
      await creationOutcome
      await restoreUser(storyTeller.id)
    }
  })
})
