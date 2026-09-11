import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { addUrl } from '@services/urls'
import {
  createTestUserDirect,
  insertTestEmbeddings,
  insertTestPost,
  insertTestRssFeed,
  insertTestRssFeedItem,
  insertTestTopic,
  makeRandomEmbedding,
  setPostEmbeddingContentOnlySha256,
  setTopicEmbeddingContentSha256,
} from '@voucha/test-helpers'
import { reusableEmbeddingMissingClause, type PendingEntity } from './shared.mts'
import { streamPendingPosts } from './posts.mts'
import { streamPendingRssFeedItems } from './rss-feed-items.mts'
import { streamPendingTopics } from './topics.mts'

describe('streamPendingEntities', () => {
  it('rejects unsafe SQL aliases for reusable embedding predicates', () => {
    expect(() => reusableEmbeddingMissingClause('p; DROP TABLE posts')).toThrow(
      'reusableEmbeddingMissingClause: unsafe alias',
    )
  })

  it('excludes topics that already have a reusable centralized embedding', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const cachedTopicId = await insertTestTopic({
      name: `Cached Stream Topic ${suffix}`,
      slug: `cached-stream-topic-${suffix}`,
      createdById: user.id,
    })
    const uncachedTopicId = await insertTestTopic({
      name: `Uncached Stream Topic ${suffix}`,
      slug: `uncached-stream-topic-${suffix}`,
      createdById: user.id,
    })
    const cachedContentSha256 = randomBytes(32)
    await setTopicEmbeddingContentSha256(cachedTopicId, cachedContentSha256)
    await setTopicEmbeddingContentSha256(uncachedTopicId, randomBytes(32))
    await insertTestEmbeddings([
      { content_sha256: cachedContentSha256, embedding: makeRandomEmbedding() },
    ])

    const ids = await collectIds(streamPendingTopics())

    expect(ids).not.toContain(cachedTopicId)
    expect(ids).toContain(uncachedTopicId)
  })

  it('excludes posts that already have a reusable centralized embedding', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const cachedPostId = await insertTestPost({
      title: `Cached Stream Post ${suffix}`,
      slug: `cached-stream-post-${suffix}`,
      markdown: 'Cached post stream content.',
      createdById: user.id,
      postType: 'article',
    })
    const uncachedPostId = await insertTestPost({
      title: `Uncached Stream Post ${suffix}`,
      slug: `uncached-stream-post-${suffix}`,
      markdown: 'Uncached post stream content.',
      createdById: user.id,
      postType: 'article',
    })
    const cachedContentSha256 = randomBytes(32)
    await setPostEmbeddingContentOnlySha256(cachedPostId, cachedContentSha256)
    await setPostEmbeddingContentOnlySha256(uncachedPostId, randomBytes(32))
    await insertTestEmbeddings([
      { content_sha256: cachedContentSha256, embedding: makeRandomEmbedding() },
    ])

    const ids = await collectIds(streamPendingPosts())

    expect(ids).not.toContain(cachedPostId)
    expect(ids).toContain(uncachedPostId)
  })

  it('excludes RSS feed items that already have a reusable centralized embedding', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const topicId = await insertTestTopic({
      name: `Stream RSS Topic ${suffix}`,
      slug: `stream-rss-topic-${suffix}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Stream RSS Feed ${suffix}`,
    })
    const cachedUrl = await addUrl(null, `https://stream-rss-${suffix}.example.com/cached`)
    const uncachedUrl = await addUrl(null, `https://stream-rss-${suffix}.example.com/uncached`)
    const cachedContentSha256 = randomBytes(32)
    const cachedItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: cachedUrl!.id,
      guid: `cached-${suffix}`,
      itemData: makeRssItem(`cached-${suffix}`, cachedUrl!.url),
      contentSha256: cachedContentSha256,
    })
    const uncachedItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: uncachedUrl!.id,
      guid: `uncached-${suffix}`,
      itemData: makeRssItem(`uncached-${suffix}`, uncachedUrl!.url),
      contentSha256: randomBytes(32),
    })
    await insertTestEmbeddings([
      { content_sha256: cachedContentSha256, embedding: makeRandomEmbedding() },
    ])

    const ids = await collectIds(streamPendingRssFeedItems())

    expect(ids).not.toContain(cachedItemId)
    expect(ids).toContain(uncachedItemId)
  })
})

async function collectIds(stream: AsyncGenerator<PendingEntity, void, unknown>): Promise<string[]> {
  const ids: string[] = []
  for await (const entity of stream) {
    ids.push(entity.id)
  }
  return ids
}

function makeRssItem(guid: string, link: string) {
  return {
    guid,
    link,
    title: `Stream item ${guid}`,
    content: `Stream item content ${guid}`,
  }
}
