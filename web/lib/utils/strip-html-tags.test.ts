import { describe, it, expect } from 'vitest'
import { stripHtmlTags } from './strip-html-tags'

describe('stripHtmlTags', () => {
  it('strips simple HTML tags', () => {
    expect(stripHtmlTags('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('strips nested tags with attributes', () => {
    expect(stripHtmlTags('<div><a href="https://example.com">link text</a></div>')).toBe(
      'link text',
    )
  })

  it('handles empty string', () => {
    expect(stripHtmlTags('')).toBe('')
  })

  it('returns plain text unchanged', () => {
    expect(stripHtmlTags('plain text')).toBe('plain text')
  })

  it('strips self-closing tags and preserves word boundary', () => {
    expect(stripHtmlTags('before<br/>after')).toBe('before after')
  })

  it('preserves word boundaries between adjacent block elements', () => {
    expect(stripHtmlTags('<p>Hello</p><p>world</p>')).toBe('Hello world')
  })

  it('strips img tags with attributes', () => {
    expect(stripHtmlTags('<p>Image: <img src="foo.png" alt="desc" /></p>')).toBe('Image:')
  })

  it('trims whitespace', () => {
    expect(stripHtmlTags('  <p>  hello  </p>  ')).toBe('hello')
  })

  it('decodes common named HTML entities', () => {
    expect(stripHtmlTags('AT&amp;T &quot;quoted&quot; &lt;tag&gt;')).toBe('AT&T "quoted" <tag>')
  })

  it('decodes &nbsp; to a regular space for plain-text display', () => {
    expect(stripHtmlTags('hello&nbsp;world')).toBe('hello world')
  })

  it('leaves unknown named entities unchanged', () => {
    expect(stripHtmlTags('&unknown;')).toBe('&unknown;')
  })

  it('decodes uppercase HTML entities case-insensitively', () => {
    expect(stripHtmlTags('&AMP;&LT;&GT;')).toBe('&<>')
  })

  it('preserves comparison operators that are not HTML tags', () => {
    expect(stripHtmlTags('a < b && c > d')).toBe('a < b && c > d')
  })

  it('decodes numeric decimal entities', () => {
    expect(stripHtmlTags('NASA&#8217;s Outlook glitch')).toBe('NASA\u2019s Outlook glitch')
    expect(stripHtmlTags('hello&#8230;')).toBe('hello\u2026')
  })

  it('decodes numeric hex entities', () => {
    expect(stripHtmlTags('Atmos&#x2122; card')).toBe('Atmos\u2122 card')
  })

  it('decodes entities inside stripped HTML', () => {
    expect(stripHtmlTags('<p>Doctor&#8217;s note &amp; more</p>')).toBe('Doctor\u2019s note & more')
  })

  it('handles quoted angle brackets in attributes', () => {
    expect(stripHtmlTags('<img alt=">" src="x"><p>Hello</p>')).toBe('Hello')
  })

  it('handles malformed HTML through the parser', () => {
    expect(stripHtmlTags('<p>Hello <strong>world</p>')).toBe('Hello world')
  })

  it('drops dangerous tag contents', () => {
    expect(stripHtmlTags('<p>Safe</p><script>alert(1)</script><style>.x{}</style>')).toBe('Safe')
  })
})
