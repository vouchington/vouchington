import {
  createRandomString,
  createTestPost,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  beginTransaction,
  insertTestCommunity,
  insertTestPost,
  insertTestPostStory,
  insertTestRssFeedWithUrlId,
  insertTestRssFeedItem,
  insertTestStory,
  insertTestUrlDirect,
  setTestItemStoryId,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { updateCommunity } from '@services/communities'
import { createPost, deletePost, updatePost } from '@services/posts'
import { hardDeleteRssFeedById } from '@services/rss-feeds'
import { hardDeleteRssFeedSourcePage } from '@services/rss-feeds/hard-delete-source-page'
import { setRssFeedStatesAsCurrentUser } from '@services/rss-feeds/set-states-as-current-user'
import { ensureUserSuspendedInTransaction } from '@services/users'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import {
  captureAddedPublicationEffectsForScope,
  captureAddedPublicationEffectsForScopes,
} from '@voucha/test-helpers/publication-effect-jobs'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { describe, expect, it } from 'vitest'
import {
  acquirePublicationLifecycleLockWithTimeout,
  holdAuthorPublicationLifecycleLock,
  recordAuthorDeletionWithLockTimeout,
} from '@voucha/test-helpers/api/post-publication-lifecycle-test-support'

describe('post publication lifecycle capture integration', () => {
  it('captures an author and every authored post before user deletion reassignment', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Expected test user')
    const post = await createTestPost({ user })

    const jobs = await captureAddedPublicationEffectsForScopes([user.id, post.id], () =>
      deleteUserAndDrainForTest(user, user),
    )
    expect(jobs.map(job => job.scope)).toEqual(
      expect.arrayContaining([
        { type: 'author', id: user.id },
        { type: 'post', id: post.id },
      ]),
    )
    const authorKeys = jobs.filter(job => job.scope.type === 'author').flatMap(job => job.keys)
    expect(authorKeys).toContainEqual({ kind: 'impact_post', uuidValue: post.id })
    expect(authorKeys).toContainEqual({
      kind: 'identity_author_username',
      textValue: user.username,
    })
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
    try {
      await using suspension = await beginTransaction()
      await suspension(
        `/* suspension shares author lifecycle lock */ SET LOCAL lock_timeout = '50ms'`,
      )
      await expect(
        ensureUserSuspendedInTransaction(suspension, { actorId: admin.id, userId: user.id }),
      ).rejects.toMatchObject({ code: '55P03' })
    } finally {
      release()
    }
    await holder
  })
  it('captures RSS enablement and former story posts before feed deletion cascades', async () => {
    const administrator = await createTestUser({ administrator: true })
    if (!administrator) throw new Error('Expected administrator')
    const topic = await createTestTopic({ user: administrator })
    const { id: rssFeedId } = await insertTestRssFeedWithUrlId({
      topicId: topic.id,
      title: `publication capture ${createRandomString(8)}`,
    })

    const disabled = await captureAddedPublicationEffectsForScope(rssFeedId, () =>
      expect(
        setRssFeedStatesAsCurrentUser(administrator, rssFeedId, [
          { kind: 'enablement', is_enabled: false },
        ]),
      ).resolves.toBe('updated'),
    )
    const enabled = await captureAddedPublicationEffectsForScope(rssFeedId, () =>
      expect(
        setRssFeedStatesAsCurrentUser(administrator, rssFeedId, [
          { kind: 'enablement', is_enabled: true },
        ]),
      ).resolves.toBe('updated'),
    )
    expect(disabled.map(job => job.reason)).toContain('rss_feed_enablement_changed')
    expect(enabled.map(job => job.reason)).toContain('rss_feed_enablement_changed')
    expect(disabled[0]?.changeId).not.toBe(enabled[0]?.changeId)

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
    const page = await hardDeleteRssFeedSourcePage(rssFeedId)
    expect(page.keys).toContainEqual({ kind: 'impact_post', uuidValue: storyPostId })
  })

  it('retains prior explicit topic keys when a post replaces its categories', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!author) throw new Error('Expected author')
    const [firstTopic, secondTopic] = await Promise.all([
      createTestTopic({ user: author }),
      createTestTopic({ user: author }),
    ])
    const post = await createPost(author, WEB_PROVENANCE, {
      post_type: 'discussion',
      title: `Publication topic replacement ${createRandomString(8)}`,
      categories: [{ type: 'topic', topic_id: firstTopic.id }],
    })

    const jobs = await captureAddedPublicationEffectsForScope(post!.id, () =>
      updatePost(author, post!, { categories: [{ type: 'topic', topic_id: secondTopic.id }] }),
    )
    expect(jobs.flatMap(job => job.keys)).toContainEqual({
      kind: 'impact_topic',
      uuidValue: firstTopic.id,
    })
  })

  it('retains prior topic evidence when title or markdown hashtag synchronization removes relations', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!author) throw new Error('Expected author')
    const topic = await createTestTopic({ user: author })
    const post = await createPost(author, WEB_PROVENANCE, {
      post_type: 'discussion',
      title: `Publication hashtag ${createRandomString(8)}`,
      markdown: '#publication-topic',
      categories: [{ type: 'topic', topic_id: topic.id }],
    })

    const jobs = await captureAddedPublicationEffectsForScope(post!.id, () =>
      updatePost(author, post!, {
        title: `Publication removed ${createRandomString(8)}`,
        markdown: 'without a hashtag',
      }),
    )
    expect(jobs.flatMap(job => job.keys)).toContainEqual({
      kind: 'impact_topic',
      uuidValue: topic.id,
    })
  })

  it('retains prior topics for a combined content and category replacement', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!author) throw new Error('Expected author')
    const [firstTopic, secondTopic] = await Promise.all([
      createTestTopic({ user: author }),
      createTestTopic({ user: author }),
    ])
    const post = await createPost(author, WEB_PROVENANCE, {
      post_type: 'discussion',
      title: `Publication combined ${createRandomString(8)}`,
      markdown: 'first content',
      categories: [{ type: 'topic', topic_id: firstTopic.id }],
    })

    const jobs = await captureAddedPublicationEffectsForScope(post!.id, () =>
      updatePost(author, post!, {
        markdown: 'replacement content',
        categories: [{ type: 'topic', topic_id: secondTopic.id }],
      }),
    )
    expect(jobs.flatMap(job => job.keys)).toContainEqual({
      kind: 'impact_topic',
      uuidValue: firstTopic.id,
    })
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

    const unchangedCommunity = await captureAddedPublicationEffectsForScope(community.id, () =>
      updateCommunity(administrator, community.id, { name: community.name }),
    )
    expect(unchangedCommunity).toEqual([])
    const changedCommunity = await captureAddedPublicationEffectsForScope(community.id, () =>
      updateCommunity(administrator, community.id, { visibility: 'private' }),
    )
    expect(changedCommunity.length).toBeGreaterThan(0)

    const post = await createPost(administrator, WEB_PROVENANCE, {
      post_type: 'discussion',
      title: `Publication no-op ${createRandomString(8)}`,
    })
    const unchangedPost = await captureAddedPublicationEffectsForScope(post!.id, () =>
      updatePost(administrator, post!, {}),
    )
    expect(unchangedPost).toEqual([])
    const deleted = await captureAddedPublicationEffectsForScope(post!.id, () =>
      deletePost(administrator, post!),
    )
    expect(deleted.map(job => job.reason)).toContain('post_deleted')
    const deletedAgain = await captureAddedPublicationEffectsForScope(post!.id, () =>
      deletePost(administrator, post!),
    )
    expect(deletedAgain).toEqual([])
  })
})
