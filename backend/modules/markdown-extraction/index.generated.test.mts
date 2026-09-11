import { describe, expect, it } from 'vitest'
import extractMarkdown from './index.mts'

describe('extractMarkdown', () => {
  it('extracts markdown links and images', async () => {
    const result = await extractMarkdown(
      'Check [Voucha](https://voucha.com) ![Logo](https://voucha.com/logo.png)',
    )
    expect(result.link_urls).toEqual(['https://voucha.com'])
    expect(result.image_urls).toEqual(['https://voucha.com/logo.png'])
  })

  it('extracts auto-linkified URLs when linkify is enabled', async () => {
    const result = await extractMarkdown('Visit https://voucha.com today')
    expect(result.link_urls).toEqual(['https://voucha.com'])
    expect(result.image_urls).toEqual([])
  })

  it('returns empty arrays when no markdown content is provided', async () => {
    expect(await extractMarkdown('')).toEqual({ link_urls: [], image_urls: [] })
    expect(await extractMarkdown(null)).toEqual({ link_urls: [], image_urls: [] })
  })

  it('ignores URLs with unsupported schemes', async () => {
    const result = await extractMarkdown(
      '[Bad](ws://example.com) ![Img](data:image/png;base64,aaa)',
    )
    expect(result.link_urls).toEqual([])
    expect(result.image_urls).toEqual([])
  })
})
