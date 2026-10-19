import { describe, expect, it } from 'vitest'
import extractMarkdown from './index.mts'

describe('extractMarkdown', () => {
  it('maps extracted link and image urls to snake_case fields', async () => {
    const result = await extractMarkdown(
      'Check [Voucha](https://voucha.com) ![Logo](https://voucha.com/logo.png)',
    )
    expect(result.link_urls).toEqual(['https://voucha.com'])
    expect(result.image_urls).toEqual(['https://voucha.com/logo.png'])
  })

  it('returns empty arrays when no markdown content is provided', async () => {
    expect(await extractMarkdown('')).toEqual({ link_urls: [], image_urls: [] })
    expect(await extractMarkdown(null)).toEqual({ link_urls: [], image_urls: [] })
  })
})
