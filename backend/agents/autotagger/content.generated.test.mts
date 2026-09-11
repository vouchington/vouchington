import { it, expect, describe } from 'vitest'
import { createPostAutotagContent, createRssFeedItemAutotagContent } from './content.mts'
import type { Post } from '@services/posts/types'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'

describe('content.generated', () => {
  it('createPostAutotagContent extracts title and markdown', async () => {
    const post: Partial<Post> = {
      id: 'test-post-id',
      title: 'Test Post Title',
      markdown: 'This is the markdown content of the post.',
    }

    const result = await createPostAutotagContent(post as Post)

    expect(result.content).toContain('Title: Test Post Title')
    expect(result.content).toContain('Content: This is the markdown content')
    expect(result.content_sha256).toBeInstanceOf(Buffer)
    expect(result.content_sha256.length).toBe(32) // SHA256 is 32 bytes
  })

  it('createPostAutotagContent handles empty markdown', async () => {
    const post: Partial<Post> = {
      id: 'test-post-id',
      title: 'Only Title',
      markdown: '',
    }

    const result = await createPostAutotagContent(post as Post)

    // Content is now wrapped for LLM consumption
    expect(result.content).toContain('Title: Only Title')
    expect(result.content).toContain('<external-content source="post"')
    expect(result.content).toContain('</external-content>')
  })

  it('createPostAutotagContent handles empty title', async () => {
    const post: Partial<Post> = {
      id: 'test-post-id',
      title: '',
      markdown: 'Only content here',
    }

    const result = await createPostAutotagContent(post as Post)

    // Content is now wrapped for LLM consumption
    expect(result.content).toContain('Content: Only content here')
    expect(result.content).toContain('<external-content source="post"')
    expect(result.content).toContain('</external-content>')
  })

  it('createPostAutotagContent generates consistent hashes for same content', async () => {
    const post: Partial<Post> = {
      id: 'test-post-id',
      title: 'Same Title',
      markdown: 'Same content',
    }

    const result1 = await createPostAutotagContent(post as Post)
    const result2 = await createPostAutotagContent(post as Post)

    expect(result1.content_sha256.equals(result2.content_sha256)).toBe(true)
  })

  it('createPostAutotagContent generates different hashes for different content', async () => {
    const post1: Partial<Post> = {
      id: 'test-post-id',
      title: 'First Title',
      markdown: 'First content',
    }

    const post2: Partial<Post> = {
      id: 'test-post-id',
      title: 'Second Title',
      markdown: 'Second content',
    }

    const result1 = await createPostAutotagContent(post1 as Post)
    const result2 = await createPostAutotagContent(post2 as Post)

    expect(result1.content_sha256.equals(result2.content_sha256)).toBe(false)
  })

  it('createRssFeedItemAutotagContent extracts title and content:encoded', async () => {
    const item: Partial<ViewRssFeedItem> = {
      id: 'test-rss-id',
      data: {
        link: 'https://example.com',
        guid: 'test-guid',
        title: 'RSS Item Title',
        'content:encoded': 'Full HTML content here',
      },
    }

    const result = await createRssFeedItemAutotagContent(item as ViewRssFeedItem)

    expect(result.content).toContain('Title: RSS Item Title')
    expect(result.content).toContain('Content: Full HTML content here')
    expect(result.content_sha256).toBeInstanceOf(Buffer)
  })

  it('createRssFeedItemAutotagContent falls back to content field', async () => {
    const item: Partial<ViewRssFeedItem> = {
      id: 'test-rss-id',
      data: {
        link: 'https://example.com',
        guid: 'test-guid',
        title: 'RSS Item',
        content: 'Regular content field',
      },
    }

    const result = await createRssFeedItemAutotagContent(item as ViewRssFeedItem)

    expect(result.content).toContain('Content: Regular content field')
  })

  it('createRssFeedItemAutotagContent falls back to description', async () => {
    const item: Partial<ViewRssFeedItem> = {
      id: 'test-rss-id',
      data: {
        link: 'https://example.com',
        guid: 'test-guid',
        title: 'RSS Item',
        summary: 'Summary field',
        description: 'Description field',
      },
    }

    const result = await createRssFeedItemAutotagContent(item as ViewRssFeedItem)

    expect(result.content).toContain('Description: Description field')
  })

  it('createRssFeedItemAutotagContent falls back to media:description', async () => {
    const item: Partial<ViewRssFeedItem> = {
      id: 'test-rss-id',
      data: {
        link: 'https://example.com',
        guid: 'test-guid',
        title: 'RSS Item',
        description: '<p>&nbsp;</p>',
        'media:description': 'YouTube media description',
      },
    }

    const result = await createRssFeedItemAutotagContent(item as ViewRssFeedItem)

    expect(result.content).toContain('Description: YouTube media description')
  })

  it('createRssFeedItemAutotagContent falls back to summary', async () => {
    const item: Partial<ViewRssFeedItem> = {
      id: 'test-rss-id',
      data: {
        link: 'https://example.com',
        guid: 'test-guid',
        title: 'RSS Item',
        summary: 'Summary field',
      },
    }

    const result = await createRssFeedItemAutotagContent(item as ViewRssFeedItem)

    expect(result.content).toContain('Summary: Summary field')
  })

  it('createRssFeedItemAutotagContent prefers content:encoded over other fields', async () => {
    const item: Partial<ViewRssFeedItem> = {
      id: 'test-rss-id',
      data: {
        link: 'https://example.com',
        guid: 'test-guid',
        title: 'RSS Item',
        'content:encoded': 'Encoded content',
        content: 'Regular content',
        description: 'Description',
        summary: 'Summary',
      },
    }

    const result = await createRssFeedItemAutotagContent(item as ViewRssFeedItem)

    expect(result.content).toContain('Content: Encoded content')
    expect(result.content).not.toContain('Regular content')
    expect(result.content).not.toContain('Description')
  })
})
