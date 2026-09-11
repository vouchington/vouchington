import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_SIDELOAD_SIGNING_KEY } from '@ts-shared/url-signing/test-key'
import { signPath } from '@ts-shared/url-signing'
import renderMarkdown, { renderMarkdownToHtml, renderMarkdownToHtmlBatch } from './index.mts'

describe('markdown rendering', () => {
  beforeEach(() => vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com/'))
  afterEach(() => vi.unstubAllEnvs())

  describe('renderMarkdown', () => {
    it('returns an empty string for empty input', async () => {
      expect(await renderMarkdown('')).toBe('')
      expect(await renderMarkdown('   ')).toBe('')
      expect(await renderMarkdown(null)).toBe('')
    })

    it('escapes HTML by default', async () => {
      const rendered = await renderMarkdown('<strong>Hello</strong>')
      expect(rendered).toContain('&lt;strong&gt;Hello&lt;/strong&gt;')
    })

    it('allows HTML when allowHtml is true', async () => {
      const rendered = await renderMarkdown('<strong>Hello</strong>', { allowHtml: true })
      expect(rendered).toContain('<strong>Hello</strong>')
    })

    it('adds ugc attributes to external links by default', async () => {
      const externalLink = await renderMarkdown('[Example](https://example.com)')
      expect(externalLink).toContain('rel="nofollow ugc noopener"')
      expect(externalLink).toContain('target="_blank"')

      const internalLink = await renderMarkdown('[Docs](/docs)')
      expect(internalLink).not.toContain('nofollow ugc')
      expect(internalLink).not.toContain('target="_blank"')
    })

    it('omits nofollow when nofollowLinks is false', async () => {
      const rendered = await renderMarkdown('[Example](https://example.com)', {
        nofollowLinks: false,
      })
      expect(rendered).not.toContain('nofollow ugc')
      expect(rendered).toContain('rel="noopener"')
      expect(rendered).toContain('target="_blank"')
    })

    it('proxies external images by default', async () => {
      const rendered = await renderMarkdown('![Alt](https://example.com/image.png)')
      expect(rendered).toContain('/sideload/')
      expect(rendered).not.toContain('https://example.com/image.png')
    })

    it('removes unsupported link schemes', async () => {
      const rendered = await renderMarkdown('[Bad](ws://example.com)')
      expect(rendered).not.toContain('ws://example.com')
      expect(rendered).not.toContain('href=')
    })

    it('removes unsupported image schemes', async () => {
      const rendered = await renderMarkdown('![Alt](data:image/png;base64,AAA)')
      expect(rendered).not.toContain('data:image')
      expect(rendered).not.toContain('src=')
    })

    it('allows specific safe schemes', async () => {
      const rendered = await renderMarkdown('[Mail](mailto:tests@voucha.ai) [Phone](tel:+123456)')
      expect(rendered).toContain('href="mailto:tests@voucha.ai"')
      expect(rendered).toContain('href="tel:+123456"')
    })
  })

  describe('renderMarkdownToHtml', () => {
    const absoluteProxyOptions = {
      imageProxySigningKeys: [TEST_SIDELOAD_SIGNING_KEY],
    }

    it('emits an absolute signed sideload URL', async () => {
      const html = await renderMarkdownToHtml(
        '![img](https://source.example/image.jpg)',
        absoluteProxyOptions,
      )
      assertAbsoluteSignedSideload(html)
    })

    it('emits absolute signed sideload URLs in a batch', async () => {
      const [html] = await renderMarkdownToHtmlBatch(
        ['![img](https://source.example/batch.jpg)'],
        absoluteProxyOptions,
      )
      assertAbsoluteSignedSideload(html)
    })

    it('returns an empty string for empty input', async () => {
      expect(await renderMarkdownToHtml('')).toBe('')
      expect(await renderMarkdownToHtml('   ')).toBe('')
      expect(await renderMarkdownToHtml(null)).toBe('')
    })

    it('converts markdown to HTML without processing mentions', async () => {
      const html = await renderMarkdownToHtml('Hello @alice')
      expect(html).toContain('Hello @alice')
      expect(html).not.toContain('<a href="/user/alice"')
    })

    it('escapes HTML by default', async () => {
      const html = await renderMarkdownToHtml('<strong>Hello</strong>')
      expect(html).toContain('&lt;strong&gt;Hello&lt;/strong&gt;')
    })

    it('allows HTML when allowHtml is true', async () => {
      const html = await renderMarkdownToHtml('<strong>Hello</strong>', { allowHtml: true })
      expect(html).toContain('<strong>Hello</strong>')
    })

    it('converts markdown syntax to HTML', async () => {
      const html = await renderMarkdownToHtml('# Heading\n\n**Bold** and *italic*')
      expect(html).toContain('<h1>Heading</h1>')
      expect(html).toContain('<strong>Bold</strong>')
      expect(html).toContain('<em>italic</em>')
    })
  })

  function assertAbsoluteSignedSideload(html: string | undefined): void {
    const src = html?.match(/src="([^"]+)"/)?.[1]
    expect(src).toBeDefined()
    const url = new URL(src!.replaceAll('&amp;', '&'))
    expect(url.origin).toBe('https://images.example.com')
    expect(url.pathname).toMatch(/^\/sideload\//)
    expect(url.searchParams.get('sig')).toBe(signPath(url.pathname, [TEST_SIDELOAD_SIGNING_KEY]))
  }
})

describe('renderMarkdownToHtml options', () => {
  it('allows HTML when allowHtml is true (admin mode)', async () => {
    const html = await renderMarkdownToHtml('<strong>Hello</strong>', { allowHtml: true })
    expect(html).toContain('<strong>Hello</strong>')
  })

  it('escapes HTML when allowHtml is false', async () => {
    const html = await renderMarkdownToHtml('<strong>Hello</strong>', { allowHtml: false })
    expect(html).toContain('&lt;strong&gt;Hello&lt;/strong&gt;')
  })

  it('adds nofollow to external links when nofollowLinks is true', async () => {
    const html = await renderMarkdownToHtml('[Example](https://example.com)', {
      nofollowLinks: true,
    })
    expect(html).toContain('rel="nofollow ugc noopener"')
    expect(html).toContain('target="_blank"')
  })

  it('uses dofollow for external links when nofollowLinks is false', async () => {
    const html = await renderMarkdownToHtml('[Example](https://example.com)', {
      nofollowLinks: false,
    })
    expect(html).not.toContain('nofollow')
    expect(html).toContain('rel="noopener"')
    expect(html).toContain('target="_blank"')
  })

  it('proxies external images when proxyImages is true', async () => {
    const html = await renderMarkdownToHtml('![img](https://example.com/photo.jpg)', {
      proxyImages: true,
    })
    expect(html).toContain('/sideload/')
    expect(html).not.toContain('https://example.com/photo.jpg')
  })

  it('respects nofollowLinks without requiring allowHtml or proxyImages', async () => {
    const html = await renderMarkdownToHtml('[Example](https://example.com)', {
      nofollowLinks: false,
    })
    expect(html).toContain('rel="noopener"')
    expect(html).not.toContain('nofollow')
  })

  it('preserves external image URLs when proxyImages is false', async () => {
    const html = await renderMarkdownToHtml('![img](https://example.com/photo.jpg)', {
      proxyImages: false,
    })
    expect(html).toContain('https://example.com/photo.jpg')
    expect(html).not.toContain('/sideload/')
  })

  it('strips dangerous tags in admin mode', async () => {
    const html = await renderMarkdownToHtml('<script>alert("xss")</script><b>safe</b>', {
      allowHtml: true,
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert')
    expect(html).toContain('<b>safe</b>')
  })

  it('combines admin options: allowHtml + dofollow + proxy', async () => {
    const md = '[Link](https://example.com) ![img](https://example.com/img.png)'
    const html = await renderMarkdownToHtml(md, {
      allowHtml: true,
      nofollowLinks: false,
      proxyImages: true,
    })
    expect(html).toContain('rel="noopener"')
    expect(html).not.toContain('nofollow')
    expect(html).toContain('/sideload/')
  })
})
