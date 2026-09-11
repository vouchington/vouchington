import { describe, expect, it } from 'vitest'

import { BLACKLISTS } from './sources-constants.mts'

describe('BLACKLISTS', () => {
  it('contains at least one source', () => {
    expect(BLACKLISTS.length).toBeGreaterThan(0)
  })

  it('uses unique source names', () => {
    expect(new Set(BLACKLISTS.map(source => source.name)).size).toBe(BLACKLISTS.length)
  })

  it('uses unique source URLs', () => {
    expect(new Set(BLACKLISTS.map(source => source.url)).size).toBe(BLACKLISTS.length)
  })

  it('uses valid HTTPS source URLs', () => {
    for (const source of BLACKLISTS) {
      expect(new URL(source.url).protocol).toBe('https:')
    }
  })

  it('uses raw GitHub URLs for BlocklistProject no-IP lists', () => {
    const blocklistProjectSources = BLACKLISTS.filter(source =>
      source.name.startsWith('blocklistproject-'),
    )

    expect(blocklistProjectSources.length).toBeGreaterThan(0)
    for (const source of blocklistProjectSources) {
      expect(source.url).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/blocklistproject\/Lists\/main\/alt-version\/.+-nl\.txt$/,
      )
      expect(source.url).not.toContain('blocklistproject.github.io')
    }
  })
})
