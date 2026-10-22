import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestCommunity } from '@voucha/test-helpers/entities/communities'
import { insertTestRssFeed } from '@voucha/test-helpers/entities/rss-feeds'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { mergeTopicForTest, softDeleteTopic } from '@voucha/test-helpers/entities/topics/deletion'
import { createTestUserDirect, createTestUsername } from '@voucha/test-helpers/entities/users'
import { insertTopicAliasForTest } from '@voucha/test-helpers/sql-topics'
import { captureScopedTestQueries } from '@voucha/test-helpers/query-capture'
import { getCommunitiesByReferenceBatch } from '@services/communities/resolve-references'
import { getUsersByReferenceBatch } from '@services/users/resolve-references'
import getPostTool from './get-post.mts'
import { resolvePosts } from './resolve-post.mts'
import { resolveRssFeeds } from './resolve-rss-feed.mts'
import { resolveTopics } from './resolve-topic.mts'

describe('entity reference resolvers', () => {
  it('prefers a slug over another topic exact name', async () => {
    const user = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const shared = `shared-${suffix}`
    const bySlug = await insertTestTopic({
      createdById: user.id,
      name: `Slug ${suffix}`,
      slug: shared,
    })
    await insertTestTopic({ createdById: user.id, name: shared, slug: `name-${suffix}` })
    const [resolved] = await resolveTopics([shared])
    expect(resolved?.id).toBe(bySlug)
  })

  it('matches a renamed topic through the slug derived from its former display name', async () => {
    const user = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const renamed = await insertTestTopic({
      createdById: user.id,
      name: `Chase Sapphire Preferred ${suffix}`,
      slug: `chase-sapphire-${suffix}`,
    })

    const [resolved] = await resolveTopics([`Chase Sapphire ${suffix}`])

    expect(resolved?.id).toBe(renamed)
  })

  it('matches an alias through the slug derived from its display name', async () => {
    const user = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const topic = await insertTestTopic({
      createdById: user.id,
      name: `Canonical ${suffix}`,
      slug: `canonical-${suffix}`,
    })
    await insertTopicAliasForTest(topic, `chase-sapphire-${suffix}`)

    const [resolved] = await resolveTopics([`Chase Sapphire ${suffix}`])

    expect(resolved?.id).toBe(topic)
  })

  it('follows a merged source slug and an alias to the live topic', async () => {
    const user = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const source = await insertTestTopic({
      createdById: user.id,
      name: `Old ${suffix}`,
      slug: `old-${suffix}`,
    })
    const destination = await insertTestTopic({
      createdById: user.id,
      name: `New ${suffix}`,
      slug: `new-${suffix}`,
    })
    await mergeTopicForTest(source, destination, user.id)
    await insertTopicAliasForTest(destination, `alias-${suffix}`)
    const [merged, aliased] = await resolveTopics([`old-${suffix}`, `alias-${suffix}`])
    expect(merged?.id).toBe(destination)
    expect(aliased?.id).toBe(destination)
  })

  it('treats a deleted topic like an unknown reference', async () => {
    const user = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const topic = await insertTestTopic({
      createdById: user.id,
      name: `Gone ${suffix}`,
      slug: `gone-${suffix}`,
    })
    await softDeleteTopic(topic, user.id)
    const [deleted, unknown] = await resolveTopics([`gone-${suffix}`, `missing-${suffix}`])
    expect(deleted).toBeNull()
    expect(unknown).toBeNull()
  })

  it('returns the same post error for a hidden post and a missing id', async () => {
    const viewer = await createTestUser()
    const owner = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const hidden = await insertTestPost({
      title: `Hidden ${suffix}`,
      slug: `hidden-${suffix}`,
      createdById: owner.id,
      markdown: 'hidden',
      privacy: 'private',
      broadcast: 'followers',
    })
    const read = getPostTool.function(viewer)
    const hiddenResult = await read({ post_id: hidden })
    const missingResult = await read({ post_id: crypto.randomUUID() })
    expect(hiddenResult).toEqual({ success: false, error: 'Post not found' })
    expect(missingResult).toEqual(hiddenResult)
  })

  it('resolves an RSS feed from its id, trailing dot, port 80, and http or https', async () => {
    const user = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const topic = await insertTestTopic({
      createdById: user.id,
      name: `Feed ${suffix}`,
      slug: `feed-${suffix}`,
    })
    const host = `ref-${suffix}.example.com`
    const url = `https://${host}/feed.xml`
    const feed = await insertTestRssFeed({
      topicId: topic,
      title: `Feed ${suffix}`,
      rssFeedUrl: url,
    })
    const [byId, dotted, port, http] = await resolveRssFeeds([
      feed,
      `https://${host}./feed.xml`,
      `http://${host}:80/feed.xml`,
      `http://${host}/feed.xml`,
    ])
    expect([byId?.id, dotted?.id, port?.id, http?.id]).toEqual([feed, feed, feed, feed])
  })

  it('resolves every reference of one entity type in one statement', async () => {
    const user = await createTestUser()
    const username = createTestUsername()
    const named = await createTestUserDirect({ username })
    const suffix = crypto.randomUUID().slice(0, 8)
    const topic = await insertTestTopic({
      createdById: user.id,
      name: `Count ${suffix}`,
      slug: `count-${suffix}`,
    })
    const post = await insertTestPost({
      title: `Count ${suffix}`,
      slug: `count-post-${suffix}`,
      createdById: user.id,
      markdown: 'count',
    })
    const host = `count-${suffix}.example.com`
    const feed = await insertTestRssFeed({
      topicId: topic,
      title: `Count ${suffix}`,
      rssFeedUrl: `https://${host}/feed.xml`,
    })
    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `count-community-${suffix}`,
    })
    const queries = await captureScopedTestQueries(async () => {
      await resolveTopics([topic, `count-${suffix}`])
      await resolvePosts([post, `count-post-${suffix}`])
      await resolveRssFeeds([feed, `https://${host}/feed.xml`])
      await getCommunitiesByReferenceBatch([community.id, community.slug])
      await getUsersByReferenceBatch([named.id, username])
    })
    for (const comment of [
      'getTopicsByReferenceBatch',
      'getPostsByAnyBatch',
      'getRssFeedsByReferenceBatch',
      'getCommunitiesByReferenceBatch',
      'getUsersByReferenceBatch',
    ]) {
      expect(queries.filter(query => query.text.includes(comment))).toHaveLength(1)
    }
  })
})
