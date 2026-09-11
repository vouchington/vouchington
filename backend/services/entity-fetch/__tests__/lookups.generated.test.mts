import { it, expect, describe } from 'vitest'

import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestUrl,
  insertTestUrlHostname,
  hardDeleteTestUrl,
  softDeleteTopic,
  restoreTopic,
  softDeleteUser,
  restoreUser,
  deleteTestPost,
} from '@voucha/test-helpers'

import { createTopicAliases } from '@services/topics/aliases'

import {
  getTopicIdByAnyCached,
  getTopicIdsByAnyCachedBatch,
  getUserIdByAnyCached,
  getPostIdByAnyCached,
  getUrlIdByAnyCached,
  resolveRssFeedIds,
} from '@services/entity-cache/lookups'

import { invalidate } from '@services/entity-cache/invalidate'

describe('lookups.generated', () => {
  it('fails closed when a cached username resolves to a deleted user', async () => {
    const user = await createTestUser()
    const username = user.username!
    expect(await getUserIdByAnyCached(username)).toBe(user.id)

    await softDeleteUser(user.id)

    expect(await getUserIdByAnyCached(username)).toBeNull()
    expect(await getUserIdByAnyCached(user.id)).toBeNull()
  })

  it('getUserIdByAnyCached resolves user IDs and usernames', async () => {
    const user = await createTestUser()
    expect(user).toBeDefined()
    expect(user!.username).toBeTruthy()

    expect(await getUserIdByAnyCached(user!.id)).toBe(user!.id)
    expect(await getUserIdByAnyCached(user!.username!)).toBe(user!.id)
  })

  it('getTopicIdByAnyCached resolves topic IDs, slugs, and aliases', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Lookup Topic ${random}`,
      slug: `lookup-topic-${random}`,
      createdById: user!.id,
    })
    const alias = `lookup-topic-alias-${random}`
    await createTopicAliases(topicId, alias)

    expect(await getTopicIdByAnyCached(topicId)).toBe(topicId)
    expect(await getTopicIdByAnyCached(`lookup-topic-${random}`)).toBe(topicId)
    expect(await getTopicIdByAnyCached(alias)).toBe(topicId)
  })

  it('getTopicIdsByAnyCachedBatch resolves topic identifiers in input order', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topicId1 = await insertTestTopic({
      name: `Lookup Batch Topic 1 ${random}`,
      slug: `lookup-batch-topic-1-${random}`,
      createdById: user!.id,
    })
    const topicId2 = await insertTestTopic({
      name: `Lookup Batch Topic 2 ${random}`,
      slug: `lookup-batch-topic-2-${random}`,
      createdById: user!.id,
    })
    const alias = `lookup-batch-topic-alias-${random}`
    await createTopicAliases(topicId2, alias)

    await expect(
      getTopicIdsByAnyCachedBatch([
        `lookup-batch-topic-1-${random}`,
        topicId2,
        alias,
        `missing-topic-${random}`,
        `lookup-batch-topic-1-${random}`,
      ]),
    ).resolves.toEqual([topicId1, topicId2, topicId2, null, topicId1])
  })

  it('getPostIdByAnyCached resolves post IDs and slugs', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 15)
    const postId = await insertTestPost({
      title: `Lookup Post ${random}`,
      slug: `lookup-post-${random}`,
      createdById: user!.id,
      markdown: 'test',
    })
    expect(await getPostIdByAnyCached(postId)).toBe(postId)
    expect(await getPostIdByAnyCached(`lookup-post-${random}`)).toBe(postId)
  })

  it('getUrlIdByAnyCached resolves URL IDs and URL strings', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `lookup-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlString = `https://${hostname}/path`
    const urlId = await insertTestUrl({ url: urlString, hostnameId })
    expect(await getUrlIdByAnyCached(urlId)).toBe(urlId)
    expect(await getUrlIdByAnyCached(urlString)).toBe(urlId)
  })

  it('lookup helpers validate malformed identifiers', async () => {
    await expect(getUserIdByAnyCached('bad identifier')).rejects.toMatchObject({ status: 422 })
    await expect(getTopicIdByAnyCached('bad identifier')).rejects.toMatchObject({ status: 422 })
    await expect(getTopicIdsByAnyCachedBatch(['bad identifier'])).rejects.toMatchObject({
      status: 422,
    })
    await expect(getPostIdByAnyCached('bad identifier')).rejects.toMatchObject({ status: 422 })
    await expect(getUrlIdByAnyCached('bad identifier')).rejects.toMatchObject({ status: 422 })
  })

  it('getUrlIdByAnyCached returns null for missing non-public URL hostnames', async () => {
    await expect(getUrlIdByAnyCached('https://intranet/path')).resolves.toBeNull()
  })

  it('getUrlIdByAnyCached resolves legacy URL rows with non-public hostnames', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `legacy-lookup-${random}.local`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlString = `https://${hostname}/path`
    const urlId = await insertTestUrl({ url: urlString, hostnameId })
    expect(await getUrlIdByAnyCached(`${urlString}#section`)).toBe(urlId)
  })

  it('getUrlIdByAnyCached resolves http URLs by upgrading to https', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `lookup-http-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlString = `https://${hostname}/path`
    const urlId = await insertTestUrl({ url: urlString, hostnameId })
    // Querying with http: form should resolve to the same https: row
    expect(await getUrlIdByAnyCached(`http://${hostname}/path`)).toBe(urlId)
  })

  it('getUrlIdByAnyCached normalizes bare origins to trailing-slash form', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `lookup-norm-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    // addUrls stores URLs via new URL().toString() which adds trailing slash to bare origins.
    const urlString = `https://${hostname}/` // stored with trailing slash
    const urlId = await insertTestUrl({ url: urlString, hostnameId })
    // Both forms should resolve to the same ID via normalizeUrlForCache
    expect(await getUrlIdByAnyCached(`https://${hostname}`)).toBe(urlId)
    expect(await getUrlIdByAnyCached(`https://${hostname}/`)).toBe(urlId)
  })

  it('lookup helpers return null for well-formed but non-existent identifiers', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    expect(await getUserIdByAnyCached(`nonexistent-${random}`)).toBeNull()
    expect(await getTopicIdByAnyCached(`nonexistent-${random}`)).toBeNull()
    expect(await getPostIdByAnyCached(`nonexistent-${random}`)).toBeNull()
    expect(await getUrlIdByAnyCached(`https://nonexistent-${random}.example.com/`)).toBeNull()
  })

  it('resolveRssFeedIds throws 422 for non-UUID identifiers', () => {
    expect(() => resolveRssFeedIds(['not-a-uuid'])).toThrowError(
      expect.objectContaining({ status: 422 }),
    )
  })

  it('invalidate.topics evicts lookup cache so subsequent lookups re-query the DB', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const slug = `invalidate-test-${random}`
    const topicId = await insertTestTopic({
      name: `Invalidate Test ${random}`,
      slug,
      createdById: user!.id,
    })
    // Warm up the lookup cache: first call populates cache
    expect(await getTopicIdByAnyCached(slug)).toBe(topicId)

    // Soft-delete the topic in DB so a fresh DB query returns null
    await softDeleteTopic(topicId, user!.id)

    // Without invalidation the stale cached value would still return topicId.
    // After invalidation the cache entry is evicted and the DB is re-queried → null.
    await invalidate.topics(topicId)
    expect(await getTopicIdByAnyCached(slug)).toBeNull()

    await restoreTopic(topicId)
  })

  it('invalidate.topics evicts lookup cache when called with a slug (slug-key path)', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const slug = `invalidate-slug-test-${random}`
    const topicId = await insertTestTopic({
      name: `Invalidate Slug Test ${random}`,
      slug,
      createdById: user!.id,
    })
    // Warm up the lookup cache
    expect(await getTopicIdByAnyCached(slug)).toBe(topicId)

    // Soft-delete the topic so a fresh DB query returns null
    await softDeleteTopic(topicId, user!.id)

    // Pass slug (not UUID) so invalidate exercises the slug-key invalidation path
    await invalidate.topics(slug)
    expect(await getTopicIdByAnyCached(slug)).toBeNull()

    // Restore for cleanup
    await restoreTopic(topicId)
  })

  it('invalidate.users evicts lookup cache when called with a username (slug-key path)', async () => {
    const user = await createTestUser()
    const username = user!.username!

    // Warm up the lookup cache
    expect(await getUserIdByAnyCached(username)).toBe(user!.id)

    // Soft-delete the user so a fresh DB query returns null
    await softDeleteUser(user!.id)

    // Pass username (not UUID) so invalidate exercises the username-key invalidation path
    await invalidate.users(username)
    expect(await getUserIdByAnyCached(username)).toBeNull()

    // Restore for cleanup
    await restoreUser(user!.id)
  })

  it('invalidate.posts evicts lookup cache so subsequent lookups re-query the DB', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 15)
    const slug = `invalidate-post-${random}`
    const postId = await insertTestPost({
      title: `Invalidate Post ${random}`,
      slug,
      createdById: user!.id,
      markdown: 'test',
    })
    // Warm up the lookup cache: first call populates cache
    expect(await getPostIdByAnyCached(slug)).toBe(postId)

    // Soft-delete the post in DB so a fresh DB query returns null
    await deleteTestPost(postId)

    // Without invalidation the stale cached value would still return postId.
    // After invalidation the cache entry is evicted and the DB is re-queried → null.
    await invalidate.posts(postId)
    expect(await getPostIdByAnyCached(slug)).toBeNull()
  })

  it('urls_lookup treats URL paths as case-sensitive (distinct cache entries per path case)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `lookup-case-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    // url_hostnames FK: urls.hostname_id REFERENCES url_hostnames ON DELETE CASCADE,
    // so deleting the hostname cascades to urls — push order doesn't matter for cleanup.
    const lowerUrl = `https://${hostname}/path`
    const upperUrl = `https://${hostname}/Path`
    const lowerUrlId = await insertTestUrl({ url: lowerUrl, hostnameId })
    const upperUrlId = await insertTestUrl({ url: upperUrl, hostnameId })
    expect(await getUrlIdByAnyCached(lowerUrl)).toBe(lowerUrlId)
    expect(await getUrlIdByAnyCached(upperUrl)).toBe(upperUrlId)
    expect(lowerUrlId).not.toBe(upperUrlId)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof hardDeleteTestUrl)
})
