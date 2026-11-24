import { it, expect, describe } from 'vitest'
import { getPostIdsByUrlIds } from './get-posts-by-url-ids.mts'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { insertTestUrl } from '@voucha/test-helpers/entities/urls'
import { insertTestUrlHostname } from '@voucha/test-helpers/entities/url-hostnames'
import { createEntityRelationWithElection } from '@voucha/test-helpers/entities/dispatch'
import { insertTestLinkPostBare } from '@voucha/test-helpers/entities/link-posts'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { postsWorkConfig } from '../work-limits.mts'

describe('get-posts-by-url-ids', () => {
  it('returns empty map for empty url_ids', async () => {
    const result = await getPostIdsByUrlIds(null, [])
    expect(result).toEqual({})
  })

  it('returns posts related to a URL', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })

    const hostnameId = await insertTestUrlHostname({
      hostname: `test-posts-by-url-${Date.now()}.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://test-posts-by-url-${Date.now()}.com/article`,
      hostnameId,
    })
    // Create the post -> related -> url entity relation with a positive vote
    await createEntityRelationWithElection(post.id, urlId, user!.id, 1)
    const result = await getPostIdsByUrlIds(null, [urlId])
    expect(result[urlId]).toBeDefined()
    expect(result[urlId]).toContain(post.id)
  })

  it('excludes relations with zero or negative votes', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })

    const hostnameId = await insertTestUrlHostname({
      hostname: `test-zero-votes-${Date.now()}.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://test-zero-votes-${Date.now()}.com/article`,
      hostnameId,
    })
    // Create relation with 0 upvotes (default)
    await createEntityRelationWithElection(post.id, urlId, user!.id, 0)
    const result = await getPostIdsByUrlIds(null, [urlId])
    expect(result[urlId] ?? []).toEqual([])
  })

  it('returns empty for url_ids with no related posts', async () => {
    const hostnameId = await insertTestUrlHostname({ hostname: `test-no-posts-${Date.now()}.com` })
    const urlId = await insertTestUrl({
      url: `https://test-no-posts-${Date.now()}.com/article`,
      hostnameId,
    })
    const result = await getPostIdsByUrlIds(null, [urlId])
    expect(result[urlId] ?? []).toEqual([])
  })

  it('deduplicates a link post and source relation before filling five result slots', async () => {
    const user = await createTestUser()
    const suffix = crypto.randomUUID()
    const hostnameId = await insertTestUrlHostname({ hostname: `dedup-posts-${suffix}.com` })
    const urlId = await insertTestUrl({
      url: `https://dedup-posts-${suffix}.com/article`,
      hostnameId,
    })
    const createdAt = Date.now()
    const relatedPostIds = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        insertTestPost({
          title: `Dedup related post ${suffix}-${index}`,
          slug: `dedup-related-post-${suffix}-${index}`,
          createdById: user.id,
          markdown: '',
          createdAt: new Date(createdAt + index),
        }),
      ),
    )
    for (const postId of relatedPostIds) {
      await createEntityRelationWithElection(postId, urlId, user.id, 1)
    }
    const linkPostId = await insertTestPost({
      title: `Dedup link post ${suffix}`,
      slug: `dedup-link-post-${suffix}`,
      createdById: user.id,
      markdown: '',
      postType: 'link',
      urlId,
      createdAt: new Date(createdAt + 10),
    })
    await createEntityRelationWithElection(linkPostId, urlId, user.id, 1)

    const result = await getPostIdsByUrlIds(null, [urlId])
    expect(result[urlId]).toHaveLength(5)
    expect(new Set(result[urlId]).size).toBe(5)
    expect(result[urlId]).toEqual(expect.arrayContaining([...relatedPostIds, linkPostId]))
  })

  it('returns at most the configured number of posts for each URL', async () => {
    const user = await createTestUser()
    const suffix = crypto.randomUUID()
    const hostnameId = await insertTestUrlHostname({ hostname: `max-posts-${suffix}.com` })
    const urlId = await insertTestUrl({ url: `https://max-posts-${suffix}.com/a`, hostnameId })
    const postIds = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        insertTestPost({
          title: `Max posts ${suffix}-${index}`,
          slug: `max-posts-${suffix}-${index}`,
          createdById: user.id,
          markdown: '',
        }),
      ),
    )
    for (const postId of postIds) await createEntityRelationWithElection(postId, urlId, user.id, 1)
    await postsWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, { max_posts_per_url: 2 })
    try {
      expect((await getPostIdsByUrlIds(null, [urlId]))[urlId]).toHaveLength(2)
    } finally {
      restore()
    }
    expect((await getPostIdsByUrlIds(null, [urlId]))[urlId]).toHaveLength(4)
  })

  it('returns link posts matched by posts.url_id', async () => {
    const user = await createTestUser()
    const { postId, urlId } = await insertTestLinkPostBare({ createdById: user.id })
    const result = await getPostIdsByUrlIds(null, [urlId])
    expect(result[urlId]).toBeDefined()
    expect(result[urlId]).toContain(postId)
  })

  it('matches link posts on both a requested alias and its canonical URL', async () => {
    const user = await createTestUser()
    const suffix = crypto.randomUUID()
    const hostname = `canonical-posts-${suffix}.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const canonicalUrlId = await insertTestUrl({ url: `https://${hostname}/original`, hostnameId })
    const aliasUrlId = await insertTestUrl({
      url: `https://${hostname}/alias`,
      hostnameId,
      canonicalUrlId,
    })
    const [canonicalPostId, aliasPostId] = await Promise.all([
      insertTestPost({
        title: 'Canonical link post',
        slug: `canonical-link-post-${suffix}`,
        createdById: user.id,
        markdown: '',
        postType: 'link',
        urlId: canonicalUrlId,
      }),
      insertTestPost({
        title: 'Alias link post',
        slug: `alias-link-post-${suffix}`,
        createdById: user.id,
        markdown: '',
        postType: 'link',
        urlId: aliasUrlId,
      }),
    ])

    const result = await getPostIdsByUrlIds(null, [aliasUrlId, canonicalUrlId])
    expect(result[aliasUrlId]?.toSorted()).toEqual([aliasPostId, canonicalPostId].toSorted())
    expect(result[canonicalUrlId]).toEqual([canonicalPostId])
  })
})
