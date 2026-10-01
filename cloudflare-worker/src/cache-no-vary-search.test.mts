import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NO_VARY_SEARCH_PARAM_NAMES, normalizeCacheUrl } from './cache-no-vary-search.mts'

const SPECULATION_NO_VARY_HEADER_FILE = join(
  import.meta.dirname,
  '../../web/lib/seo/navigation-performance.ts',
)

function speculationNoVaryParamNames(): string[] {
  const source = readFileSync(SPECULATION_NO_VARY_HEADER_FILE, 'utf8')
  const declaration = source.match(
    /export const NO_VARY_SEARCH_HEADER =\s*'params=\(([^)]*)\), key-order'/,
  )
  const params = declaration?.[1]
  if (!params) {
    throw new Error(
      'NO_VARY_SEARCH_HEADER must stay a single-quoted params=(...), key-order literal',
    )
  }
  return Array.from(params.matchAll(/"([^"]+)"/g), match => match[1] ?? '')
}

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

  it('uses the same param names as web speculation-rules expects_no_vary_search', () => {
    expect(speculationNoVaryParamNames()).toEqual([...NO_VARY_SEARCH_PARAM_NAMES])
  })

  it('strips high-cardinality ad click ids while preserving content params', () => {
    expect(
      normalizeCacheUrl(
        'https://voucha.ai/posts?srsltid=unique&q=cards&gbraid=g&wbraid=w&dclid=d&ttclid=t&twclid=x&igshid=i&igsh=s&_gl=linker&after=cursor',
      ),
    ).toBe('https://voucha.ai/posts?after=cursor&q=cards')
  })
})
