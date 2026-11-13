import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUser,
  createTopHashtagPostSourceForTest,
  createTopHashtagRssSourceForTest,
  getTopicAliasIdForTest,
  insertTestRssFeed,
  insertTestUrlHostname,
  insertUnlinkedTopicAliasForTest,
  setPostDeclaredLanguage,
} from '@voucha/test-helpers'
import { createTopicAliases } from '@services/topics/aliases'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'

describe('GET /api/v1/search', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 200 with correct shape for anonymous query', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/search?q=zzz_no_such_entity').expect(200)

    expect(response.body).toHaveProperty('topics')
    expect(response.body).toHaveProperty('posts')
    expect(response.body).toHaveProperty('news')
    expect(response.body).toHaveProperty('domains')
    expect(response.body).toHaveProperty('communities')

    expect(Array.isArray(response.body.topics)).toBe(true)
    expect(Array.isArray(response.body.posts)).toBe(true)
    expect(Array.isArray(response.body.news)).toBe(true)
    expect(Array.isArray(response.body.domains)).toBe(true)
    expect(Array.isArray(response.body.communities)).toBe(true)
  })

  it('returns empty shape for blank query', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/search?q=').expect(200)

    expect(response.body).toEqual({
      topics: [],
      posts: [],
      posts_page_info: { start_cursor: null, end_cursor: null, has_next_page: false },
      news: [],
      domains: [],
      communities: [],
    })
  })

  it('sets Cache-Control for anonymous requests', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/search?q=test').expect(200)
    expect(response.headers['cache-control']).toBe('public')
  })

  it('sets private no-store Cache-Control for authenticated requests', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/search?q=test').expect(200)

    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.body).toHaveProperty('topics')
    expect(response.body).toHaveProperty('communities')
  })

  it('rejects fractional limits before searching', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/search?q=test&limit=1.5').expect(422)

    expect(response.body.message).toBe('Invalid request query')
  })

  it.each(['ordinary query', '#unknown-cursor-validation-topic', ''])(
    'rejects malformed post cursors for query %s',
    async q => {
      await createRequest().get('/api/v1/search').query({ q, after: 'not-a-cursor' }).expect(400)
    },
  )

  it('returns the matching hashtag post ahead of newer unrelated posts', async () => {
    const alias = `omnisearch-page-${createRandomString(10).toLowerCase()}`
    await insertUnlinkedTopicAliasForTest(alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    if (!aliasId) throw new Error('Expected created topic alias')
    const target = await createTestPost({ user })
    await createTopHashtagPostSourceForTest({
      postId: target.id,
      topicAliasId: aliasId,
      userId: user.id,
      authoredToken: alias,
    })
    await withDominantPostFixtures(
      [998, 999].map(milliseconds => ({
        createdAt: new Date(`9999-12-31T23:59:59.${milliseconds}Z`),
        createdById: user.id,
      })),
      async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        const first = await request
          .get('/api/v1/search')
          .query({ q: `#${alias}` })
          .expect(200)
        expect(first.body.posts.map((post: { id: string }) => post.id)).toEqual([target.id])
        expect(first.body.posts_page_info.has_next_page).toBe(false)
      },
    )
  })

  it('returns an empty shape for an unknown hashtag topic mention', async () => {
    const request = createRequest()
    const response = await request
      .get('/api/v1/search?q=%23nonexistent-topic-slug-that-cannot-exist')
      .expect(200)

    expect(response.body).toEqual({
      topics: [],
      posts: [],
      posts_page_info: { start_cursor: null, end_cursor: null, has_next_page: false },
      news: [],
      domains: [],
      communities: [],
    })
  })

  it('filters posts and news by an unlinked hashtag alias', async () => {
    const alias = `omnisearch-exact-${createRandomString(10)}`
    await insertUnlinkedTopicAliasForTest(alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    expect(aliasId).not.toBeNull()

    const post = await createTestPost({ user })
    const topic = await createTestTopic({ user })
    const rssFeedId = await insertTestRssFeed({ topicId: topic.id, title: `Feed ${alias}` })
    const item = await createTestRssFeedItemWithUrl(rssFeedId)
    await Promise.all([
      createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: aliasId!,
        userId: user.id,
        authoredToken: alias,
      }),
      createTopHashtagRssSourceForTest({
        rssFeedItemId: item.id,
        topicAliasId: aliasId!,
        authoredToken: alias,
      }),
    ])

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get(`/api/v1/search?q=%23${alias}`).expect(200)

    expect(response.body.posts.map((result: { id: string }) => result.id)).toContain(post.id)
    expect(response.body.news.map((result: { id: string }) => result.id)).toContain(item.id)
    expect(response.body.topics).toEqual([])
    expect(response.body.domains).toEqual([])
    expect(response.body.communities).toEqual([])
  })

  it('filters linked hashtags through hashtag relations without leaking domain text matches', async () => {
    const suffix = createRandomString(10).toLowerCase()
    const alias = `omnisearch-linked-${suffix}`
    const topic = await createTestTopic({ user })
    const [linkedAlias] = await createTopicAliases(topic.id, [alias])
    const post = await createTestPost({ user, title: suffix })
    await Promise.all([
      createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: linkedAlias!.id,
        userId: user.id,
        authoredToken: `#${alias}`,
      }),
      insertTestUrlHostname({ hostname: `${suffix}.example.com`, is_crawlable: true }),
    ])

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get(`/api/v1/search?q=%23${alias}%20${suffix}`).expect(200)

    expect(response.body.posts.map((result: { id: string }) => result.id)).toContain(post.id)
    expect(response.body.domains).toEqual([])
  })

  it('does not leak text matches when a hashtag is unknown', async () => {
    const text = `omnisearch-unknown-${createRandomString(10)}`
    const post = await createTestPost({ user, title: text })
    const request = createRequest()
    await request.authenticateAs(user)

    const textSearch = await request.get(`/api/v1/search?q=${text}`).expect(200)
    expect(textSearch.body.posts.map((result: { id: string }) => result.id)).toContain(post.id)

    const response = await request.get(`/api/v1/search?q=${text}%20%23missing-${text}`).expect(200)
    expect(response.body).toEqual({
      topics: [],
      posts: [],
      posts_page_info: { start_cursor: null, end_cursor: null, has_next_page: false },
      news: [],
      domains: [],
      communities: [],
    })
  })

  it('keeps post-authored title language metadata separate from its display fallback', async () => {
    const title = `omnisearch-language-${createRandomString(10)}`
    const post = await createTestPost({ user, title })
    await setPostDeclaredLanguage(post.id, 'ar')
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get(`/api/v1/search?q=${title}`).expect(200)
    expect(response.body.posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: post.id,
          title,
          authored_title: title,
          declared_language: 'ar',
          lingua_rs_detected_language: null,
        }),
      ]),
    )
  })
})
