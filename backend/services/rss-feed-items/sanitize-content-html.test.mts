import { describe, expect, it } from 'vitest'
import {
  sanitizeRssFeedItemContentHtml,
  sanitizeRssFeedItemContentHtmlBatch,
} from './sanitize-content-html.mts'
import type { RssFeedItemToUpsert } from './types.mts'

function makeData(overrides: Partial<RssFeedItemToUpsert> = {}): RssFeedItemToUpsert {
  return {
    link: 'https://example.com/article',
    guid: 'test-guid',
    ...overrides,
  }
}

describe('sanitizeRssFeedItemContentHtml', () => {
  const scriptScheme = `java${'script'}:`

  it('returns null when no content fields are present', async () => {
    const result = await sanitizeRssFeedItemContentHtml(makeData())
    expect(result).toBeNull()
  })

  it('returns null when content fields are empty strings', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({ 'content:encoded': '', content: '   ', description: '' }),
    )
    expect(result).toBeNull()
  })

  it('prefers content:encoded over content over description over summary', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({
        'content:encoded': '<p>encoded</p>',
        content: '<p>content</p>',
        description: '<p>description</p>',
        summary: '<p>summary</p>',
      }),
    )
    expect(result).toContain('encoded')
    expect(result).not.toContain('content<')
  })

  it('falls back to content when content:encoded is whitespace-only', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({ 'content:encoded': '   ', content: '<p>real content</p>' }),
    )
    expect(result).toContain('real content')
  })

  it('falls back to content when content:encoded is absent', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({ content: '<p>article text</p>' }),
    )
    expect(result).toContain('article text')
  })

  it('falls back to description when content:encoded and content are absent', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({ description: '<p>desc text</p>' }),
    )
    expect(result).toContain('desc text')
  })

  it('does not sanitize media:description as HTML content', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({ 'media:description': '<p>YouTube description</p>' }),
    )
    expect(result).toBeNull()
  })

  it('falls back to summary when higher priority fields are absent', async () => {
    const result = await sanitizeRssFeedItemContentHtml(makeData({ summary: '<p>summary</p>' }))
    expect(result).toContain('summary')
  })

  it('strips script tags (XSS)', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({
        'content:encoded': '<p>Safe</p><script>alert(1)</script>',
      }),
    )
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert(1)')
    expect(result).toContain('Safe')
  })

  it('strips event handler attributes', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({
        content: '<p onclick="evil()">click me</p><img onerror="evil()" src="img.png">',
      }),
    )
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('onerror')
    expect(result).toContain('click me')
  })

  it('strips javascript: URLs', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({ content: `<a href="${scriptScheme}alert(1)">click</a>` }),
    )
    expect(result).not.toContain(scriptScheme)
    expect(result).toContain('click')
  })

  it('preserves safe HTML elements — paragraphs, lists, headings, emphasis', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({
        'content:encoded':
          '<h2>Title</h2><p>Text with <strong>bold</strong> and <em>italic</em>.</p>' +
          '<ul><li>Item 1</li><li>Item 2</li></ul>',
      }),
    )
    expect(result).toContain('<h2>')
    expect(result).toContain('<p>')
    expect(result).toContain('<strong>')
    expect(result).toContain('<em>')
    expect(result).toContain('<ul>')
    expect(result).toContain('<li>')
  })

  it('adds rel=nofollow noopener and target=_blank to links', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({ content: '<a href="https://example.com">link</a>' }),
    )
    expect(result).toContain('rel="nofollow noopener"')
    expect(result).toContain('target="_blank"')
  })

  it('adds loading=lazy to images', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({ content: '<img src="https://example.com/img.jpg" alt="photo">' }),
    )
    expect(result).toContain('loading="lazy"')
  })

  it('handles malformed/partial HTML gracefully', async () => {
    const result = await sanitizeRssFeedItemContentHtml(
      makeData({ content: '<p>unclosed paragraph<b>bold without close' }),
    )
    expect(result).not.toBeNull()
    expect(result).toContain('unclosed paragraph')
  })
})

describe('sanitizeRssFeedItemContentHtmlBatch', () => {
  it('returns empty object for empty array', async () => {
    const result = await sanitizeRssFeedItemContentHtmlBatch([])
    expect(result).toEqual({})
  })

  it('sanitizes multiple items and returns correct ID mapping', async () => {
    const result = await sanitizeRssFeedItemContentHtmlBatch([
      { id: 'item-1', data: makeData({ 'content:encoded': '<p>First article</p>' }) },
      { id: 'item-2', data: makeData({ content: '<p>Second <strong>article</strong></p>' }) },
    ])
    expect(result['item-1']).toContain('First article')
    expect(result['item-2']).toContain('Second')
    expect(result['item-2']).toContain('<strong>')
  })

  it('omits items with no content fields from the result', async () => {
    const result = await sanitizeRssFeedItemContentHtmlBatch([
      { id: 'has-content', data: makeData({ content: '<p>content</p>' }) },
      { id: 'no-content', data: makeData() },
    ])
    expect(result['has-content']).toBeTruthy()
    expect(result['no-content']).toBeUndefined()
  })

  it('strips scripts in batch mode', async () => {
    const result = await sanitizeRssFeedItemContentHtmlBatch([
      {
        id: 'xss',
        data: makeData({ content: '<p>Safe</p><script>evil()</script>' }),
      },
    ])
    expect(result['xss']).not.toContain('<script>')
    expect(result['xss']).toContain('Safe')
  })

  it('handles all items having no content (returns empty object)', async () => {
    const result = await sanitizeRssFeedItemContentHtmlBatch([
      { id: 'a', data: makeData() },
      { id: 'b', data: makeData() },
    ])
    expect(result).toEqual({})
  })
})
