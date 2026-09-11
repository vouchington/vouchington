import {
  createRandomString,
  createTestPost,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  beginTransaction,
  getTestPostPublicationDirtyWorkForScope,
  isTestAuthorPublicationLifecycleLockWaiting,
  insertTestCommunity,
  insertTestPost,
  insertTestPostStory,
  insertTestRssFeedWithUrlId,
  insertTestRssFeedItem,
  insertTestStory,
  insertTestUrlDirect,
  listTestPostPublicationImpactPostIds,
  listTestPostPublicationImpactTopicIds,
  listTestPostPublicationRetainedTextKeys,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { updateCommunity } from '@services/communities'
import { createPost, deletePost, updatePost } from '@services/posts'
import { hardDeleteRssFeedById, setRssFeedEnablementAsCurrentUser } from '@services/rss-feeds'
import { suspendUser } from '@services/users'
import { deleteUserAndDrainForTest } from '@services/users/delete-test-support'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { describe, expect, it, vi } from 'vitest'
import {
  acquirePublicationLifecycleLockWithTimeout,
  holdAuthorPublicationLifecycleLock,
  recordAuthorDeletionWithLockTimeout,
} from './post-publication-lifecycle-test-support.mts'

describe('post publication lifecycle capture integration', () => {
  it('captures an author and every authored post before user deletion reassignment', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected test user')
    const post = await createTestPost({ user })

    await deleteUserAndDrainForTest(user, user)

    const [authorWork, postWork] = await Promise.all([
      getTestPostPublicationDirtyWorkForScope({ type: 'author', id: user.id }),
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id }),
    ])
    expect(authorWork).toMatchObject({ author_user_id: user.id })
    expect(postWork).toMatchObject({ post_id: post.id })
    await expect(listTestPostPublicationImpactPostIds(authorWork!.id)).resolves.toContain(post.id)
    await expect(
      listTestPostPublicationRetainedTextKeys(authorWork!.id, 'identity_author_username'),
    ).resolves.toContain(user.username)
  })

  it('locks authored posts before writing author deletion dirty work', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')
    const post = await createTestPost({ user })

    await using first = await beginTransaction()
    await first(`/* lock authored post */ SELECT id FROM posts WHERE id = $1 FOR UPDATE`, [post.id])
    await expect(recordAuthorDeletionWithLockTimeout(user.id)).rejects.toMatchObject({
      code: '55P03',
    })
    await first.commit()
  })

  it('shares the author lifecycle lock with suspension', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    if (!admin || !user) throw new Error('Expected users')
    let release!: () => void
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    let ready!: () => void
    const holderReady = new Promise<void>(resolve => {
      ready = resolve
    })
    const holder = holdAuthorPublicationLifecycleLock(user.id, ready, held)
    await holderReady
    const suspension = suspendUser(admin, user.id)
    try {
      await vi.waitFor(async () => {
        expect(await isTestAuthorPublicationLifecycleLockWaiting(user.id)).toBe(true)
      })
    } finally {
      release()
    }
    await holder
    await expect(suspension).resolves.toMatchObject({ id: user.id })
  })
  it('captures RSS enablement and former story posts before feed deletion cascades', async () => {
    const administrator = await createTestUser({ administrator: true })
    if (!administrator) throw new Error('Expected administrator')
    const topic = await createTestTopic({ user: administrator })
    const { id: rssFeedId } = await insertTestRssFeedWithUrlId({
      topicId: topic.id,
      title: `publication capture ${createRandomString(8)}`,
    })

    await expect(
      setRssFeedEnablementAsCurrentUser(administrator, { rssFeedId, enabled: false }),
    ).resolves.toBe('updated')
    const disabledWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'rss_feed',
      id: rssFeedId,
    })
    await expect(
      setRssFeedEnablementAsCurrentUser(administrator, { rssFeedId, enabled: true }),
    ).resolves.toBe('updated')
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: rssFeedId }),
    ).resolves.toMatchObject({ generation: String(Number(disabledWork!.generation) + 1) })

    const story = await insertTestStory()
    const storyPostId = await insertTestPost({
      title: `Publication story ${createRandomString(8)}`,
      slug: `publication-story-${createRandomString(8)}`,
      createdById: administrator.id,
      markdown: '',
      postType: 'story',
    })
    await insertTestPostStory(storyPostId, story.id, administrator.id)
    const itemUrl = await insertTestUrlDirect(
      administrator.id,
      `https://example.com/${createRandomString(8)}`,
    )
    if (!itemUrl) throw new Error('Expected RSS item URL')
    const itemId = await insertTestRssFeedItem({
      rssFeedId,
      urlId: itemUrl.id,
      guid: createRandomString(16),
      itemData: { title: 'Publication capture source' },
      contentSha256: Buffer.alloc(32),
    })
    await setTestItemStoryId(itemId, story.id)

    await expect(hardDeleteRssFeedById(rssFeedId)).resolves.toBe(true)
    const deletedWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'rss_feed',
      id: rssFeedId,
    })
    await expect(listTestPostPublicationImpactPostIds(deletedWork!.id)).resolves.toContain(
      storyPostId,
    )
  })

  it('retains prior explicit topic keys when a post replaces its categories', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!author) throw new Error('Expected author')
    const [firstTopic, secondTopic] = await Promise.all([
      createTestTopic({ user: author }),
      createTestTopic({ user: author }),
    ])
    const post = await createPost(author, {
      post_type: 'discussion',
      title: `Publication topic replacement ${createRandomString(8)}`,
      categories: [{ type: 'topic', topic_id: firstTopic.id }],
    })

    await updatePost(author, post!, { categories: [{ type: 'topic', topic_id: secondTopic.id }] })

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post!.id })
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toContain(firstTopic.id)
  })

  it('retains prior topic evidence when title or markdown hashtag synchronization removes relations', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!author) throw new Error('Expected author')
    const topic = await createTestTopic({ user: author })
    const post = await createPost(author, {
      post_type: 'discussion',
      title: `Publication hashtag ${createRandomString(8)}`,
      markdown: '#publication-topic',
      categories: [{ type: 'topic', topic_id: topic.id }],
    })

    await updatePost(author, post!, {
      title: `Publication removed ${createRandomString(8)}`,
      markdown: 'without a hashtag',
    })

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post!.id })
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toContain(topic.id)
  })

  it('retains prior topics for a combined content and category replacement', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!author) throw new Error('Expected author')
    const [firstTopic, secondTopic] = await Promise.all([
      createTestTopic({ user: author }),
      createTestTopic({ user: author }),
    ])
    const post = await createPost(author, {
      post_type: 'discussion',
      title: `Publication combined ${createRandomString(8)}`,
      markdown: 'first content',
      categories: [{ type: 'topic', topic_id: firstTopic.id }],
    })

    await updatePost(author, post!, {
      markdown: 'replacement content',
      categories: [{ type: 'topic', topic_id: secondTopic.id }],
    })

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post!.id })
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toContain(firstTopic.id)
  })

  it('serializes author and RSS lifecycle writers with transaction advisory locks', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected user')
    await using authorLock = await beginTransaction()
    await lockAuthorPublicationLifecycle(authorLock, user.id)
    await expect(
      acquirePublicationLifecycleLockWithTimeout('author', user.id),
    ).rejects.toMatchObject({
      code: '55P03',
    })
    await authorLock.commit()

    const topic = await createTestTopic({ user })
    const { id: rssFeedId } = await insertTestRssFeedWithUrlId({
      topicId: topic.id,
      title: `Publication feed lock ${createRandomString(8)}`,
    })
    await using rssLock = await beginTransaction()
    await rssLock(
      `/* postPublicationRssLock */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [rssFeedId],
    )
    await expect(
      acquirePublicationLifecycleLockWithTimeout('rss-feed', rssFeedId),
    ).rejects.toMatchObject({
      code: '55P03',
    })
    await rssLock.commit()
  })

  it('emits work only for publication-relevant community and post state changes', async () => {
    const administrator = await createTestUser({ administrator: true })
    if (!administrator) throw new Error('Expected administrator')
    const community = await insertTestCommunity({
      createdById: administrator.id,
      visibility: 'public',
    })

    await updateCommunity(administrator, community.id, { name: community.name })
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'community', id: community.id }),
    ).resolves.toBeUndefined()
    await updateCommunity(administrator, community.id, { visibility: 'private' })
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'community', id: community.id }),
    ).resolves.toMatchObject({ community_id: community.id })

    const post = await createPost(administrator, {
      post_type: 'discussion',
      title: `Publication no-op ${createRandomString(8)}`,
    })
    const initialWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: post!.id,
    })
    await updatePost(administrator, post!, {})
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post!.id }),
    ).resolves.toMatchObject({ generation: initialWork!.generation })

    await deletePost(administrator, post!)
    const deletedWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: post!.id,
    })
    await deletePost(administrator, post!)
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post!.id }),
    ).resolves.toMatchObject({ generation: deletedWork!.generation })
  })
})
