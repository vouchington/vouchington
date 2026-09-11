import { describe, expect, it } from 'vitest'
import { createRssFeedItemEmbeddingContent } from './content.mts'

describe('createRssFeedItemEmbeddingContent', () => {
  it('returns content and sha256 for a minimal item', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      title: 'Test Title',
    })
    expect(result.content).toContain('Test Title')
    expect(Buffer.isBuffer(result.content_sha256)).toBe(true)
  })

  it('handles an empty item gracefully', async () => {
    const result = await createRssFeedItemEmbeddingContent({ link: '', guid: '' })
    expect(typeof result.content).toBe('string')
    expect(Buffer.isBuffer(result.content_sha256)).toBe(true)
  })

  it('strips HTML link URLs and keeps link text', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      'content:encoded': '<p>Hello <a href="https://example.com">world</a></p>',
    })
    expect(result.content).toContain('world')
    expect(result.content).not.toContain('https://example.com')
  })

  it('strips image URLs and keeps alt text', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      content: '<img src="https://example.com/img.jpg" alt="A photo">',
    })
    expect(result.content).toContain('A photo')
    expect(result.content).not.toContain('https://example.com')
  })

  it('includes title and categories in the output', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      title: 'My Title',
      content: '<p>Article body</p>',
      categories: ['Tech', 'News'],
    })
    expect(result.content).toContain('My Title')
    expect(result.content).toContain('Tech')
    expect(result.content).toContain('News')
  })

  it('strips very long HTML content to lean text', async () => {
    // ~20,000 words wrapped in HTML — verifies HTML stripping produces clean text
    const longContent = `<p>${'word '.repeat(20_000)}</p>`
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      content: longContent,
    })
    expect(result.content).toContain('word')
    expect(result.content).not.toContain('<p>')
  })

  it('strips HTML from title', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      title: '<b>Bold Title</b>',
    })
    expect(result.content).toContain('Bold Title')
    expect(result.content).not.toContain('<b>')
  })

  it('strips HTML from categories', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      categories: ['<em>Tech</em>', 'News'],
    })
    expect(result.content).toContain('Tech')
    expect(result.content).toContain('News')
    expect(result.content).not.toContain('<em>')
  })

  it('does not truncate short content', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      title: 'Short',
      content: '<p>Brief article content.</p>',
    })
    expect(result.content).toContain('Short')
    expect(result.content).toContain('Brief article content')
  })

  it('sha256 differs when content differs', async () => {
    const r1 = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      title: 'Title A',
    })
    const r2 = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      title: 'Title B',
    })
    expect(r1.content_sha256.equals(r2.content_sha256)).toBe(false)
  })

  it('prefers content:encodedSnippet over content:encoded when available', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      'content:encodedSnippet': 'snippet text',
      'content:encoded': '<p>full HTML</p>',
    })
    expect(result.content).toContain('snippet text')
  })

  it('falls back to media:description for YouTube items', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      'media:description': 'YouTube video description text.',
    })
    expect(result.content).toContain('YouTube video description text.')
  })

  it('skips blank stripped content fields before media:description', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      description: '<p>&nbsp;</p>',
      'media:description': 'Visible YouTube description.',
    })
    expect(result.content).toContain('Visible YouTube description.')
  })

  it('hashes standard and media descriptions together', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      summary: 'RSS summary text.',
      'media:description': 'Visible YouTube media description.',
    })
    expect(result.content).toContain('Visible YouTube media description.')
    expect(result.content).toContain('RSS summary text.')
  })

  it('preserves escaped angle-bracket text as visible text', async () => {
    const result = await createRssFeedItemEmbeddingContent({
      link: '',
      guid: '',
      description: 'Use &lt;T&gt; when 1 &lt; 2 &gt; 0.',
    })
    expect(result.content).toContain('Use <T> when 1 < 2 > 0.')
  })
})
