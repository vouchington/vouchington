import { describe, expect, it } from 'vitest'
import { NO_VARY_SEARCH_PARAM_NAMES, normalizeCacheUrl } from './cache-no-vary-search.mts'

describe('normalizeCacheUrl', () => {
  it('strips every named marketing/tracking param', () => {
    const withAllParams = NO_VARY_SEARCH_PARAM_NAMES.map(name => `${name}=x`).join('&')
    expect(normalizeCacheUrl(`https://voucha.ai/posts?${withAllParams}&q=cards`)).toBe(
      'https://voucha.ai/posts?q=cards',
    )
  })

  it('strips _rsc separately from the tracking-param list (redundant with props.isRsc)', () => {
    expect(normalizeCacheUrl('https://voucha.ai/posts?_rsc=abc123&q=cards')).toBe(
      'https://voucha.ai/posts?q=cards',
    )
  })

  it('sorts remaining params so key order never fragments the cache', () => {
    expect(normalizeCacheUrl('https://voucha.ai/posts?b=2&a=1')).toBe(
      'https://voucha.ai/posts?a=1&b=2',
    )
  })

  it('leaves a URL with no query string unchanged', () => {
    expect(normalizeCacheUrl('https://voucha.ai/posts')).toBe('https://voucha.ai/posts')
  })

  it('combines tracking-param stripping, _rsc stripping, and sorting in one pass', () => {
    expect(
      normalizeCacheUrl('https://voucha.ai/posts?utm_source=newsletter&b=2&_rsc=abc&a=1'),
    ).toBe('https://voucha.ai/posts?a=1&b=2')
  })
})
