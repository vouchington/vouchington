import { describe, expect, it } from 'vitest'
import {
  htmlFragmentToPlainText,
  sanitizeHtmlFragment,
  sanitizePreviewHtmlFragment,
} from './safe-html-fragment'

describe('safe-html-fragment', () => {
  describe('sanitizeHtmlFragment', () => {
    it('preserves expected markdown and prose HTML', () => {
      const html = sanitizeHtmlFragment(
        '<h1>Title</h1><p class="body" data-kind="post" aria-label="Body"><a href="https://example.com" rel="noopener" target="_blank">link</a><img src="/sideload/abc?w=1200" alt="Photo" loading="lazy" decoding="async" fetchpriority="low"></p>',
      )

      expect(html).toContain('<h1>Title</h1>')
      expect(html).toContain('class="body"')
      expect(html).toContain('data-kind="post"')
      expect(html).toContain('aria-label="Body"')
      expect(html).toContain('href="https://example.com"')
      expect(html).toContain('rel="noopener noreferrer"')
      expect(html).toContain('target="_blank"')
      expect(html).toContain('src="/sideload/abc?w=1200"')
      expect(html).toContain('alt="Photo"')
      expect(html).toContain('loading="lazy"')
      expect(html).toContain('decoding="async"')
      expect(html).toContain('fetchpriority="low"')
    })

    it('drops dangerous tags and their contents', () => {
      const html = sanitizeHtmlFragment(
        '<p>Safe</p><script>alert(1)</script><style>body{color:red}</style><iframe src="https://example.com"></iframe><svg><circle /></svg>',
      )

      expect(html).toBe('<p>Safe</p>')
    })

    it('unwraps unknown tags while preserving safe text content', () => {
      expect(sanitizeHtmlFragment('<custom><strong>Safe</strong></custom>')).toBe(
        '<strong>Safe</strong>',
      )
    })

    it('strips inline styles, ids, event handlers, and unsupported attributes', () => {
      const html = sanitizeHtmlFragment(
        '<p class="body" id="content" style="color:red" onclick="alert(1)" nonce="abc">Hello</p>',
      )

      expect(html).toBe('<p class="body">Hello</p>')
    })

    it('adds safe rel tokens to blank-target links', () => {
      expect(sanitizeHtmlFragment('<a href="https://example.com" target=" _blank ">link</a>')).toBe(
        '<a href="https://example.com" target=" _blank " rel="noopener noreferrer">link</a>',
      )
    })

    it('preserves safe disclosure and table structure attributes', () => {
      const html = sanitizeHtmlFragment(
        '<details open><summary>More</summary></details><table><tr><td colspan="2" rowspan="3">Cell</td></tr></table>',
      )

      expect(html).toBe(
        '<details open=""><summary>More</summary></details><table><tbody><tr><td colspan="2" rowspan="3">Cell</td></tr></tbody></table>',
      )
    })

    it('strips unsafe link and image URLs', () => {
      const scriptScheme = `javascript:`
      const html = sanitizeHtmlFragment(
        `<a href="${scriptScheme}alert(1)">bad</a><a href="mailto:tests+test@voucha.ai">mail</a><img src="data:image/png;base64,abc" alt="bad"><img src="https://example.com/photo.jpg" alt="safe">`,
      )

      expect(html).toContain('<a>bad</a>')
      expect(html).toContain('<a href="mailto:tests+test@voucha.ai">mail</a>')
      expect(html).toContain('<img alt="bad">')
      expect(html).toContain('<img src="https://example.com/photo.jpg" alt="safe">')
    })

    it('strips protocol-relative, malformed, and whitespace-obfuscated URL schemes', () => {
      const html = sanitizeHtmlFragment(
        '<a href="//example.com">protocol</a><a href="1bad:thing">malformed</a><a href="java&#x0a;script:alert(1)">entity</a><img src="java\tscript:alert(1)" alt="bad">',
      )

      expect(html).toBe('<a>protocol</a><a>malformed</a><a>entity</a><img alt="bad">')
    })

    it('preserves relative URLs that contain colons after a slash', () => {
      const html = sanitizeHtmlFragment(
        '<a href="/docs/path:section">root relative</a><a href="docs/path:section">relative</a><a href="/search?q=a:b">query</a><a href="/docs#section:2">hash</a><img src="/images/path:asset.png" alt="safe">',
      )

      expect(html).toBe(
        '<a href="/docs/path:section">root relative</a><a href="docs/path:section">relative</a><a href="/search?q=a:b">query</a><a href="/docs#section:2">hash</a><img src="/images/path:asset.png" alt="safe">',
      )
    })
  })

  describe('sanitizePreviewHtmlFragment', () => {
    it('sanitizes and demotes headings', () => {
      expect(
        sanitizePreviewHtmlFragment(
          '<h1 onclick="alert(1)">Top</h1><p data-example="<h1>">Attr</p><h2>Nested</h2>',
        ),
      ).toBe('<h3>Top</h3><p data-example="&lt;h1>">Attr</p><h4>Nested</h4>')
    })
  })

  describe('htmlFragmentToPlainText', () => {
    it('extracts text with entity decoding and word boundaries', () => {
      expect(htmlFragmentToPlainText('<p>Doctor&#8217;s note &amp; more</p><p>Next</p>')).toBe(
        'Doctor\u2019s note & more Next',
      )
    })

    it('handles quoted angle brackets and malformed HTML through the parser', () => {
      expect(htmlFragmentToPlainText('<img alt=">" src="x"><p>Hello <strong>world</p>')).toBe(
        'Hello world',
      )
    })

    it('drops dangerous tag contents from plain text', () => {
      expect(htmlFragmentToPlainText('<p>Safe</p><script>alert(1)</script>')).toBe('Safe')
    })
  })
})
