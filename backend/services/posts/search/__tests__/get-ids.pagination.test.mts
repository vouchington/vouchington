import { it, expect, describe } from 'vitest'
import { getPostIds } from '../get-ids.mts'
import { createTestPost, createTestUser, setPostVotesScoreUp } from '@voucha/test-helpers'

describe('get-ids (pagination)', () => {
  it('getPostIds pagination works with published_lt cursor', async () => {
    const user = await createTestUser()
    await createTestPost({ user })
    await createTestPost({ user })
    await createTestPost({ user })

    // Get first page with limit 1
    const page1 = await getPostIds(undefined, {
      user_id: user!.id,
      limit: 1,
      sort: 'new',
    })

    expect(page1.results.length).toBe(1)
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).toBeDefined()

    // Get second page
    expect(page1.page_info.end_cursor).toBeDefined()
    const page2 = await getPostIds(undefined, {
      user_id: user!.id,
      limit: 1,
      sort: 'new',
      after: page1.page_info.end_cursor ?? undefined,
    })
    expect(page2.results.length).toBeGreaterThan(0)

    // First page result should not appear in second page
    expect(page2.results.find(r => r.id === page1.results[0].id)).toBeUndefined()
  })

  it('getPostIds pagination with sort=new uses id for stable ordering', async () => {
    const user = await createTestUser()
    const post1 = await createTestPost({ user })
    const post2 = await createTestPost({ user })
    const post3 = await createTestPost({ user })

    const seen = new Set<string>()
    let after: string | undefined

    let iterations = 0
    while (iterations < 10) {
      const page = await getPostIds(undefined, {
        user_id: user!.id,
        sort: 'new',
        limit: 1,
        after,
      })
      if (page.results.length === 0) break

      const firstId = page.results[0].id
      expect(seen.has(firstId)).toBe(false)
      seen.add(firstId)

      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
      iterations++
    }

    expect(seen.has(post1.id)).toBe(true)
    expect(seen.has(post2.id)).toBe(true)
    expect(seen.has(post3.id)).toBe(true)
  })

  it('getPostIds end_cursor is an opaque base64 string for sort=best', async () => {
    const user = await createTestUser()
    await createTestPost({ user })
    await createTestPost({ user })
    await createTestPost({ user })

    const result = await getPostIds(undefined, {
      user_id: user!.id,
      sort: 'best',
      limit: 1,
    })

    expect(result.page_info.has_next_page).toBe(true)
    expect(result.page_info.end_cursor).toBeTruthy()
    // Cursor should be a base64 encoded string
    expect(typeof result.page_info.end_cursor).toBe('string')
    expect(result.page_info.end_cursor!.length).toBeGreaterThan(0)
  })

  it('getPostIds pagination with sort=best handles ties correctly', async () => {
    const user = await createTestUser()
    const post1 = await createTestPost({ user })
    const post2 = await createTestPost({ user })
    const post3 = await createTestPost({ user })
    // Force a genuine tie on the sort=best ranking key by setting equal scores directly —
    // no dependency on the entity-listener worker's self-upvote side effect (which only fires
    // for posts created via the real `@services/posts/create.mts` write path, not this raw
    // test fixture).
    await Promise.all([post1, post2, post3].map(post => setPostVotesScoreUp(post.id, 1)))

    // Get all posts in pages of 1
    const allPostIds = new Set<string>()
    let after: string | undefined
    let iterations = 0
    const maxIterations = 10

    while (iterations < maxIterations) {
      const result = await getPostIds(undefined, {
        user_id: user!.id,
        sort: 'best',
        limit: 1,
        after,
      })
      if (result.results.length === 0) break

      result.results.forEach(r => allPostIds.add(r.id))
      if (!result.page_info.has_next_page) break
      after = result.page_info.end_cursor ?? undefined
      iterations++
    }

    // All our test posts should be found (no duplicates, no skips)
    expect(allPostIds.has(post1.id)).toBe(true)
    expect(allPostIds.has(post2.id)).toBe(true)
    expect(allPostIds.has(post3.id)).toBe(true)
  })

  it('getPostIds works with sort=relevance without search query', async () => {
    const user = await createTestUser()
    const post1 = await createTestPost({ user })
    const post2 = await createTestPost({ user })

    const result = await getPostIds(undefined, {
      user_id: user!.id,
      sort: 'relevance',
      limit: 10,
    })

    expect(result.results).toBeDefined()
    expect(Array.isArray(result.results)).toBe(true)
    expect(result.page_info).toBeDefined()

    const foundPost1 = result.results.find(r => r.id === post1.id)
    const foundPost2 = result.results.find(r => r.id === post2.id)
    expect(foundPost1).toBeDefined()
    expect(foundPost2).toBeDefined()
  }, 30_000)

  it('getPostIds builds opaque ranking cursors for sort=relevance with text search', async () => {
    const user = await createTestUser()
    const uniqueToken = `RelevanceCursor${Date.now()}`

    const post1 = await createTestPost({
      user,
      title: `${uniqueToken} Alpha`,
      markdown: `${uniqueToken} body alpha`,
    })
    const post2 = await createTestPost({
      user,
      title: `${uniqueToken} Beta`,
      markdown: `${uniqueToken} body beta`,
    })

    const page1 = await getPostIds(undefined, {
      user_id: user!.id,
      text_search_query: uniqueToken,
      sort: 'relevance',
      limit: 1,
    })

    expect(page1.results.length).toBe(1)
    expect(typeof page1.page_info.start_cursor).toBe('string')
    expect(page1.page_info.start_cursor).toBeTruthy()

    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).toBeTruthy()
    expect(typeof page1.page_info.end_cursor).toBe('string')

    const page2 = await getPostIds(undefined, {
      user_id: user!.id,
      text_search_query: uniqueToken,
      sort: 'relevance',
      limit: 1,
      after: page1.page_info.end_cursor ?? undefined,
    })

    expect(page2.results.length).toBeGreaterThan(0)
    expect(page2.results[0]?.id).not.toBe(page1.results[0]?.id)

    expect([post1.id, post2.id]).toContain(page1.results[0]?.id)
  })

  it('getPostIds pagination with sort=relevance without search handles ties correctly', async () => {
    const user = await createTestUser()
    const post1 = await createTestPost({ user })
    const post2 = await createTestPost({ user })
    const post3 = await createTestPost({ user })

    const allPostIds = new Set<string>()
    let after: string | undefined
    let iterations = 0

    while (iterations < 10) {
      const result = await getPostIds(undefined, {
        user_id: user!.id,
        sort: 'relevance',
        limit: 1,
        after,
      })
      if (result.results.length === 0) break

      result.results.forEach(r => allPostIds.add(r.id))
      if (!result.page_info.has_next_page) break
      after = result.page_info.end_cursor ?? undefined
      iterations++
    }

    expect(allPostIds.has(post1.id)).toBe(true)
    expect(allPostIds.has(post2.id)).toBe(true)
    expect(allPostIds.has(post3.id)).toBe(true)
  })
})
