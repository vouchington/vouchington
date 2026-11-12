import { describe, expect, it } from 'vitest'
import { createPostTextEmbeddingContent } from '@services/posts/content'
import { createRssFeedItemEmbeddingContent } from '@services/rss-feed-items/content'
import { createTopicEmbeddingContent } from '@services/topics/content'
import { createCrawlChunkEmbeddingContent } from '@services/crawl-chunks/content'

const rss = (title: string, content: string, description?: string) =>
  createRssFeedItemEmbeddingContent({
    title,
    content,
    description,
    link: 'https://example.com/item',
    guid: 'synthetic-guid',
  })
const crawl = (text: string) =>
  createCrawlChunkEmbeddingContent({
    text,
    breadcrumb: '',
    headers: [],
    level: 0,
    length: text.length,
  })

describe('shared full document cache identity', () => {
  it('distinguishes different title/body boundaries even when joined text is identical', () => {
    const posts = [
      createPostTextEmbeddingContent({ title: 'a\nb', markdown: 'c' }),
      createPostTextEmbeddingContent({ title: 'a', markdown: 'b\nc' }),
    ]
    const topics = [
      createTopicEmbeddingContent({ name: 'a\nb', markdown: 'c' }),
      createTopicEmbeddingContent({ name: 'a', aliases: ['b\n'], markdown: 'c' }),
    ]
    for (const [first, second] of [posts, topics]) {
      expect(first!.content).toBe(second!.content)
      expect(first!.content_sha256).not.toEqual(second!.content_sha256)
    }
  })

  it('shares one hash across entity types for the same normalized full document prompt', () => {
    const body = 'common\nbody'
    const post = createPostTextEmbeddingContent({ title: 'none', markdown: body })
    const feed = rss('none', 'common', 'body')
    const topic = createTopicEmbeddingContent({
      name: 'none',
      aliases: ['common'],
      markdown: 'body',
    })
    expect(feed.content_sha256).toEqual(post.content_sha256)
    expect(topic.content_sha256).toEqual(post.content_sha256)
    expect(crawl(body).content_sha256).toEqual(post.content_sha256)
    expect(createPostTextEmbeddingContent({ title: '', markdown: body }).content_sha256).toEqual(
      post.content_sha256,
    )
  })

  it('cannot confuse raw crawl text with a framed title/body identity', () => {
    const post = createPostTextEmbeddingContent({ title: 'a', markdown: 'b' })
    expect(crawl('["a","b"]').content_sha256).not.toEqual(post.content_sha256)
  })
})
